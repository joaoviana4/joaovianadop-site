# PØRTAL STUDIØ

Hub de pré-produção, produção e pós-produção. Faz parte do mesmo ecossistema do **Viewfinder** (app Android de storyboard) e do **Lighthouse** (app Android de mapas de luz, que deixa de ser precisa). As três usam as mesmas contas e os mesmos projetos.

Estado: primeira versão, em teste. Por agora só tu entras.
Última atualização deste documento: 14 out 2026.

---

## Onde está

| O quê | Onde |
|---|---|
| A app | **joaovianadop.com/studio** (fora dos motores de busca) |
| Código publicado | Repositório `joaoviana4/joaovianadop-site`, pasta `studio/`. A Cloudflare publica sozinha a cada envio |
| Código-fonte | Projeto Vite: `src/main.js` (a app toda), `src/style.css` (visual), `public/` (ícones, manifesto, service worker) |
| Base de dados e contas | Supabase, projeto **BlackCat** (`cwdjpcebyhwcdwwwazev`, região eu-west-1) |
| Imagens | Supabase Storage, bucket `photos`, na pasta da conta: `<utilizador>/<projeto>/hub/…`, comprimidas em WebP |
| Guiões e tratamentos | Supabase Storage, bucket privado `scripts`, na pasta da conta: `<utilizador>/<projeto>/docs/…` (até 50 MB por ficheiro) |

Instala-se como app no Chrome ou no Edge ("Instalar"): abre numa janela própria, com o ícone Ø.

---

## Decisões tomadas

- **Web app primeiro.** Funciona em qualquer computador sem instalar nada e atualiza-se num só sítio. Se mais tarde for preciso acesso a pastas do computador ou trabalho sem rede durante dias, embrulha-se o mesmo código com Tauri para Windows.
- **Um projeto de cada vez.** Dentro de um projeto não há atalhos para os outros.
- **Um só storyboard por projeto.** Os planos existem num só sítio. O que se muda num plano aparece igual na cena, no storyboard e na planificação.
- **Os mapas de luz passam para o Studio.** O Lighthouse deixa de ser preciso. Os mapas que já lá existiam foram copiados, e os originais não foram mexidos.
- **O Viewfinder continua a ser a fonte das fotos de storyboard.** Cada foto entra sozinha no plano com o mesmo número.
- **O guião é guardado.** O ficheiro original e o texto lido ficam na base de dados, com versões. A versão em uso é a mesma que alimenta as cenas e a análise de adereços.
- **A análise de adereços com IA é grátis, feita no Claude.** A app prepara o pedido, tu colas no Claude e trazes a resposta. A opção automática com chave paga da Anthropic foi retirada da interface.
- **Boards em ecrã inteiro**, à maneira do Milanote e do Miro.
- **Visual:** brand guidelines PØRTAL. Archivo na interface, Archivo Expanded nos títulos, Courier Prime no guião, português europeu com "tu", sem pontos de exclamação. As guidelines pedem um só azul por ecrã; as cores de estado e de departamento somam-se a esse azul, a teu pedido.
- **Vídeo para a pós:** o MyAirBridge não serve, porque não tem forma de outra app lhe enviar ou ir buscar ficheiros. A sugestão é o **Cloudflare R2** (10 GB grátis, sem custo de visualização), com o **Cloudflare Stream** como alternativa (a partir de 5 $/mês). Ainda não foi feito.

---

## O que existe

### Página inicial
- Lista de projetos com capa, tipo, contagens, barra das três fases e tarefas por fazer.
- **Capa personalizável:** em "Mudar capa" escolhes uma imagem; "Automática" volta à primeira foto do Viewfinder.
- **Separadores** Em curso, Finalizados e Arquivo. Arquivar não apaga nada.
- **Grupos de projetos:** no "⋯" de cada projeto escreves o grupo (Clientes, Pessoais, 2026…).
- **Novo projeto:** nome, tipo e formato. O projeto aparece também no Viewfinder e no Lighthouse.

### Tipos de projeto

