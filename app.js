const $ = (id) => document.getElementById(id);
const brl = (n) => typeof n === 'number'
  ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let produtos = [];

function msg(html, tipo = '') {
  $('status').innerHTML = html ? `<div class="box ${tipo}">${html}</div>` : '';
}

function explicar(err) {
  if (err instanceof ML.ErroRede) {
    return 'O navegador bloqueou a chamada à API do Mercado Livre (CORS) ou a rede falhou.' +
      '<br>Se o bloqueio persistir, a consulta pelo navegador não é possível e o caminho ' +
      'é rodar o job <code>src/sync.mjs</code> num servidor.';
  }
  return esc(err.message);
}

function mostrarEtapa(etapa) {
  for (const e of ['Setup', 'Conectar', 'Produtos']) {
    $(`etapa${e}`).hidden = e.toLowerCase() !== etapa;
  }
}

function pintarConta() {
  const c = ML.creds.obter();
  $('statusConta').innerHTML = ML.conectado()
    ? `<span class="ok-dot"></span>conectado
       <button id="btnSair" class="link">sair</button>
       <button id="btnCreds" class="link">credenciais</button>`
    : c ? `<button id="btnCreds" class="link">credenciais</button>` : '';
  $('btnSair')?.addEventListener('click', () => {
    ML.tokens.limpar();
    iniciar();
  });
  $('btnCreds')?.addEventListener('click', () => {
    const c = ML.creds.obter() || {};
    $('clientId').value = c.clientId || '';
    $('clientSecret').value = c.clientSecret || '';
    $('afiliado').value = c.afiliado || '';
    mostrarEtapa('setup');
  });
}

// ---- produtos ----
function render(lista) {
  produtos = lista;
  $('contagem').textContent = `${lista.length} produto${lista.length === 1 ? '' : 's'}`;
  $('lista').innerHTML = lista.map((it) => {
    const link = ML.linkAfiliado(it.permalink);
    const temDesconto = it.original_price && it.original_price > it.price;
    return `
      <div class="card">
        <img src="${esc(it.secure_thumbnail || it.thumbnail || '')}" alt="" loading="lazy">
        <div class="card-corpo">
          <a class="titulo" href="${esc(link)}" target="_blank" rel="noopener">${esc(it.title)}</a>
          <div class="preco">${brl(it.price)}
            ${temDesconto ? `<span class="desconto">-${Math.round((1 - it.price / it.original_price) * 100)}%</span>
              <s>${brl(it.original_price)}</s>` : ''}
          </div>
          <div class="meta">
            ${it.sold_quantity != null ? `${it.sold_quantity} vendidos · ` : ''}
            estoque ${it.available_quantity ?? '—'}
            ${it.shipping?.free_shipping ? ' · frete grátis' : ''}
          </div>
          <div class="link-linha">
            <input readonly value="${esc(link)}">
            <button class="secundario copiar" data-link="${esc(link)}">Copiar</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

async function carregarProdutos() {
  const q = $('busca').value.trim();
  const cat = $('categoria').value;
  msg(q ? `Buscando "${esc(q)}"…` : 'Carregando os mais vendidos…');
  try {
    const lista = q ? await ML.buscar(q, cat) : await ML.maisVendidos(cat);
    if (!lista.length) return msg('Nenhum produto encontrado. Tente outra categoria.', 'err');
    msg('');
    render(lista);
  } catch (err) {
    msg(explicar(err), 'err');
  }
}

async function carregarCategorias() {
  const sel = $('categoria');
  try {
    const cats = await ML.categorias();
    const salva = localStorage.getItem('ml_categoria');
    sel.innerHTML = cats.map((c) =>
      `<option value="${esc(c.id)}"${c.id === salva ? ' selected' : ''}>${esc(c.name)}</option>`
    ).join('');
    if (!salva) sel.value = cats[0].id;
    return true;
  } catch (err) {
    sel.innerHTML = '<option>—</option>';
    msg(explicar(err), 'err');
    return false;
  }
}

// ---- fluxo ----
async function iniciar() {
  pintarConta();
  if (!ML.creds.obter()) return mostrarEtapa('setup');
  if (!ML.conectado()) return mostrarEtapa('conectar');

  mostrarEtapa('produtos');
  msg('Conectando…');
  if (await carregarCategorias()) await carregarProdutos();
}

$('btnSalvarCreds').addEventListener('click', async () => {
  const clientId = $('clientId').value.trim();
  const clientSecret = $('clientSecret').value.trim();
  if (!clientId || !clientSecret) return msg('Preencha o App ID e a Secret Key.', 'err');
  ML.creds.salvar({ clientId, clientSecret, afiliado: $('afiliado').value.trim() });
  if (ML.conectado()) { msg(''); return iniciar(); }
  try { await ML.iniciarLogin(); } catch (err) { msg(explicar(err), 'err'); }
});

$('btnConectar').addEventListener('click', async () => {
  try { await ML.iniciarLogin(); } catch (err) { msg(explicar(err), 'err'); }
});

$('btnAtualizar').addEventListener('click', carregarProdutos);
$('busca').addEventListener('keydown', (e) => { if (e.key === 'Enter') carregarProdutos(); });
$('categoria').addEventListener('change', () => {
  localStorage.setItem('ml_categoria', $('categoria').value);
  carregarProdutos();
});

$('btnCopiarLinks').addEventListener('click', () => {
  navigator.clipboard.writeText(produtos.map((p) => ML.linkAfiliado(p.permalink)).join('\n'));
});

$('btnCsv').addEventListener('click', () => {
  const campo = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [['id', 'titulo', 'preco', 'vendidos', 'estoque', 'link'].map(campo).join(',')];
  for (const p of produtos) {
    linhas.push([p.id, p.title, p.price, p.sold_quantity, p.available_quantity,
      ML.linkAfiliado(p.permalink)].map(campo).join(','));
  }
  const url = URL.createObjectURL(new Blob(['﻿' + linhas.join('\n')],
    { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'produtos.csv'; a.click();
  URL.revokeObjectURL(url);
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('.copiar');
  if (!b) return;
  navigator.clipboard.writeText(b.dataset.link).then(() => {
    b.textContent = 'Copiado!';
    setTimeout(() => { b.textContent = 'Copiar'; }, 1200);
  });
});

iniciar();
