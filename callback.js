const qs = new URLSearchParams(location.search);
const statusEl = document.getElementById('status');
const session = JSON.parse(sessionStorage.getItem('ml_auth') || '{}');

function fail(msg) {
  statusEl.innerHTML = `<div class="box err">${msg}</div>`;
}

const error = qs.get('error');
const code = qs.get('code');

if (error) {
  fail(`Autorização negada: <code>${escapeHtml(error)}</code><br>${escapeHtml(qs.get('error_description') || '')}`);
} else if (!code) {
  fail('Nenhum <code>code</code> recebido. Comece pela <a href="./">página inicial</a>.');
} else if (session.state && qs.get('state') !== session.state) {
  fail('O parâmetro <code>state</code> não confere. Possível CSRF — refaça o fluxo.');
} else {
  statusEl.innerHTML = '<div class="box ok">Autorização concluída com sucesso.</div>';
  document.getElementById('ok').hidden = false;
  document.getElementById('code').value = code;

  const lines = [
    "curl -X POST 'https://api.mercadolibre.com/oauth/token' \\",
    "  -H 'accept: application/json' \\",
    "  -H 'content-type: application/x-www-form-urlencoded' \\",
    "  -d 'grant_type=authorization_code' \\",
    `  -d 'client_id=${session.clientId || 'SEU_CLIENT_ID'}' \\`,
    "  -d 'client_secret=SEU_CLIENT_SECRET' \\",
    `  -d 'code=${code}' \\`,
    `  -d 'redirect_uri=${session.redirectUri || location.href.split('?')[0]}'`
  ];
  if (session.verifier) {
    lines[lines.length - 1] += ' \\';
    lines.push(`  -d 'code_verifier=${session.verifier}'`);
  }
  document.getElementById('curl').textContent = lines.join('\n');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy');
  if (!btn) return;
  const el = document.querySelector(btn.dataset.copy);
  const text = el.value !== undefined ? el.value : el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = old; }, 1500);
  });
});
