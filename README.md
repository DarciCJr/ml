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

## Área restrita (`vantagens.html`)

Página sobre as vantagens da API para trabalho com afiliados, protegida por senha.

Como o GitHub Pages é estático, não existe servidor para validar senha — uma
checagem em JavaScript seria contornada em segundos com "ver código-fonte".
Por isso o conteúdo é **criptografado** (PBKDF2-SHA256, 310.000 iterações →
AES-256-GCM) e publicado apenas como texto cifrado em `vantagens.enc.json`.
Sem a senha não há texto a ler, nem no código-fonte.

O texto em claro fica em `content/`, que está no `.gitignore` e **não deve ser
versionado** enquanto o repositório for público.

Para editar o conteúdo e republicar:

```bash
node build/encrypt.mjs 'SUA_SENHA' content/vantagens.inner.html vantagens.enc.json
```

Trocar a senha é só rodar o comando acima com a nova — o payload é regerado.
