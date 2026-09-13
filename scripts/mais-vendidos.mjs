#!/usr/bin/env node
// Lista os produtos em destaque (mais vendidos) de uma categoria do Mercado Livre.
//
// Uso:
//   export ML_TOKEN='APP_USR-...'
//   node scripts/mais-vendidos.mjs                 # lista as categorias do site
//   node scripts/mais-vendidos.mjs MLB1051         # destaques da categoria
//   node scripts/mais-vendidos.mjs MLB1051 --json  # saída JSON
//
// O endpoint /highlights é o caminho oficial para "mais vendidos". A busca comum
// NÃO aceita ordenação por quantidade vendida.

const TOKEN = process.env.ML_TOKEN;
const SITE = process.env.ML_SITE || 'MLB';
const API = 'https://api.mercadolibre.com';

if (!TOKEN) {
  console.error("Defina ML_TOKEN primeiro:  export ML_TOKEN='APP_USR-...'");
  process.exit(1);
}

async function api(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.message || res.statusText;
    if (res.status === 401) throw new Error(`401 — token inválido ou expirado (${msg})`);
    if (res.status === 429) throw new Error(`429 — rate limit atingido; espere e tente de novo`);
    throw new Error(`${res.status} em ${path} — ${msg}`);
  }
  return body;
}

const brl = (n) => n?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';

async function listarCategorias() {
  const cats = await api(`/sites/${SITE}/categories`);
  console.log(`\nCategorias de ${SITE}:\n`);
  for (const c of cats) console.log(`  ${c.id.padEnd(10)} ${c.name}`);
  console.log(`\nDepois rode:  node scripts/mais-vendidos.mjs ${cats[0].id}\n`);
}

async function destaques(categoria, asJson) {
  const { content } = await api(`/highlights/${SITE}/category/${categoria}`);
  const ids = content.filter((h) => h.type === 'ITEM').map((h) => h.id);
  if (!ids.length) {
    console.error(`Nenhum item em destaque para ${categoria}.`);
    return;
  }

  // /items aceita até 20 ids por chamada.
  const itens = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = await api(`/items?ids=${ids.slice(i, i + 20).join(',')}`);
    itens.push(...lote.filter((r) => r.code === 200).map((r) => r.body));
  }

  const linhas = itens.map((it, i) => ({
    posicao: i + 1,
    id: it.id,
    titulo: it.title,
    preco: it.price,
    vendidos: it.sold_quantity,
    estoque: it.available_quantity,
    frete_gratis: it.shipping?.free_shipping ?? false,
    link: it.permalink
  }));

  if (asJson) {
    console.log(JSON.stringify(linhas, null, 2));
    return;
  }

  console.log(`\nDestaques de ${categoria} (${linhas.length} itens):\n`);
  for (const l of linhas) {
    console.log(`${String(l.posicao).padStart(2)}. ${l.titulo.slice(0, 65)}`);
    console.log(`    ${brl(l.preco)}  |  estoque: ${l.estoque}${l.frete_gratis ? '  |  frete grátis' : ''}`);
    console.log(`    ${l.link}\n`);
  }
  console.log('Para usar como afiliado, aplique seu identificador nesses permalinks');
  console.log('conforme o formato definido no painel do Mercado Livre Afiliados.\n');
}

const [categoria, ...flags] = process.argv.slice(2);
try {
  if (!categoria) await listarCategorias();
  else await destaques(categoria.toUpperCase(), flags.includes('--json'));
} catch (err) {
  console.error(`\nErro: ${err.message}\n`);
  process.exit(1);
}
