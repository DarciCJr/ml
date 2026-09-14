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
  document.getElementById('lista').innerHTML = `
    <div class="loja-tabela">
      ${produtos.map((p, i) => {
        const temDesconto = p.original_price && p.original_price > p.price;
        return `
          <a class="loja-linha" href="${esc(p.link || '#')}" target="_blank" rel="noopener sponsored">
            <span class="loja-pos">${i + 1}</span>
            <img src="${esc(p.thumbnail || '')}" alt="" loading="lazy">
            <span class="loja-titulo">${esc(p.title)}</span>
            <span class="loja-preco">${p.price != null ? brl(p.price) : '—'}
              ${temDesconto ? `<s>${brl(p.original_price)}</s>` : ''}
            </span>
            <span class="botaolink">Ver oferta</span>
          </a>`;
      }).join('')}
    </div>`;
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
