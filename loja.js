// Página pública, sem senha. Lê loja.json (arquivo publicado — o que
// qualquer visitante vê) e, se ele não existir, cai no que está salvo neste
// navegador (para o dono conferir antes de publicar de verdade).
const brl = (n) => typeof n === 'number'
  ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function render(produtos) {
  if (!produtos.length) {
    document.getElementById('vazio').hidden = false;
    return;
  }
  document.getElementById('lista').innerHTML = produtos.map((p) => {
    const temDesconto = p.original_price && p.original_price > p.price;
    return `
      <div class="card">
        <img src="${esc(p.thumbnail || '')}" alt="" loading="lazy">
        <div class="card-corpo">
          <a class="titulo" href="${esc(p.link || '#')}" target="_blank" rel="noopener sponsored">${esc(p.title)}</a>
          <div class="preco">${p.price != null ? brl(p.price) : ''}
            ${temDesconto ? `<span class="desconto">-${Math.round((1 - p.price / p.original_price) * 100)}%</span>
              <s>${brl(p.original_price)}</s>` : ''}
          </div>
          <a class="botaolink" href="${esc(p.link || '#')}" target="_blank" rel="noopener sponsored">Ver oferta</a>
        </div>
      </div>`;
  }).join('');
}

(async () => {
  try {
    const res = await fetch(`loja.json?v=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const dados = await res.json();
      if (dados.length) return render(dados);
    }
  } catch { /* sem loja.json publicado ainda */ }

  // Sem arquivo publicado: mostra o que está salvo neste navegador, se houver.
  try {
    const local = JSON.parse(localStorage.getItem('ml_loja') || '[]');
    render(local);
  } catch {
    render([]);
  }
})();