| Tipo | Começa por | Unidades | Pessoas | Espaços | Páginas de base |
|---|---|---|---|---|---|
| **Ficção** (curta, longa, série) | Guião importado | Cenas | Personagens | Décors | — |
| **Publicidade** (spot, branded, redes) | Brief e tratamento | Momentos do spot | Casting | Locais | Brief, Tratamento, Aprovações |
| **Documentário** | Tratamento | Sequências | Protagonistas | Locais | Tratamento, Arquivo |
| **Videoclipe** | Tratamento e música | Secções da música, com início e fim | Artista e elenco | Locais | Tratamento |

Nos três tipos que não são ficção, as unidades, as pessoas e os espaços criam-se à mão. Cada unidade nova passa também para o Viewfinder e para o Lighthouse.

### Topo do projeto
- Barra de progresso das três fases (Pré-produção, Produção, Pós-produção), preenchida até hoje pelas datas de cada fase. As datas mudam-se em "Datas".

### Guião (ficção)
- **Importa** PDF, Fountain, Final Draft (.fdx) e texto colado.
- **Separa automaticamente:**
  - cenas (cabeçalho, interior ou exterior, momento do dia, décor, personagens, páginas em oitavos);
  - personagens, com o ator ou atriz;
  - décors, com as cenas e as páginas de cada um.
- Num projeto sem cenas, as cenas importadas passam também para o Lighthouse e o Viewfinder. Num projeto que já tinha cenas, ficam ligadas pelo número, com os planos e os mapas de luz. Se o número de cenas não bater certo, a app avisa.
- **Guardado na base de dados:**
  - o ficheiro original vai para o bucket `scripts`;
  - o texto lido vai para a tabela `hub_documents`;
  - cada importação nova é uma versão (v1, v2…).
- **"Ficheiros do guião"**, por cima da lista de cenas: as versões, com "Abrir original" e "Usar esta versão" para voltar a uma anterior.
- **Projetos com o guião só do Lighthouse:** aparece um aviso a explicar que o Lighthouse só guardou os cabeçalhos e as personagens, com um botão para importar o ficheiro uma vez.
  - É o caso do **DOIS TEMPOS**, que entretanto já foi importado (12 cenas).

### Tratamentos, briefs e outros documentos (publicidade, documentário, videoclipe)
- Em cada página de base há **"Juntar ficheiro"**: PDF, Word, PowerPoint, imagens e texto, até 50 MB.
- Cada ficheiro novo é uma versão, e há "Marcar como atual" e "Abrir original".
- O texto de PDFs e ficheiros de texto também é guardado, para poder ser analisado mais tarde.

### Páginas de cena, personagem e décor
- **Cena (ou momento, sequência, secção):**
  - os **planos em colunas**, com o storyboard em grande;
  - por baixo, o texto da cena (fechado), os adereços, as tarefas e notas personalizáveis.
- **Personagem:**
  - ator ou atriz, onde entra e os adereços com que interage;
  - blocos próprios de cada tipo. Ficção: descrição, guarda-roupa, caracterização. Documentário: contacto, autorização de imagem, guião da entrevista.
- **Décor:**
  - onde entra;
  - ficha (morada, contacto, estacionamento, eletricidade, luz natural);
  - fotos de repérage e mapas de luz da montagem base;
  - adereços de cenário.
- Nas três há blocos "Mais informação": nota, lista, campos, imagens e ligação. Mudas-lhes o nome, ordenas e tiras os que não precisas.

### Planos
- **Na coluna de cada plano:**
  - storyboard;
  - enquadramento e movimento;
  - lente e objetivas;
  - descrição;
  - pré-visualização pequena do mapa de luz, só se já existir;
  - resumo de referências, modelos 3D, notas e tarefas.
- **Dados do Viewfinder automáticos:** lente, objetivas, câmara e formato entram sozinhos, marcados "do Viewfinder". Se mudares à mão, fica o teu valor.
- **Plano em página inteira:**
  - storyboard em grande, com miniaturas das fotos do Viewfinder e das imagens que juntaste;
  - ficha do plano, mapas de luz do plano e tarefas;
  - "Mais neste plano": imagens de referência, texto, informações, lista, modelo 3D (imagens e link), ligação e mapa de luz;
  - ‹ e › passam pelos planos do projeto inteiro; o Esc fecha.
- **Storyboard:** a vista geral de todos os planos, por cena.
- **Planificação:** os mesmos planos em tabela (enquadramento, lente, movimento, descrição).

