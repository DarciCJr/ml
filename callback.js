// Troca o code por tokens automaticamente e devolve o usuário à tela de produtos.
const qs = new URLSearchParams(location.search);
const statusEl = document.getElementById('status');
const pkce = JSON.parse(sessionStorage.getItem('ml_pkce') || '{}');

const falhar = (html) => {
  statusEl.className = 'box err';
  statusEl.innerHTML = `${html}<p><a href="./">&larr; Voltar</a></p>`;
};

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
      return falhar(
        'O navegador bloqueou a chamada à API do Mercado Livre (CORS).<br>' +
        'A troca do código pelo token não pôde ser feita aqui.'
      );
    }
    falhar(`Falha ao obter o token: ${err.message}`);
  }
})();
