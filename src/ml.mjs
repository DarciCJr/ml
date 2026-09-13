// Cliente da API do Mercado Livre: renova token em 401, respeita rate limit,
// faz backoff exponencial em 429/5xx.
import { tokenValido, forcarRenovacao } from './auth.mjs';

const API = 'https://api.mercadolibre.com';
export const SITE = process.env.ML_SITE || 'MLB';

const PAUSA_MS = Number(process.env.ML_PAUSA_MS || 120);  // entre chamadas
const MAX_TENTATIVAS = 4;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let ultimaChamada = 0;

async function esperarTurno() {
  const desde = Date.now() - ultimaChamada;
  if (desde < PAUSA_MS) await dormir(PAUSA_MS - desde);
  ultimaChamada = Date.now();
}

export async function api(path, { renovou = false, tentativa = 1 } = {}) {
  await esperarTurno();
  const token = await tokenValido();

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
    });
  } catch (err) {
    // Falha de rede: tenta de novo com backoff.
    if (tentativa < MAX_TENTATIVAS) {
      const espera = 2 ** tentativa * 1000;
      console.warn(`[api] rede falhou em ${path}; nova tentativa em ${espera}ms`);
      await dormir(espera);
      return api(path, { renovou, tentativa: tentativa + 1 });
    }
    throw new Error(`Rede indisponível em ${path}: ${err.message}`);
  }

  if (res.status === 401 && !renovou) {
    console.warn('[api] 401 — renovando token e repetindo.');
    await forcarRenovacao();
    return api(path, { renovou: true, tentativa });
  }

  if ((res.status === 429 || res.status >= 500) && tentativa < MAX_TENTATIVAS) {
    const espera = 2 ** tentativa * 1000;
    console.warn(`[api] ${res.status} em ${path}; nova tentativa em ${espera}ms`);
    await dormir(espera);
    return api(path, { renovou, tentativa: tentativa + 1 });
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${res.status} em ${path} — ${body.message || res.statusText}`);
  }
  return body;
}

/** Destaques (mais vendidos) de uma categoria. */
export async function destaques(categoria) {
  const { content } = await api(`/highlights/${SITE}/category/${categoria}`);
  return content.filter((h) => h.type === 'ITEM').map((h) => h.id);
}

/** Busca com filtros. Pagina até o limite pedido. */
export async function buscar(filtros, limite = 50) {
  const ids = [];
  for (let offset = 0; ids.length < limite && offset < 1000; offset += 50) {
    const params = new URLSearchParams({ ...filtros, limit: '50', offset: String(offset) });
    const { results } = await api(`/sites/${SITE}/search?${params}`);
    if (!results?.length) break;
    ids.push(...results.map((r) => r.id));
  }
  return ids.slice(0, limite);
}

/** Detalhes completos, em lotes de 20 (limite do endpoint /items). */
export async function itens(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = await api(`/items?ids=${ids.slice(i, i + 20).join(',')}`);
    out.push(...lote.filter((r) => r.code === 200).map((r) => r.body));
  }
  return out;
}

/** Reputação do vendedor (cacheada por execução). */
const cacheVendedor = new Map();
export async function vendedor(id) {
  if (!cacheVendedor.has(id)) {
    cacheVendedor.set(id, await api(`/users/${id}`).catch(() => null));
  }
  return cacheVendedor.get(id);
}
