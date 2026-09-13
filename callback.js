// Troca o code por tokens automaticamente e devolve o usuário à tela de produtos.
const qs = new URLSearchParams(location.search);
const statusEl = document.getElementById('status');
const pkce = JSON.parse(sessionStorage.getItem('ml_pkce') || '{}');

const falhar = (html) => {
  statusEl.className = 'box err';
  statusEl.innerHTML = `${html}<p><a href="./">&larr; Voltar</a></p>`;
};

/** Plano B: o usuário roda o curl e cola a resposta. */
function mostrarManual(code) {
  const c = ML.creds.obter() || {};
  const linhas = [
    "curl -X POST 'https://api.mercadolibre.com/oauth/token' \\",
    "  -H 'accept: application/json' \\",
    "  -H 'content-type: application/x-www-form-urlencoded' \\",
    "  -d 'grant_type=authorization_code' \\",
    `  -d 'client_id=${c.clientId || 'SEU_APP_ID'}' \\`,
    `  -d 'client_secret=${'SUA_CHAVE_SECRETA'}' \\`,
    `  -d 'code=${code}' \\`,
    `  -d 'redirect_uri=${ML.REDIRECT}'`
  ];
  if (pkce.verifier) {
    linhas[linhas.length - 1] += ' \\';
    linhas.push(`  -d 'code_verifier=${pkce.verifier}'`);
  }
  document.getElementById('curl').textContent = linhas.join('\n');
  document.getElementById('manual').hidden = false;

  document.getElementById('copiarCurl').addEventListener('click', (e) => {
    navigator.clipboard.writeText(document.getElementById('curl').textContent);
    e.target.textContent = 'Copiado!';
  });
  document.getElementById('salvarManual').addEventListener('click', () => {
    try {
      const resp = JSON.parse(document.getElementById('respostaJson').value.trim());
      if (!resp.access_token) throw new Error('sem access_token');
      ML.tokens.salvar(resp);
      location.replace('./');
    } catch {
      alert('Não consegui ler a resposta. Cole o JSON completo devolvido pelo comando.');
    }
  });
}

(async () => {
  const erro = qs.get('error');
  const code = qs.get('code');

  if (erro) return falhar(`Autorização negada pelo Mercado Livre: <code>${erro}</code>`);
  if (!code) return falhar('Nenhum código recebido. Recomece pela tela inicial.');
  if (pkce.state && qs.get('state') !== pkce.state) {
    return falhar('O parâmetro <code>state</code> não confere. Por segurança, refaça a conexão.');
  }

  try {
    await ML.trocarCode(code, pkce.verifier);
    sessionStorage.removeItem('ml_pkce');
    statusEl.className = 'box ok';
    statusEl.textContent = 'Conectado. Carregando seus produtos…';
    location.replace('./');
  } catch (err) {
    if (err instanceof ML.ErroRede) {
      falhar('O navegador bloqueou a troca do código pelo token.');
      return mostrarManual(code);
    }
    falhar(`O Mercado Livre recusou a troca do código: ${err.message}`);
    mostrarManual(code);
  }
})();
