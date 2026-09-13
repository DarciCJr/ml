# Teste OAuth — API do Mercado Livre

Site estático (GitHub Pages) para servir de `redirect_uri` na autenticação
OAuth 2.0 do [Mercado Livre](https://developers.mercadolivre.com.br/pt_br/api-docs-pt-br).

## Publicar no GitHub Pages

Settings → Pages → **Source: Deploy from a branch** → branch `main` (ou a branch
deste código), pasta `/ (root)` → Save.

URLs resultantes:

| | |
|---|---|
| Home | `https://darcicjr.github.io/ml/` |
| Redirect URI | `https://darcicjr.github.io/ml/callback.html` |

## Configurar a aplicação no Mercado Livre

1. Acesse **Minhas aplicações** no painel de desenvolvedores.
2. Em *URI de redirect*, cole exatamente a Redirect URI acima (HTTPS obrigatório).
3. Anote o **App ID** (`client_id`) e a **Secret Key** (`client_secret`).

## Fluxo

1. Abra a home, informe o App ID e clique em **Autorizar**.
2. Faça login e autorize; o ML redireciona para `callback.html?code=...`.
3. A página valida o `state` e monta o `curl` de troca do code por token.
4. Rode o `curl` no seu terminal com o `client_secret`.

O `code` expira em poucos minutos e é de uso único.

## Testando a API

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" https://api.mercadolibre.com/users/me
```

Renovando o token (o `refresh_token` só vem se a app estiver marcada como
*offline access*):

```bash
curl -X POST 'https://api.mercadolibre.com/oauth/token' \
  -H 'accept: application/json' \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'grant_type=refresh_token' \
  -d 'client_id=SEU_CLIENT_ID' \
  -d 'client_secret=SEU_CLIENT_SECRET' \
  -d 'refresh_token=SEU_REFRESH_TOKEN'
```

## Segurança

O `client_secret` **nunca** deve ser colocado em código de frontend — num site
estático ele fica visível para qualquer visitante. Por isso a troca do code por
token acontece no seu terminal, não no navegador. Esta página não tem backend e
não envia nada para lugar nenhum: `client_id` fica em `localStorage` e o
`state`/`code_verifier` (PKCE) em `sessionStorage`, apenas no seu navegador.

Para uso em produção, a troca do code por token precisa de um backend
(ex.: uma função serverless) guardando o secret em variável de ambiente.

## Área restrita — senha em todas as páginas

Todas as páginas do site (`index`, `callback`, `vantagens`) são publicadas apenas
como **conteúdo cifrado** (`*.enc.json`). Os arquivos `.html` são cascas vazias;
`gate.js` pede a senha, deriva a chave (PBKDF2-SHA256, 310.000 iterações),
descriptografa (AES-256-GCM) e só então injeta o conteúdo e carrega o script da
página.

Sem a senha não existe conteúdo a ler — nem no "ver código-fonte". A senha fica
em `sessionStorage` durante a aba, então o redirect do OAuth não pede de novo.

O texto em claro fica em `content/`, que está no `.gitignore` e **não deve ser
versionado** enquanto o repositório for público.

Editar o conteúdo e republicar:

```bash
# edite os arquivos em content/, depois:
build/all.sh 'SUA_SENHA'
git add -A && git commit -m "atualiza conteúdo" && git push
```

Trocar a senha é rodar o mesmo comando com a nova.

## Listar mais vendidos

```bash
export ML_TOKEN='APP_USR-...'          # token obtido no fluxo OAuth
node scripts/mais-vendidos.mjs         # lista as categorias
node scripts/mais-vendidos.mjs MLB1051 # destaques da categoria
node scripts/mais-vendidos.mjs MLB1051 --json
```

Usa `/highlights/{site}/category/{id}`, o endpoint oficial de destaques. A busca
comum (`/sites/MLB/search`) **não** aceita ordenação por quantidade vendida.

## Tela de produtos (a página principal)

Fluxo completo no navegador, sem precisar rodar nada:

1. Na primeira vez, informe o **App ID** e a **Secret Key** do painel do ML
   (mais o seu identificador de afiliado, se tiver).
2. Clique em conectar e autorize na tela do Mercado Livre.
3. A página troca o código pelo token sozinha e já lista os produtos.

A partir daí é só escolher a categoria ou buscar por palavra. Cada produto traz
o link de afiliado pronto, com botão de copiar; dá para copiar todos de uma vez
ou baixar CSV.

O token dura ~6h e **se renova sozinho** pelo `refresh_token`. Credenciais e
tokens ficam apenas no `localStorage` do seu navegador e são enviados só para a
API do Mercado Livre.

> **Sobre guardar a Secret Key no navegador:** é o que permite renovar o token
> sem intervenção. Ela não vai para o GitHub nem para servidor nenhum, mas fica
> legível para quem tiver acesso ao seu navegador e à senha da página. Se
> preferir não correr esse risco, use o job abaixo num servidor — lá o segredo
> fica em variável de ambiente. A chave é revogável no painel do ML.

**Depende de o Mercado Livre permitir chamadas de outro domínio (CORS).** Se o
navegador bloquear, a página avisa com todas as letras e o caminho passa a ser
o job abaixo.

## Job de sincronização

Busca produtos pelas regras, filtra por qualidade e grava num SQLite
(`produtos.db`). Sem dependências externas — usa o SQLite embutido no Node 22.

### 1. Credenciais

```bash
cp .env.exemplo .env          # preencha ML_CLIENT_ID e ML_CLIENT_SECRET
set -a && source .env && set +a

# grave a resposta do /oauth/token (a que o curl do callback devolveu):
node src/salvar-token.mjs '{"access_token":"APP_USR-...","refresh_token":"TG-...","expires_in":21600}'
```

O `access_token` dura ~6h; o job renova sozinho pelo `refresh_token` dez minutos
antes de expirar, e também se a API devolver 401. `.ml-tokens.json` e `.env`
estão no `.gitignore`.

### 2. Regras

Edite `regras.json`. Cada regra é `destaques` (mais vendidos da categoria) ou
`busca` (filtros da busca do ML), mais filtros de qualidade aplicados localmente:

| filtro | efeito |
|---|---|
| `preco_max` / `preco_min` | faixa de preço |
| `vendidos_min` | mínimo de unidades vendidas |
| `estoque_min` | estoque mínimo |
| `frete_gratis` | só com frete grátis |
| `nivel_vendedor_min` | `bronze`, `silver`, `gold`, `platinum` |

Itens pausados ou sem estoque são sempre descartados.

Preencha `afiliado_id` para que os links já saiam com seu identificador.

### 3. Rodar

```bash
npm run sync          # uma vez
npm run sync:loop     # de hora em hora, em primeiro plano
```

Agendado de verdade — systemd (Linux):

```bash
cp ml-sync.{service,timer} ~/.config/systemd/user/
systemctl --user enable --now ml-sync.timer
systemctl --user list-timers ml-sync.timer
```

Ou cron:

```cron
0 * * * * cd ~/ml && /usr/bin/node src/sync.mjs >> sync.log 2>&1
```

### 4. Consultar

```bash
npm run listar                     # disponíveis, mais vendidos primeiro
node src/listar.mjs --regra celu   # filtra por regra
npm run quedas                     # quem baixou de preço (usa o histórico)
npm run execucoes                  # histórico do job, com erros
node src/listar.mjs --json         # para alimentar seu site
```

### O que o banco guarda

- `produtos` — item, preço, estoque, vendas, nível do vendedor, links. A flag
  `disponivel` vira `0` quando o produto para de aparecer, em vez de apagar o
  registro: o histórico é preservado e suas páginas escondem o que saiu do ar.
- `precos` — uma linha por mudança de preço, que é o que alimenta `--quedas`.
- `execucoes` — quando rodou, o que mudou e o erro, se houve.

### Cuidados embutidos

Pausa entre chamadas e backoff exponencial em 429/5xx, lotes de 20 no `/items`
(limite do endpoint), cache de vendedor por execução e renovação automática de
token. A tabela `execucoes` registra falhas em vez de deixá-las silenciosas.
