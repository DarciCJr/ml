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