### Mapas de luz (substituem o Lighthouse)
- **Criar:** "+ Mapa de luz" dentro do plano, ou no décor para a montagem base. O mapa já traz a câmara com o código do plano, as personagens da cena e uma luz principal.
- **Em que plano aparece:** num mapa criado nesse plano, ou que tenha uma câmara com o código do plano (por exemplo "3A").
- **Luzes:** tipo (Fresnel, painel LED, softbox, tubo LED, open face, HMI, prático, sol ou céu, rebatedor, bandeira), modelo, temperatura, intensidade, gelatina, abertura do feixe, notas e direção (automática ou manual). Os feixes frios e quentes têm cores diferentes.
- **Câmaras:** distância focal e sensor (Super 35, full frame, APS-C, Micro 4/3, 65 mm). O enquadramento desenhado corresponde à lente.
- **Décor:** parede, porta, janela, mesa, sofá, cama e cadeira, que se podem rodar.
- **Outros:** escala em metros, duplicar peças, apagar com a tecla Delete, legenda automática, "Exportar imagem" em PNG.
- Abrem numa janela por cima da página.

### Adereços (departamento de Arte)
- **Duas listas:** **de ação** (o que uma personagem manuseia, usa, dá, recebe ou examina) e **de cenário** (mobiliário e decoração que ninguém manuseia).
- Cada adereço tem uma **página própria**, como as cenas, as personagens e os décors:
  - tipo, categoria, estado, quantidade e descrição;
  - em que cenas aparece, com o excerto do guião;
  - **cada interação** com a personagem e a ação (por exemplo "ANTÓNIO · tira a caixa do disco e dá-a a Duarte");
  - notas de continuidade (parte-se, molha-se, fica vazio…);
  - associação a personagens e décors (automática, mas podes juntar ou tirar);
  - referências: imagens e **links para produtos**.
- Juntas e tiras adereços à mão. O que tiraste à mão não volta numa nova análise.
- **Estados com cores:**

  | Estado | Cor |
  |---|---|
  | Por arranjar | vermelho |
  | Em procura | laranja |
  | Encomendado | amarelo |
  | Comprado | verde |
  | Alugado, Emprestado | verde-água |
  | Construído pela arte | violeta |
  | Pronto | verde-escuro |

  - O estado muda-se diretamente na lista.
  - Por cima da tabela há uma barra com a proporção de cada estado e pastilhas que filtram por estado.
- **Ordenar por:**
  - **Cena:** agrupado por cena, com o cabeçalho de cada uma; quem aparece em várias cenas surge em cada uma delas.
  - **Nome (A–Z).**
  - **Estado:** agrupado.
  - **Categoria.**

#### Análise do guião
- **Analisar no Claude (grátis, recomendada).** É a mais completa: percebe pronomes e quem faz o quê com cada objeto. Funciona com a tua conta do Claude e a janela guia-te em três passos:
  1. **Copia o pedido.** Leva o guião e as instruções da análise. Se o browser não deixar copiar sozinho, aparece o texto numa caixa.
  2. **Cola-o numa conversa nova no Claude.** "Abrir o Claude" abre uma conversa nova noutro separador. Espera até aparecer **FIM**.
  3. **Traz a resposta.** Copias a resposta inteira e colas na caixa; a app lê-a sozinha. Também há "Colar o que copiei".
- **Comportamentos da janela:**
  - guiões longos vão em partes, uma por separador, com as cenas de cada parte;
  - se a resposta vier cortada, a app avisa: escreves "continua" ao Claude e colas também a continuação;
  - se colares o pedido por engano, a app diz-te;
  - no fim aparece "A lista de adereços está pronta".
- **Rápida, sem IA:** imediata e grátis, mas só procura objetos comuns e verbos de ação, por isso pode falhar ou apanhar palavras a mais.
- Depois de importar um guião, a app pergunta se queres separar os adereços logo.

