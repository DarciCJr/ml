const API = 'https://api.mercadolibre.com';
const testes = document.getElementById('testes');
const veredito = document.getElementById('veredito');

const linha = (nome) => {
  const el = document.createElement('div');
  el.className = 'teste';
  el.innerHTML = `<span class="t-nome">${nome}</span><span class="t-res">testando…</span>`;
  testes.appendChild(el);
  return el.querySelector('.t-res');
};

async function testar(nome, path, opcoes = {}) {
  const alvo = linha(nome);
  const inicio = Date.now();
  try {
    const res = await fetch(`${API}${path}`, { headers: opcoes.headers || { accept: 'application/json' } });
    const ms = Date.now() - inicio;
    let amostra = '';
    try {
      const j = await res.json();
      const arr = Array.isArray(j) ? j : (j.results || j.content || []);
      amostra = Array.isArray(arr) && arr.length
        ? ` — ${arr.length} itens, ex.: ${(arr[0].title || arr[0].name || arr[0].id || '').toString().slice(0, 40)}`
        : (j.message ? ` — ${j.message}` : '');
    } catch { /* corpo não-JSON */ }

    if (res.ok) {
      alvo.innerHTML = `<b class="verde">FUNCIONOU</b> (${res.status}, ${ms}ms)${amostra}`;
      return { ok: true, status: res.status };
    }
    alvo.innerHTML = `<b class="amarelo">RECUSOU</b> (${res.status})${amostra}`;
    return { ok: false, status: res.status };
  } catch (err) {
    alvo.innerHTML = `<b class="vermelho">BLOQUEADO</b> — ${err.name}: ${err.message}`;
    return { ok: false, status: 0, rede: true };
  }
}

(async () => {
  const r = {};
  r.busca      = await testar('Buscar produtos (público)', '/sites/MLB/search?q=celular&limit=3');
  r.categorias = await testar('Listar categorias',         '/sites/MLB/categories');
  r.item       = await testar('Consultar um produto',      '/items/MLB1234567890');
  r.destaques  = await testar('Mais vendidos (highlights)','/highlights/MLB/category/MLB1051');

  // Se já há token guardado, testa as duas formas de autenticar: o cabeçalho
  // Authorization (dispara preflight de CORS) e o token na URL (não dispara).
  let t = null;
  try { t = JSON.parse(localStorage.getItem('ml_tokens')); } catch { /* ignora */ }
  if (t?.access_token) {
    testes.insertAdjacentHTML('beforeend',
      '<p class="warn" style="margin-top:18px">Com o token que já está salvo neste navegador:</p>');
    r.cabecalho = await testar('Autenticado via cabeçalho', '/sites/MLB/search?q=celular&limit=3',
      { headers: { accept: 'application/json', Authorization: `Bearer ${t.access_token}` } });
    r.url = await testar('Autenticado via URL',
      `/sites/MLB/search?q=celular&limit=3&access_token=${encodeURIComponent(t.access_token)}`);
  }

  let titulo, texto, cor;
  if (r.url?.ok && !r.cabecalho?.ok) {
    titulo = '4 — Funciona, mas só com o token na URL';
    texto = 'O cabeçalho Authorization é barrado pelo preflight do CORS, e o token ' +
      'na URL passa. A página já tenta as duas formas e guarda a que funcionar, ' +
      'então a listagem deve funcionar.';
    cor = 'ok';
  } else if (r.cabecalho?.ok || r.url?.ok) {
    titulo = '5 — Autenticado, funcionando';
    texto = 'A consulta autenticada respondeu. A tela de produtos deve listar normalmente.';
    cor = 'ok';
  } else if (t?.access_token && (r.cabecalho?.rede && r.url?.rede)) {
    titulo = '6 — O navegador não consegue consultar autenticado';
    texto = 'Nem o cabeçalho nem o token na URL passaram. Não há como consultar ' +
      'direto do navegador: é preciso um intermediário (um servidor gratuito).';
    cor = 'err';
  } else if (t?.access_token) {
    const st = r.url?.status || r.cabecalho?.status;
    titulo = `7 — O token foi recusado (HTTP ${st})`;
    texto = 'A conexão chega ao Mercado Livre, mas ele recusa o token. Pode estar ' +
      'expirado, ou a aplicação não tem permissão para este recurso.';
    cor = 'err';
  } else
  if (r.busca.ok) {
    titulo = '1 — Funciona sem login';
    texto = 'O navegador conversa com a API e a busca é pública. A tela de produtos ' +
      'deve listar normalmente. Se ela não estiver listando, o problema é outro e ' +
      'este diagnóstico já descarta CORS e bloqueio de rede.';
    cor = 'ok';
  } else if (r.busca.rede) {
    titulo = '3 — O navegador bloqueia (CORS)';
    texto = 'A chamada nem chegou a receber resposta. O Mercado Livre não permite ' +
      'consulta direto do navegador a partir de outro site. Nenhuma página no GitHub ' +
      'Pages resolve isso — é preciso um intermediário (um servidor gratuito).';
    cor = 'err';
  } else {
    titulo = `2 — A API exige login (HTTP ${r.busca.status})`;
    texto = 'O navegador alcança o Mercado Livre, mas ele recusa sem autenticação. ' +
      'O caminho é conectar a conta na tela principal, com App ID e Chave secreta.';
    cor = 'err';
  }

  veredito.innerHTML = `<div class="box ${cor}"><strong>Resultado: ${titulo}</strong>
    <p style="margin:8px 0 0">${texto}</p></div>`;

  const resumo = Object.entries(r)
    .map(([k, v]) => `${k}=${v.rede ? 'BLOQUEADO' : v.status}`).join('  ');
  veredito.insertAdjacentHTML('beforeend',
    `<p class="warn">Para me mandar: <code>${resumo}</code>
     &nbsp;<button id="copiar" class="secundario">Copiar</button></p>`);
  document.getElementById('copiar').addEventListener('click', (e) => {
    navigator.clipboard.writeText(resumo);
    e.target.textContent = 'Copiado!';
  });
})();
