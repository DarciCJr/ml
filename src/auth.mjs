// Guarda e renova os tokens do OAuth. O access_token do ML dura ~6h.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const STORE = process.env.ML_TOKEN_FILE || '.ml-tokens.json';
const MARGEM_MS = 10 * 60 * 1000;  // renova 10 min antes de expirar

function ler() {
  if (!existsSync(STORE)) {
    throw new Error(
      `Arquivo ${STORE} não existe.\n` +
      `Crie-o com a resposta do OAuth:  node src/salvar-token.mjs '<json da resposta>'`
    );
  }
  return JSON.parse(readFileSync(STORE, 'utf8'));
}

function gravar(t) {
  writeFileSync(STORE, JSON.stringify(t, null, 2) + '\n', { mode: 0o600 });
}

export function salvar(resposta) {
  if (!resposta.access_token) throw new Error('Resposta sem access_token.');
  gravar({
    access_token: resposta.access_token,
    refresh_token: resposta.refresh_token ?? null,
    user_id: resposta.user_id ?? null,
    expires_at: Date.now() + (resposta.expires_in ?? 21600) * 1000
  });
}

async function renovar(tokens) {
  const { ML_CLIENT_ID, ML_CLIENT_SECRET } = process.env;
  if (!tokens.refresh_token) {
    throw new Error(
      'Token expirado e sem refresh_token. A aplicação precisa estar marcada como\n' +
      '"offline access" no painel do ML. Refaça a autorização.'
    );
  }
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET) {
    throw new Error('Defina ML_CLIENT_ID e ML_CLIENT_SECRET para renovar o token.');
  }

  const res = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: tokens.refresh_token
    })
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Falha ao renovar token (${res.status}): ${body.message || res.statusText}`);
  }
  salvar(body);
  console.log('[auth] token renovado.');
  return ler();
}

/** Devolve um access_token válido, renovando se necessário. */
export async function tokenValido() {
  let tokens = ler();
  if (Date.now() + MARGEM_MS >= tokens.expires_at) {
    tokens = await renovar(tokens);
  }
  return tokens.access_token;
}

/** Força renovação (usado quando a API devolve 401 mesmo dentro da validade). */
export async function forcarRenovacao() {
  return (await renovar(ler())).access_token;
}
