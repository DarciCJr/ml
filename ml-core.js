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

  async function api(path, { jaRenovou = false } = {}) {
    // Sem tokens guardados, tenta como chamada pública — boa parte da API
    // do ML responde sem autenticação.
    const headers = { accept: 'application/json' };
    const temToken = !!tokens.obter();
    if (temToken) headers.Authorization = `Bearer ${await tokenValido()}`;

    let res;
    try {
      res = await fetch(`${API}${path}`, { headers });
    } catch {
      throw new ErroRede('bloqueio de CORS ou falha de rede');
    }

    if ((res.status === 401 || res.status === 403) && !temToken) {
      throw new PrecisaLogin('Este endpoint exige login.');
    }
    if (res.status === 401 && temToken && !jaRenovou) {
      await renovar();
      return api(path, { jaRenovou: true });
    }
    const body = await res.json().catch(() => ({}));
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

  async function itens(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 20) {
      const lote = await api(`/items?ids=${ids.slice(i, i + 20).join(',')}`);
      out.push(...lote.filter((r) => r.code === 200).map((r) => r.body));
    }
    return out;
  }

  async function maisVendidos(categoria) {
    const { content } = await api(`/highlights/${SITE}/category/${categoria}`);
    return itens(content.filter((h) => h.type === 'ITEM').map((h) => h.id));
  }

  async function buscar(q, categoria) {
    const p = new URLSearchParams({ limit: '50' });
    if (q) p.set('q', q);
    if (categoria) p.set('category', categoria);
    const { results } = await api(`/sites/${SITE}/search?${p}`);
    return results || [];
  }

  function linkAfiliado(permalink) {
    const id = creds.obter()?.afiliado?.trim();
    if (!id || !permalink) return permalink || '';
    try {
      const u = new URL(permalink);
      u.searchParams.set('matt_tool', id);
      return u.toString();
    } catch { return permalink; }
  }

  return {
    creds, tokens, ErroRede, PrecisaLogin, trocarCode, tokenValido, iniciarLogin,
    categorias, maisVendidos, buscar, linkAfiliado, REDIRECT,
    conectado: () => !!tokens.obter()
  };
})();
