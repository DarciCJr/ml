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
    return 'A chamada à API não completou (rede ou CORS).<br>' +
      'Rode o <a href="diagnostico.html">diagnóstico</a> para saber qual dos dois é.';
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

async function carregarProdutos({ propagar = false } = {}) {
  const q = $('busca').value.trim();
  const cat = $('categoria').value;
  msg(q ? `Buscando "${esc(q)}"…` : 'Carregando os mais vendidos…');
  try {
    let lista;
    if (q) {
      lista = await ML.buscar(q, cat);
    } else {
      // /highlights costuma exigir login; a busca por categoria é o plano B.
      try {
        lista = await ML.maisVendidos(cat);
      } catch (err) {
        if (!(err instanceof ML.PrecisaLogin) || !ML.conectado()) {
          lista = await ML.buscar('', cat);
        } else { throw err; }
      }
    }
    if (!lista.length) return msg('Nenhum produto encontrado. Tente outra categoria.', 'err');
    msg('');
    render(lista);
  } catch (err) {
    if (propagar || err instanceof ML.PrecisaLogin) throw err;
    msg(explicar(err), 'err');
  }
}

async function carregarCategorias({ propagar = false } = {}) {
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
    if (propagar || err instanceof ML.PrecisaLogin) throw err;
    msg(explicar(err), 'err');
    return false;
  }
}

// ---- fluxo ----
async function iniciar() {
  pintarConta();
  mostrarEtapa('produtos');
  msg('Carregando produtos…');

  // Tenta sem login primeiro; se não der, a tela de conexão é o caminho.
  try {
    const propagar = { propagar: !ML.conectado() };
    await carregarCategorias(propagar);
    await carregarProdutos(propagar);
  } catch (err) {
    if (!ML.conectado()) {
      // A API do ML hoje exige token em praticamente tudo: leve ao login,
      // mostrando o motivo real em vez de deixar a tela vazia.
      mostrarEtapa(ML.creds.obter() ? 'conectar' : 'setup');
      msg(err instanceof ML.PrecisaLogin
        ? 'O Mercado Livre recusou a consulta sem login.'
        : `Não consegui consultar sem login: ${explicar(err)}`, 'err');
      return;
    }
    msg(explicar(err), 'err');
  }
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

$('btnAtualizar').addEventListener('click', () => carregarProdutos().catch(() => iniciar()));
$('busca').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') carregarProdutos().catch(() => iniciar());
});
$('categoria').addEventListener('change', () => {
  localStorage.setItem('ml_categoria', $('categoria').value);
  carregarProdutos().catch(() => iniciar());
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
