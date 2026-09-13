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
    const tk = encodeURIComponent(t.access_token);
    const comToken = (p) => `${p}${p.includes('?') ? '&' : '?'}access_token=${tk}`;

    testes.insertAdjacentHTML('beforeend',
      '<p class="warn" style="margin-top:18px">Com o token salvo, qual endpoint sua aplicação pode usar:</p>');

    r.cabecalho = await testar('Cabeçalho Authorization', '/sites/MLB/search?q=celular&limit=3',
      { headers: { accept: 'application/json', Authorization: `Bearer ${t.access_token}` } });
    r.url = await testar('Token na URL (busca)', comToken('/sites/MLB/search?q=celular&limit=3'));
    r.quemSou   = await testar('Minha conta', comToken('/users/me'));
    r.cats      = await testar('Categorias', comToken('/sites/MLB/categories'));
    r.catDetalhe= await testar('Detalhe de categoria', comToken('/categories/MLB1051'));
    r.destaques2= await testar('Mais vendidos', comToken('/highlights/MLB/category/MLB1051'));
    r.tendencias= await testar('Tendências de busca', comToken('/trends/MLB'));
    r.catalogo  = await testar('Catálogo de produtos', comToken('/products/search?site_id=MLB&status=active&q=celular'));
    r.dominio   = await testar('Descoberta por domínio', comToken('/sites/MLB/domain_discovery/search?q=celular'));
    if (t.user_id) {
      r.meusItens = await testar('Meus anúncios', comToken(`/users/${t.user_id}/items/search`));
    }

    // O teste anterior usava um ID inventado, o que torna o resultado inútil.
    // Pega um item real dos destaques e testa os endpoints que a listagem usa.
    let idReal = null;
    try {
      const h = await (await fetch(`${API}${comToken('/highlights/MLB/category/MLB1051')}`)).json();
      idReal = (h.content || []).find((x) => x.type === 'ITEM')?.id || null;
    } catch { /* sem id real, pula */ }

    if (idReal) {
      testes.insertAdjacentHTML('beforeend',
        `<p class="warn" style="margin-top:18px">Com um item real dos mais vendidos (${idReal}):</p>`);
      r.itemLote  = await testar('Itens em lote', comToken(`/items?ids=${idReal}`));
      r.itemUnico = await testar('Item individual', comToken(`/items/${idReal}`));
      r.itemPreco = await testar('Preço do item', comToken(`/items/${idReal}/sale_price?context=channel_marketplace`));
    }
  }

  let titulo, texto, cor;
  const fontes = [
    ['a busca', r.url], ['os mais vendidos', r.destaques2],
    ['o catálogo', r.catalogo], ['a descoberta por domínio', r.dominio]
  ].filter(([, v]) => v?.ok).map(([n]) => n);

  const detalheItem = r.itemLote?.ok ? 'em lote'
    : r.itemUnico?.ok ? 'um a um'
    : r.itemPreco?.ok ? 'só o preço' : null;

  if (t?.access_token && fontes.length) {
    titulo = 'Funciona — dá para listar produtos';
    texto = `Sua aplicação tem acesso a: ${fontes.join(', ')}.` +
      (detalheItem
        ? ` O detalhe dos itens (título, preço, vendas) pode ser lido ${detalheItem}.`
        : ' Porém o detalhe dos itens é negado, então preço e vendas podem faltar.');
    cor = 'ok';
  } else if (t?.access_token && r.quemSou?.ok) {
    titulo = 'Token válido, mas sem acesso aos produtos';
    texto = 'A conta autentica normalmente, porém o Mercado Livre recusa os ' +
      'endpoints de listagem de produtos para esta aplicação. É uma permissão ' +
      'que precisa ser liberada no painel de desenvolvedores.';
    cor = 'err';
  } else if (r.url?.ok && !r.cabecalho?.ok) {
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