### Tarefas
- **Central de tarefas** com filtros por estado, por responsável e por aquilo a que dizem respeito (unidades, pessoas, espaços, planos, adereços, geral).
- Cada cena, personagem, décor, plano e adereço tem as suas tarefas.
- **Responsável:** uma pessoa da equipa ou um departamento. As tarefas de um departamento levam a cor dele.
- **Estado:** Por fazer (neutro) → Em curso (amarelo) → Feita (verde).
- **Prazo e etiquetas:** "atrasada" a vermelho; "hoje" e "amanhã" a laranja; "em N dias" a cinzento.
- **Ordenar por:** urgência (prazo mais próximo primeiro), nome (A–Z) ou estado.
- **Tarefas feitas continuam visíveis:**
  - saem da lista principal e ficam em "Ver as tarefas feitas", com a data em que foram feitas;
  - o mesmo existe dentro de cada cena, personagem e décor.

### Ferramentas por departamento
- **Grupos na barra lateral:** Realização, Produção, Imagem, Arte, Som, Distribuição. São editáveis e o "+" junta ferramentas.
- **Cor de cada departamento**, personalizável: clicas na bolinha ao lado do nome e escolhes uma das cores ou "outra cor".
  - Cores de origem: Realização violeta, Produção laranja, Imagem verde, Arte rosa, Som mostarda, Distribuição petróleo.
  - A cor aparece na barra lateral, no topo das páginas do departamento e nas tarefas atribuídas a ele.
- **Mudar o nome de uma ferramenta:** clicas numa ferramenta que já está aberta, ou fazes duplo clique. Enter ou clicar fora guarda; Esc cancela.
- **Tabela:** em branco, adereços por cena ou elenco.
- **Cronograma:** tarefas sobre as três fases, com a linha de hoje.

### Board (em ecrã inteiro)
- **O ecrã:**
  - **Canto superior esquerdo:** o símbolo PØRTAL STUDIØ e o caminho (projeto / board / board dentro do board), clicável.
  - **Encostar o rato ao lado esquerdo:** aparece a barra com as páginas do projeto; clicar numa sai do board. Também abre a clicar no símbolo.
  - **Lado direito:** barra para juntar Nota, Imagem, Paleta, Lista e Board.
  - **Canto inferior direito:** −, percentagem de zoom (clicar volta a 100 %), + e "Ver tudo".
- **Mover:** arrastar o fundo, a roda do rato ou dois dedos no trackpad.
- **Zoom:** Ctrl + roda do rato ou pinça no trackpad, centrado no rato. Atalhos: Ctrl + e Ctrl − para aproximar e afastar, Ctrl 0 para ver tudo.
- **Tamanho dos cartões:** arrastar o canto inferior direito. As imagens mantêm a proporção; notas, listas e paletas mudam de largura e altura.
- **Imagens arrastadas do computador** ficam onde as largares.
- **Boards dentro de boards;** a tecla Esc sobe um nível.
- Cada board lembra o zoom e a posição em que o deixaste. O espaço não tem limites.

### Orçamento (em todos os projetos)
- Página fixa em Gestão › Orçamento.
- **Orçamento geral do projeto** em cima. A app mostra o total da tabela, quanto sobra ou passa, e o estado: dentro (verde), perto do limite, a partir de 90 % (amarelo), ou fora (vermelho). Há também uma barra com a percentagem gasta.
- **A tabela:**
  - por defeito tem Descrição, Nome, Notas e Valor, com o total no fim;
  - as colunas mudam de nome, de tipo (texto, valor em €, número), de ordem, e podem juntar-se ou tirar-se;
  - há secções com subtotal;
  - as linhas sobem, descem e tiram-se, e o que se tira pode ser desfeito.
- **Modelos:** Simples, Ficção, Videoclipe, Publicidade e Documentário.
- **Importar Excel (.xlsx) ou CSV:**
  - reconhece o cabeçalho, as secções e o orçamento máximo (por exemplo "MAX 8000");
  - ignora os totais do ficheiro, porque a app soma sozinha;
  - podes substituir a tabela atual ou juntar ao fim.
- **Exportar para Excel.**
- O orçamento da Raissa já lá está: 8 045 € para um orçamento de 8 000 €.

### Seguimento (videoclipe)
- A página das secções chama-se Seguimento e mostra a música numa barra, com cada secção à escala do tempo (é preciso a duração e os tempos de cada secção).
- "Partir com as secções habituais" cria Intro, versos, refrões, ponte e Outro de uma vez.
- Em cada secção, "Partir esta secção em" divide-a num momento (por exemplo 0:20). A nova secção leva os mesmos décors e pessoas.
- Cada secção funciona como uma cena: vários décors, atores e figurantes, planos, storyboard, adereços e tarefas. Décors, atores e figurantes têm páginas próprias.

