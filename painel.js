const API = 'https://api.mercadolibre.com';
const SITE = 'MLB';

const $ = (id) => document.getElementById(id);
const statusEl = $('status');
let resultados = [];

// ---- token e afiliado ficam só nesta aba ----
const tokenEl = $('token');
const afiliadoEl = $('afiliado');
tokenEl.value = sessionStorage.getItem('ml_token') || '';
afiliadoEl.value = localStorage.getItem('ml_afiliado') || '';
tokenEl.addEventListener('change', () => sessionStorage.setItem('ml_token', tokenEl.value.trim()));
afiliadoEl.addEventListener('change', () => {
  localStorage.setItem('ml_afiliado', afiliadoEl.value.trim());
  if (resultados.length) render(resultados);
});

const brl = (n) => typeof n === 'number'
  ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

function aviso(html, tipo = 'err') {
  statusEl.innerHTML = `<div class="box ${tipo}">${html}</div>`;
}
function ocupado(msg) {
  statusEl.innerHTML = `<div class="box">${msg}</div>`;
}

async function api(path) {
  const token = tokenEl.value.trim();
  if (!token) throw new Error('Informe o access token primeiro.');

  let res;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}`, accept: 'application/json' }
    });
  } catch {
    throw new Error(
      'O navegador bloqueou a chamada à API (CORS) ou a rede falhou.<br>' +
      'Se for CORS, a consulta direto do navegador não é possível e o caminho ' +
      'é rodar o job <code>src/sync.mjs</code> num servidor.'
    );
  }

  const body = await res.json().catch(() => ({}));
  if (res.status === 401) throw new Error('Token inválido ou expirado. Gere um novo pelo teste de OAuth.');
  if (res.status === 429) throw new Error('Limite de chamadas atingido. Espere um pouco e tente de novo.');
  if (!res.ok) throw new Error(`Erro ${res.status}: ${body.message || res.statusText}`);
  return body;
}

function linkAfiliado(permalink) {
  const id = afiliadoEl.value.trim();
  if (!id || !permalink) return permalink || '';
  try {
    const url = new URL(permalink);
    url.searchParams.set('matt_tool', id);
    return url.toString();
  } catch { return permalink; }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render(itens) {
  resultados = itens;
  $('contagem').textContent = `${itens.length} produto${itens.length === 1 ? '' : 's'}`;
  $('resultados').hidden = false;

  $('lista').innerHTML = itens.map((it) => {
    const link = linkAfiliado(it.permalink);
    const desconto = it.original_price && it.original_price > it.price
      ? `<span class="desconto">-${Math.round((1 - it.price / it.original_price) * 100)}%</span>` : '';
    return `
      <div class="card">
        <img src="${esc(it.secure_thumbnail || it.thumbnail || '')}" alt="" loading="lazy">
        <div class="card-corpo">
          <a class="titulo" href="${esc(link)}" target="_blank" rel="noopener">${esc(it.title)}</a>
          <div class="preco">${brl(it.price)} ${desconto}
            ${it.original_price && it.original_price > it.price ? `<s>${brl(it.original_price)}</s>` : ''}
          </div>
          <div class="meta">
            ${it.sold_quantity != null ? `${it.sold_quantity} vendidos · ` : ''}
            estoque ${it.available_quantity ?? '—'}
            ${it.shipping?.free_shipping ? ' · frete grátis' : ''}
            ${it.condition === 'new' ? ' · novo' : it.condition === 'used' ? ' · usado' : ''}
          </div>
          <div class="link-linha">
            <input readonly value="${esc(link)}">
            <button class="secundario copiar" data-link="${esc(link)}">Copiar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ---- consultas ----
async function detalhes(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 20) {
    ocupado(`Carregando detalhes… ${Math.min(i + 20, ids.length)}/${ids.length}`);
    const lote = await api(`/items?ids=${ids.slice(i, i + 20).join(',')}`);
    out.push(...lote.filter((r) => r.code === 200).map((r) => r.body));
  }
  return out;
}

async function executar(fn) {
  try {
    $('resultados').hidden = true;
    await fn();
  } catch (err) {
    aviso(err.message);
  }
}

