#!/usr/bin/env node
// Consulta o banco montado pelo job.
//   node src/listar.mjs                    # disponíveis, mais vendidos primeiro
//   node src/listar.mjs --regra celulares  # filtra por regra
//   node src/listar.mjs --quedas           # quem baixou de preço
//   node src/listar.mjs --execucoes        # histórico do job
//   node src/listar.mjs --json
import { abrir } from './db.mjs';

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const db = abrir();
const brl = (n) => n?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—';

if (args.includes('--execucoes')) {
  const linhas = db.prepare(
    'SELECT * FROM execucoes ORDER BY id DESC LIMIT 10'
  ).all();
  for (const e of linhas) {
    console.log(`#${e.id} ${e.iniciado_em} — ${e.novos} novos, ${e.atualizados} atualizados,` +
      ` ${e.sumiram} sumiram${e.erro ? `  ERRO: ${e.erro}` : ''}`);
  }
} else if (args.includes('--quedas')) {
  const linhas = db.prepare(`
    SELECT p.id, p.titulo, p.preco, p.link_afiliado,
           (SELECT MAX(preco) FROM precos WHERE produto_id = p.id) AS pico
    FROM produtos p
    WHERE p.disponivel = 1
      AND pico > p.preco
    ORDER BY (pico - p.preco) / pico DESC
    LIMIT 30
  `).all();
  if (args.includes('--json')) console.log(JSON.stringify(linhas, null, 2));
  else for (const l of linhas) {
    const queda = ((l.pico - l.preco) / l.pico * 100).toFixed(0);
    console.log(`-${queda}%  ${brl(l.preco)} (era ${brl(l.pico)})  ${l.titulo.slice(0, 55)}`);
    console.log(`       ${l.link_afiliado}\n`);
  }
} else {
  const regra = flag('--regra');
  const linhas = db.prepare(`
    SELECT * FROM produtos
    WHERE disponivel = 1 ${regra ? 'AND regra LIKE ?' : ''}
    ORDER BY vendidos DESC LIMIT 50
  `).all(...(regra ? [`%${regra}%`] : []));

  if (args.includes('--json')) {
    console.log(JSON.stringify(linhas, null, 2));
  } else {
    console.log(`\n${linhas.length} produtos disponíveis:\n`);
    for (const l of linhas) {
      console.log(`${l.titulo.slice(0, 60)}`);
      console.log(`  ${brl(l.preco)} | ${l.vendidos ?? 0} vendidos | estoque ${l.estoque}` +
        `${l.frete_gratis ? ' | frete grátis' : ''} | ${l.vendedor_nivel ?? '—'}`);
      console.log(`  ${l.link_afiliado}\n`);
    }
  }
}
db.close();