### Conta
- Foto de perfil: no menu da conta, "Pôr foto de perfil" / "Mudar foto de perfil" / "Tirar a foto". Fica guardada na conta, comum às apps.

### Equipa e permissões
- Convidar com nome, email e cargo.
- Permissões por cargo, em quatro áreas: Guião, cenas e storyboard / Mapas de luz / Board, tabelas e cronograma / Equipa. Cada uma fica em Edita, Vê ou sem acesso.

---

## Base de dados (Supabase)

**Tabelas das apps Android, partilhadas:**
- `projects` — projetos (o hub cria-os aqui).
- `scenes` — cenas e unidades, com os itens dos mapas do Lighthouse.
- `photos` — fotos do Viewfinder, com metadados (lente, objetivas, câmara, formato, cena, plano).

**Tabelas só do hub:**
- `hub_projects` — por projeto (inclui também o orçamento, em `budget`):
  - formato, tipo (`kind`), fases e grupos (com a cor de cada departamento);
  - guião lido;
  - páginas de cena, personagem, décor e adereço, com os planos e os mapas de luz (`entities`);
  - permissões, capa e tarefas (com a data em que foram feitas);
  - grupo na página inicial (`home_group`) e estado (`status`);
  - adereços (`props`) e adereços tirados à mão (`props_removed`).
- `hub_pages` — ferramentas dos departamentos (board, tabela, cronograma, mapa).
- `hub_members` — equipa de cada projeto.
- `hub_documents` — guiões, tratamentos e outros documentos: nome, caminho do ficheiro original no bucket `scripts`, texto lido, versão, página a que pertence e qual está em uso.
- `hub_ai_keys` — chave da API da Anthropic de cada conta. Só o servidor a lê. Deixou de ser usada desde que a análise passou para o Claude.

**Função no servidor:** `analyze-props` (Supabase Edge Function) — análise automática com a API da Anthropic. Continua instalada mas já não aparece na app.

Todas as tabelas têm regras de acesso (RLS): cada pessoa só vê o que é seu.

---

## Custos

- **Agora:** zero.
  - Supabase no plano gratuito: 500 MB de base de dados e 1 GB de ficheiros; o projeto entra em pausa após uma semana sem uso.
  - Alojamento na Cloudflare gratuito, e o domínio já estava pago.
  - Análise de adereços feita no Claude, com a tua conta, sem custo extra.
- **Quando a equipa usar a sério:** Supabase Pro, 25 $/mês (sem pausas, backups diários, 100 GB de ficheiros).
- **Vídeo (se avançar):** R2 grátis até 10 GB, ou Stream a partir de 5 $/mês.
- **Alternativas de IA que ficaram de lado:**
  - **API da Anthropic, automática:** paga por análise, uns cêntimos numa curta.
  - **Gemini, plano gratuito:** a Google pode usar os dados enviados, o que não serve para guiões por estrear.

---

## O que falta

- **Convites a sério:**
  - enviar o email do convite;
  - deixar os convidados entrar nos projetos. Isto mexe nas regras de acesso, também nas tabelas das apps Android, e faz-se em conjunto.
- **Pós-produção:** upload de vídeo (R2 ou Stream), versões e notas presas ao timecode.
- **Guião:** personagens que só aparecem na ação, sem falar.
- **Adereços:** isqueiro e pente do DOIS TEMPOS (implícitos no guião, cenas 6, 8 e 9) por juntar à mão, se quiseres.
- **Board:** setas e ligações entre cartões, texto solto e títulos de secção, selecionar vários cartões de uma vez.
- **Mapas de luz:** paredes desenhadas ponto a ponto e rodar peças arrastando com o rato.
- **Tipo de projeto:** mudar o tipo depois de criado.
- **Unidades tiradas no hub** (secções, momentos, sequências) continuam a aparecer no Viewfinder.
- **Desenhos 3D:** por agora são imagens e links; não há visualizador de modelos.
- **Versão em inglês:** as guidelines pedem tudo nas duas línguas; ainda está só em português.
- **Chave da Anthropic:** se chegaste a ligar uma, continua guardada no servidor; pode ser apagada.
- **App de Windows (Tauri)**, se vier a ser precisa.
