# byGrain Studio

Espaço de trabalho privado da byGrain. Versão de teste publicada em **joaovianadop.com/bygrain** até haver acesso ao domínio da Grain.

| O quê | Onde |
|---|---|
| Studio | `/bygrain/` |
| Tarefas no telemóvel (instalável) | `/bygrain/tasks/` |
| Código-fonte | esta pasta (`_src/bygrain`, fora do site publicado) |
| Código publicado | `bygrain/` na raiz do repositório (gerado por `npm run build`) |
| Base de dados, contas, ficheiros | Supabase, projeto **byGrain** (`ppovjdyrhdfedjcdnnol`, eu-west-1), separado do BlackCat |

## Publicar uma alteração

```
cd _src/bygrain
npm install
npm run build      # escreve em ../../bygrain
```
Depois é só fazer commit e push para `main`: a Cloudflare publica sozinha.

## Contas e papéis

- **Administrador:** gere contas e papéis em "Equipa e permissões".
- **Membro:** vê todos os projetos, a Central de Produção e as tarefas.
- **Convidado:** só vê os projetos para os quais foi convidado.
- Entra-se com **email ou nome de utilizador**.
- Convidados entram com email + código de convite (aleatório, uma só utilização, 14 dias), gerado dentro de cada projeto em "Equipa e convites". No primeiro acesso criam a palavra-passe.
- O Supabase exige 6+ caracteres; a app junta sempre o prefixo `bygrain:` à palavra-passe (`authPw` em `src/lib.js`) para aceitar palavras-passe curtas na fase de teste.

Conta de demonstração: `rubenmendes` / `1234` (administrador).

## Migrar para o domínio da Grain

1. Em `vite.config.js`, mudar `base` para `/` (ou o caminho final) e `outDir` para onde o site deles for publicado.
2. Em `src/lib.js`, `BASE` e os caminhos dos manifestos e do `sw.js` (`public/`).
3. No Supabase: Authentication › URL Configuration, juntar o novo domínio às Redirect URLs (recuperar palavra-passe).
4. Se quiserem a base de dados numa conta Supabase da própria Grain: exportar com `pg_dump` e copiar o bucket `files`.
