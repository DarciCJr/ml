// Credenciais, tokens e chamadas à API. Tudo vive no navegador do usuário.
window.ML = (() => {
  const API = 'https://api.mercadolibre.com';
  const AUTH = 'https://auth.mercadolivre.com.br/authorization';
  const SITE = 'MLB';
  const REDIRECT = new URL('callback.html', location.href).href;
  const MARGEM = 10 * 60 * 1000;   // renova 10 min antes de expirar

  const ler = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const creds = {
    obter: () => ler('ml_creds'),
    salvar: (c) => gravar('ml_creds', c),
    limpar: () => localStorage.removeItem('ml_creds')
  };

  const tokens = {
    obter: () => ler('ml_tokens'),
    salvar(resp) {
      const atual = ler('ml_tokens') || {};
      gravar('ml_tokens', {
        access_token: resp.access_token,
        // numa renovação o ML pode não devolver refresh_token novo
        refresh_token: resp.refresh_token || atual.refresh_token || null,
        user_id: resp.user_id ?? atual.user_id ?? null,
        expires_at: Date.now() + (resp.expires_in ?? 21600) * 1000
      });
    },
    limpar: () => localStorage.removeItem('ml_tokens')
  };

  /** Erro de rede vs. erro da API — a distinção importa para orientar o usuário. */
  class ErroRede extends Error {}

  async function postForm(path, dados) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(dados)
      });
    } catch {
      throw new ErroRede('bloqueio de CORS ou falha de rede');
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `${res.status} ${res.statusText}`);
    return body;
  }

  /** Troca o authorization code por tokens. */
  async function trocarCode(code, verifier) {
    const c = creds.obter();
    if (!c) throw new Error('Credenciais não configuradas.');
    const resp = await postForm('/oauth/token', {
      grant_type: 'authorization_code',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      code,
      redirect_uri: REDIRECT,
      ...(verifier ? { code_verifier: verifier } : {})
    });
    tokens.salvar(resp);
    return resp;
  }

  async function renovar() {
    const c = creds.obter(), t = tokens.obter();
    if (!c || !t?.refresh_token) throw new Error('sem refresh_token');
    const resp = await postForm('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: t.refresh_token
    });
    tokens.salvar(resp);
    return resp.access_token;
  }

  /** Devolve um access_token válido, renovando se preciso. */
  async function tokenValido() {
    const t = tokens.obter();
    if (!t) throw new Error('desconectado');
    if (Date.now() + MARGEM >= t.expires_at) return renovar();
    return t.access_token;
  }

  /** Erro que indica: este endpoint exige login. */
  class PrecisaLogin extends Error {}

  // O cabeçalho Authorization torna a requisição "não simples" e dispara o
  // preflight do CORS, que o ML não responde. Mandar o token na URL evita o
  // preflight. Guardamos o modo que funcionou para não repetir a tentativa.
  const MODO = 'ml_auth_modo';
  const modoSalvo = () => localStorage.getItem(MODO);

  async function buscarComToken(path, token, modo) {
    if (modo === 'query') {
      const sep = path.includes('?') ? '&' : '?';
      return fetch(`${API}${path}${sep}access_token=${encodeURIComponent(token)}`,
        { headers: { accept: 'application/json' } });
    }
    return fetch(`${API}${path}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${token}` }
    });
  }

  const historico = [];
  function registrar(path, resultado) {
    historico.push(`${path.split('&access_token=')[0]} -> ${resultado}`);
    if (historico.length > 40) historico.shift();
  }

  async function api(path, { jaRenovou = false } = {}) {
    const temToken = !!tokens.obter();

    let res;
    if (!temToken) {
      // Sem token: chamada simples, sem cabeçalho — não dispara preflight.
      try {
        res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
      } catch {
        throw new ErroRede('falha de rede');
      }
    } else {
      const token = await tokenValido();
      const ordem = modoSalvo() === 'query' ? ['query'] : ['header', 'query'];
      let ultimoErro;
      for (const modo of ordem) {
        try {
          res = await buscarComToken(path, token, modo);
          if (modoSalvo() !== modo) localStorage.setItem(MODO, modo);
          ultimoErro = null;
          break;
        } catch (err) {
          ultimoErro = err;   // rede/CORS: tenta o próximo modo
        }
      }
      if (ultimoErro) {
        throw new ErroRede('a API não aceitou a chamada autenticada pelo navegador');
      }
    }

    if ((res.status === 401 || res.status === 403) && !temToken) {
      throw new PrecisaLogin('Este endpoint exige login.');
    }
    if (res.status === 401 && temToken && !jaRenovou) {
      await renovar();
      return api(path, { jaRenovou: true });
    }
    const body = await res.json().catch(() => ({}));
    registrar(path, res.status);
    if (res.status === 429) throw new Error('Limite de chamadas atingido. Espere um minuto.');
    if (!res.ok) throw new Error(body.message || `${res.status} em ${path}`);
    return body;
  }

  // ---- PKCE ----
  const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const aleatorio = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

  async function iniciarLogin() {
    const c = creds.obter();
    if (!c) throw new Error('Configure as credenciais primeiro.');
    const verifier = aleatorio();
    const state = aleatorio(16);
    sessionStorage.setItem('ml_pkce', JSON.stringify({ verifier, state }));
    const desafio = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const params = new URLSearchParams({
      response_type: 'code', client_id: c.clientId, redirect_uri: REDIRECT,
      state, code_challenge: desafio, code_challenge_method: 'S256'
    });
    location.href = `${AUTH}?${params}`;
  }

  // ---- consultas ----
  const categorias = () => api(`/sites/${SITE}/categories`);

  /**
   * Detalhe dos itens. Tenta em lote (20 por chamada, limite do endpoint);
   * se o lote for negado, cai para consulta individual; se essa também for,
   * monta o mínimo e busca só o preço pela API de preços.
   */
  async function itens(ids, aoProgredir) {
    const out = [];
    let loteNegado = false;

    for (let i = 0; i < ids.length; i += 20) {
      const fatia = ids.slice(i, i + 20);

      if (!loteNegado) {
        // /items/bulk é o endpoint atual para lote (até 20 ids); /items?ids= é
        // o antigo e vem sendo recusado. Tenta o novo e depois o legado.
        let lote = null;
        for (const rota of [`/items/bulk?ids=${fatia.join(',')}`,
                            `/items?ids=${fatia.join(',')}`]) {
          try { lote = await api(rota); break; } catch { /* tenta o próximo */ }
        }
        if (lote) {
          // /items/bulk renomeou o campo code para status_code e passou a
          // repetir o id na raiz de cada elemento; o legado ainda usa code.
          // A resposta também pode vir como lista de itens sem envelope.
          const linhas = Array.isArray(lote) ? lote : (lote.body || lote.results || []);
          out.push(...linhas.map((r) => {
            if (!r) return null;
            if (!r.body) return r;                       // item direto
            const st = r.status_code ?? r.code;
            return (st == null || st === 200) ? r.body : null;
          }).filter(Boolean));
          aoProgredir?.(out.length, ids.length);
          continue;
        }
        loteNegado = true;   // não insiste no lote nas próximas fatias
      }

      const um = await Promise.all(fatia.map(async (id) => {
        try {
          return await api(`/items/${id}`);
        } catch {
          try {
            const sp = await api(`/items/${id}/sale_price?context=channel_marketplace`);
            return { id, title: id, price: sp?.amount ?? null,
                     original_price: sp?.regular_amount ?? null,
                     permalink: `https://www.mercadolivre.com.br/p/${id}` };
          } catch {
            return null;
          }
        }
      }));
      out.push(...um.filter(Boolean));
      aoProgredir?.(out.length, ids.length);
    }
    return out;
  }

  /**
   * Resolve entradas de destaque do tipo PRODUCT (produtos de catálogo).
   * /products/{id} costuma ser negado, mas a busca de catálogo aceita
   * product_identifier — é o campo que a própria mensagem de erro do
   * endpoint indica como alternativa a keywords.
   */
  async function produtosPorId(ids) {
    const achados = [];
    const naoResolvidos = [];
    for (const id of ids) {
      let d = null;
      try {
        d = await api(`/products/${id}`);
      } catch {
        try {
          const p = new URLSearchParams({ site_id: SITE, product_identifier: id });
          const r = await api(`/products/search?${p}`);
          d = (r.results || [])[0] || null;
        } catch { /* sem caminho para este produto */ }
      }
      if (!d) { naoResolvidos.push(id); continue; }
      let bbw = d.buy_box_winner || {};

      // Sem vencedor na resposta não há preço nem vendas: busca os anúncios
      // do produto e usa o primeiro como referência.
      if (bbw.price == null) {
        try {
          const r = await api(`/products/${id}/items`);
          const primeiro = (r.results || r.items || [])[0];
          const itemId = typeof primeiro === 'string' ? primeiro : primeiro?.id;
          if (itemId) {
            try {
              const it = await api(`/items/${itemId}`);
              bbw = {
                item_id: itemId,
                price: it.price ?? null,
                original_price: it.original_price ?? null,
                sold_quantity: it.sold_quantity ?? null,
                available_quantity: it.available_quantity ?? null,
                shipping: it.shipping ?? null,
                permalink: it.permalink ?? null
              };
            } catch {
              bbw = { ...bbw, item_id: itemId };
            }
          }
        } catch { /* produto sem anúncios acessíveis */ }
      }

      achados.push({
        id,
        title: d.name || d.title || id,
        price: bbw.price ?? null,
        original_price: bbw.original_price ?? null,
        sold_quantity: bbw.sold_quantity ?? null,
        available_quantity: bbw.available_quantity ?? null,
        shipping: bbw.shipping ?? null,
        secure_thumbnail: d.pictures?.[0]?.url || d.pictures?.[0]?.secure_url || '',
        permalink: bbw.permalink || d.permalink || `https://www.mercadolivre.com.br/p/${id}`,
        item_id: bbw.item_id ?? null
      });
    }
    achados.naoResolvidos = naoResolvidos;
    return achados;
  }

  /**
   * Destaques do tipo USER_PRODUCT. O recurso próprio é /user-products/{id};
   * quando ele não responde, o identificador costuma valer como anúncio.
   */
  async function userProdutosPorId(ids) {
    const achados = [];
    const naoResolvidos = [];
    for (const id of ids) {
      let d = null;
      for (const rota of [`/user-products/${id}`, `/items/${id}`]) {
        try { d = await api(rota); break; } catch { /* tenta o próximo */ }
      }
      if (!d) { naoResolvidos.push(id); continue; }
      const bbw = d.buy_box_winner || {};
      achados.push({
        id,
        title: d.name || d.title || id,
        price: d.price ?? bbw.price ?? null,
        original_price: d.original_price ?? bbw.original_price ?? null,
        sold_quantity: d.sold_quantity ?? bbw.sold_quantity ?? null,
        available_quantity: d.available_quantity ?? bbw.available_quantity ?? null,
        shipping: d.shipping ?? bbw.shipping ?? null,
        secure_thumbnail: d.secure_thumbnail || d.pictures?.[0]?.url
          || d.pictures?.[0]?.secure_url || '',
        permalink: d.permalink || bbw.permalink
          || `https://www.mercadolivre.com.br/p/${id}`,
        item_id: bbw.item_id ?? (d.id && String(d.id).startsWith('MLB') ? d.id : null)
      });
    }
    achados.naoResolvidos = naoResolvidos;
    return achados;
  }

  async function maisVendidos(categoria, aoProgredir) {
    const { content } = await api(`/highlights/${SITE}/category/${categoria}`);
    const entradas = (content || []).filter((h) => h?.id);

    // O campo type assume ITEM, PRODUCT ou USER_PRODUCT. Cada um se resolve
    // por um recurso diferente; tratar todos como anúncio zerava categorias.
    const tipo = (h) => (h.type || 'ITEM').toUpperCase();
    const idsItem = entradas.filter((h) => tipo(h) === 'ITEM').map((h) => h.id);
    const idsProduto = entradas.filter((h) => tipo(h) === 'PRODUCT').map((h) => h.id);
    const idsUserProduto = entradas.filter((h) => tipo(h) === 'USER_PRODUCT').map((h) => h.id);

    const lista = [];
    let naoResolvidos = [];

    if (idsItem.length) lista.push(...await itens(idsItem, aoProgredir));

    if (idsUserProduto.length) {
      const ups = await userProdutosPorId(idsUserProduto);
      naoResolvidos = naoResolvidos.concat(ups.naoResolvidos || []);
      lista.push(...ups);
      aoProgredir?.(lista.length, entradas.length);
    }

    if (idsProduto.length) {
      const prods = await produtosPorId(idsProduto);
      naoResolvidos = naoResolvidos.concat(prods.naoResolvidos || []);
      lista.push(...prods);
      aoProgredir?.(lista.length, entradas.length);
    }

    // Os destaques já vêm em ordem de relevância de vendas: preserva-a para os
    // itens cuja quantidade vendida a API não informar.
    const posicao = new Map(entradas.map((h, i) => [h.id, i]));
    lista.forEach((it) => { it.posicao_destaque = posicao.get(it.id) ?? 999; });
    lista.sort((a, b) => a.posicao_destaque - b.posicao_destaque);

    if (!lista.length && entradas.length) {
      throw new Error(
        `Os ${entradas.length} destaques desta categoria não puderam ser lidos: ` +
        'a API recusou os recursos de produto para esta aplicação. Tente outra categoria.'
      );
    }

    lista.totalDestaques = entradas.length;
    lista.naoResolvidos = naoResolvidos.length;
    lista.tipos = [
      idsItem.length && `${idsItem.length} anúncios`,
      idsProduto.length && `${idsProduto.length} produtos`,
      idsUserProduto.length && `${idsUserProduto.length} produtos de vendedor`
    ].filter(Boolean).join(', ');
    return lista;
  }

  async function buscar(q, categoria) {
    const p = new URLSearchParams({ limit: '50' });
    if (q) p.set('q', q);
    if (categoria) p.set('category', categoria);
    const { results } = await api(`/sites/${SITE}/search?${p}`);
    return results || [];
  }

  /** O catálogo devolve o produto "seco": preço e vendas vêm do detalhe. */
  async function enriquecer(lista, aoProgredir) {
    const LOTE = 5;
    const cheios = [];
    const falhas = [];
    for (let i = 0; i < lista.length; i += LOTE) {
      const fatia = lista.slice(i, i + LOTE);
      const res = await Promise.all(fatia.map(async (p) => {
        if (p.price != null && p.sold_quantity != null) return p;   // já completo
        try {
          let d = {}, bbw = {};
          try {
            d = await api(`/products/${p.id}`);
            bbw = d.buy_box_winner || {};
          } catch (err) {
            falhas.push(`/products: ${err.message}`);
          }

          // Plano B de preço: a API de preços trabalha por item, não por produto.
          // O campo price de /items está sendo descontinuado pelo ML, então
          // usamos /sale_price, que é o caminho indicado na documentação.
          const itemId = bbw.item_id || p.item_id;
          if (bbw.price == null && itemId) {
            try {
              const sp = await api(`/items/${itemId}/sale_price?context=channel_marketplace`);
              if (sp?.amount != null) {
                bbw.price = sp.amount;
                bbw.original_price = sp.regular_amount ?? null;
              }
            } catch (err) {
              falhas.push(`/sale_price: ${err.message}`);
            }
          }

          return {
            ...p,
            title: d.name || p.title,
            price: bbw.price ?? p.price ?? null,
            original_price: bbw.original_price ?? p.original_price ?? null,
            sold_quantity: bbw.sold_quantity ?? d.sold_quantity ?? p.sold_quantity ?? null,
            available_quantity: bbw.available_quantity ?? p.available_quantity ?? null,
            shipping: bbw.shipping ?? p.shipping ?? null,
            secure_thumbnail: p.secure_thumbnail || d.pictures?.[0]?.url || '',
            permalink: bbw.permalink || p.permalink,
            item_id: itemId ?? null
          };
        } catch (err) {
          falhas.push(err.message);
          return p;   // sem detalhe, mantém o que veio do catálogo
        }
      }));
      cheios.push(...res);
      aoProgredir?.(cheios.length, lista.length);
    }
    cheios.motivoFalha = falhas.length ? falhas[0] : null;
    cheios.qtdFalhas = falhas.length;
    return cheios;
  }

  /** Catálogo de produtos — alternativa quando /search é negado. */
  async function catalogo(q, categoria, palavraCategoria) {
    const p = new URLSearchParams({ site_id: SITE, status: 'active', limit: '50' });
    // O endpoint exige keywords (ou identificador/atributos); categoria sozinha
    // não basta, então usamos o nome da categoria como termo.
    const termo = (q || palavraCategoria || '').trim();
    if (!termo) throw new Error('O catálogo exige uma palavra de busca.');
    p.set('keywords', termo);
    if (categoria) p.set('category_id', categoria);
    const { results } = await api(`/products/search?${p}`);
    // O catálogo devolve um formato próprio; normaliza para o mesmo dos itens.
    return (results || []).map((r) => ({
      id: r.id,
      title: r.name || r.title,
      price: r.buy_box_winner?.price ?? r.price ?? null,
      original_price: r.buy_box_winner?.original_price ?? null,
      sold_quantity: r.buy_box_winner?.sold_quantity ?? null,
      available_quantity: r.buy_box_winner?.available_quantity ?? null,
      shipping: r.buy_box_winner?.shipping ?? null,
      secure_thumbnail: r.pictures?.[0]?.url || r.pictures?.[0]?.secure_url || '',
      permalink: r.permalink || `https://www.mercadolivre.com.br/p/${r.id}`,
      // preservado para a API de preços, que trabalha por item e não por produto
      item_id: r.buy_box_winner?.item_id ?? null
    }));
  }

  /**
   * Nos recursos públicos o available_quantity é referencial: o valor
   * devolvido representa o início de uma faixa, não o estoque exato.
   */
  const FAIXAS = new Map([
    [1, '1 a 50'], [50, '51 a 100'], [100, '101 a 150'], [150, '151 a 200'],
    [200, '201 a 250'], [250, '251 a 500'], [500, '501 a 5.000'],
    [5000, '5.001 a 50.000'], [50000, 'mais de 50.000']
  ]);
  function estoqueTexto(n) {
    if (n == null) return null;
    return FAIXAS.get(n) || String(n);
  }

  /**
   * Monta o link de afiliado. O formato correto é definido pelo programa de
   * Afiliados, não pela API, então preferimos copiar os parâmetros de um link
   * real que o usuário tenha gerado — assim não dependemos de suposição.
   */
  function linkAfiliado(permalink) {
    if (!permalink) return '';
    const c = creds.obter() || {};

    const modelo = (c.modeloAfiliado || '').trim();
    if (modelo) {
      try {
        const m = new URL(modelo);
        const u = new URL(permalink);
        // Só os parâmetros de rastreio interessam; o caminho é do produto.
        m.searchParams.forEach((v, k) => u.searchParams.set(k, v));
        return u.toString();
      } catch { /* modelo inválido: cai no identificador solto */ }
    }

    const id = (c.afiliado || '').trim();
    if (!id) return permalink;
    try {
      const u = new URL(permalink);
      u.searchParams.set('matt_tool', id);
      return u.toString();
    } catch { return permalink; }
  }

  /** Diz se o link está sendo montado por suposição nossa. */
  function formatoAfiliadoSuposto() {
    const c = creds.obter() || {};
    return !((c.modeloAfiliado || '').trim()) && !!(c.afiliado || '').trim();
  }

  return {
    creds, tokens, ErroRede, PrecisaLogin, trocarCode, tokenValido, iniciarLogin,
    categorias, maisVendidos, buscar, catalogo, enriquecer, linkAfiliado,
    estoqueTexto, formatoAfiliadoSuposto, REDIRECT,
    historico: () => historico.slice(),
    conectado: () => !!tokens.obter()
  };
})();