$('btnBuscar').addEventListener('click', () => executar(async () => {
  const limite = Number($('limite').value);
  const filtros = { limit: '50' };
  if ($('q').value.trim()) filtros.q = $('q').value.trim();
  if ($('cat').value.trim()) filtros.category = $('cat').value.trim().toUpperCase();
  if ($('cond').value) filtros.condition = $('cond').value;
  if ($('freteGratis').checked) filtros.shipping = 'free';
  const min = $('pmin').value, max = $('pmax').value;
  if (min || max) filtros.price = `${min || '*'}-${max || '*'}`;
  if (!filtros.q && !filtros.category) throw new Error('Informe uma palavra-chave ou uma categoria.');

  const itens = [];
  for (let offset = 0; itens.length < limite; offset += 50) {
    ocupado(`Buscando… ${itens.length}/${limite}`);
    const params = new URLSearchParams({ ...filtros, offset: String(offset) });
    const { results } = await api(`/sites/${SITE}/search?${params}`);
    if (!results?.length) break;
    itens.push(...results);
  }
  if (!itens.length) return aviso('Nenhum produto encontrado com esses filtros.', 'err');
  statusEl.innerHTML = '';
  render(itens.slice(0, limite));
}));

$('btnDestaques').addEventListener('click', () => executar(async () => {
  const cat = $('catDestaque').value.trim().toUpperCase();
  if (!cat) throw new Error('Informe a categoria (ex.: MLB1051).');
  ocupado('Buscando destaques…');
  const { content } = await api(`/highlights/${SITE}/category/${cat}`);
  const ids = content.filter((h) => h.type === 'ITEM').map((h) => h.id);
  if (!ids.length) return aviso('Nenhum destaque para essa categoria.', 'err');
  const itens = await detalhes(ids);
  statusEl.innerHTML = '';
  render(itens);
}));

$('btnCategorias').addEventListener('click', () => executar(async () => {
  ocupado('Carregando categorias…');
  const cats = await api(`/sites/${SITE}/categories`);
  statusEl.innerHTML = '';
  $('listaCategorias').innerHTML =
    `<div class="cats">${cats.map((c) =>
      `<button class="cat-chip" data-id="${esc(c.id)}">${esc(c.name)}<code>${esc(c.id)}</code></button>`
    ).join('')}</div>`;
}));

$('listaCategorias').addEventListener('click', (e) => {
  const chip = e.target.closest('.cat-chip');
  if (!chip) return;
  $('catDestaque').value = chip.dataset.id;
  $('cat').value = chip.dataset.id;
});

$('btnItem').addEventListener('click', () => executar(async () => {
  const id = $('itemId').value.trim().toUpperCase();
  if (!id) throw new Error('Informe o ID do produto.');
  ocupado('Consultando…');
  const item = await api(`/items/${id}`);
  statusEl.innerHTML = '';
  render([item]);
}));

// ---- abas ----
document.querySelectorAll('.aba').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.aba').forEach((b) => b.classList.toggle('ativa', b === btn));
    document.querySelectorAll('.painel').forEach((p) => {
      p.hidden = p.id !== `painel-${btn.dataset.aba}`;
    });
  });
});

// ---- exportar ----
function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

$('btnJson').addEventListener('click', () => {
  baixar('produtos.json', JSON.stringify(resultados.map((it) => ({
    id: it.id, titulo: it.title, preco: it.price, vendidos: it.sold_quantity,
    estoque: it.available_quantity, frete_gratis: !!it.shipping?.free_shipping,
    link: linkAfiliado(it.permalink)
  })), null, 2), 'application/json');
});

$('btnCsv').addEventListener('click', () => {
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['id', 'titulo', 'preco', 'vendidos', 'estoque', 'frete_gratis', 'link']
    .map(campo).join(',')];
  for (const it of resultados) {
    linhas.push([it.id, it.title, it.price, it.sold_quantity, it.available_quantity,
      it.shipping?.free_shipping ? 'sim' : 'nao', linkAfiliado(it.permalink)].map(campo).join(','));
  }
  baixar('produtos.csv', '﻿' + linhas.join('\n'), 'text/csv;charset=utf-8');
});

$('btnCopiarLinks').addEventListener('click', () => {
  navigator.clipboard.writeText(resultados.map((it) => linkAfiliado(it.permalink)).join('\n'));
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.copiar');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.link).then(() => {
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 1200);
  });
});
