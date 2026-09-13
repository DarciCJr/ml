#!/usr/bin/env node
// Job de sincronização: busca produtos pelas regras de regras.json,
// aplica os filtros de qualidade e grava no SQLite.
//
//   node src/sync.mjs            # roda uma vez
//   node src/sync.mjs --loop     # roda de hora em hora
import { readFileSync } from 'node:fs';
import { destaques, buscar, itens, vendedor } from './ml.mjs';
import { abrir, salvarProduto, marcarSumidos, iniciarExecucao, fecharExecucao } from './db.mjs';

const NIVEIS = ['newbie', 'bronze', 'silver', 'gold', 'platinum'];

function config() {
  return JSON.parse(readFileSync(process.env.ML_REGRAS || 'regras.json', 'utf8'));
}

function linkAfiliado(permalink, afiliadoId) {
  if (!afiliadoId || !permalink) return permalink ?? null;
  // O formato exato do link é definido pelo painel de Afiliados do Mercado Livre.
  // Aqui o identificador entra como parâmetro na URL; ajuste se o seu painel
  // indicar outro formato.
  const url = new URL(permalink);
  url.searchParams.set('matt_tool', afiliadoId);
  return url.toString();
}

function nivelDoVendedor(u) {
  const raw = u?.seller_reputation?.level_id;          // ex.: "5_green"
  const power = u?.seller_reputation?.power_seller_status; // gold/platinum/silver
  if (power) return power.toLowerCase();
  if (!raw) return null;
  return raw.startsWith('5') ? 'gold' : raw.startsWith('4') ? 'silver' : 'bronze';
}

function passaNoFiltro(item, nivel, f = {}) {
  if (f.preco_max != null && item.price > f.preco_max) return false;
  if (f.preco_min != null && item.price < f.preco_min) return false;
  if (f.vendidos_min != null && (item.sold_quantity ?? 0) < f.vendidos_min) return false;
  if (f.frete_gratis && !item.shipping?.free_shipping) return false;
  if (f.estoque_min != null && (item.available_quantity ?? 0) < f.estoque_min) return false;
  if (f.nivel_vendedor_min) {
    const exigido = NIVEIS.indexOf(f.nivel_vendedor_min.toLowerCase());
    const atual = NIVEIS.indexOf(nivel ?? '');
    if (atual < exigido) return false;
  }
  return item.status === 'active' && (item.available_quantity ?? 0) > 0;
}

async function rodar() {
  const { afiliado_id: afiliadoId, regras } = config();
  const db = abrir();
  const execucao = iniciarExecucao(db);
  const inicio = new Date().toISOString();
  const stats = { encontrados: 0, novos: 0, atualizados: 0, sumiram: 0 };
  const vistos = [];

  try {
    for (const regra of regras) {
      console.log(`\n[sync] regra "${regra.nome}" (${regra.tipo})`);

      const ids = regra.tipo === 'destaques'
        ? await destaques(regra.categoria)
        : await buscar(regra.busca, regra.limite ?? 50);

      console.log(`[sync]   ${ids.length} candidatos`);
      const lista = await itens(ids);
      stats.encontrados += lista.length;

      for (const item of lista) {
        const u = await vendedor(item.seller_id);
        const nivel = nivelDoVendedor(u);
        if (!passaNoFiltro(item, nivel, regra.filtros)) continue;

        const resultado = salvarProduto(db, {
          id: item.id,
          titulo: item.title,
          preco: item.price,
          preco_original: item.original_price ?? null,
          moeda: item.currency_id,
          estoque: item.available_quantity,
          vendidos: item.sold_quantity,
          condicao: item.condition,
          frete_gratis: item.shipping?.free_shipping,
          categoria: item.category_id,
          vendedor_id: item.seller_id,
          vendedor_nivel: nivel,
          thumbnail: item.secure_thumbnail ?? item.thumbnail,
          permalink: item.permalink,
          link_afiliado: linkAfiliado(item.permalink, afiliadoId),
          regra: regra.nome,
          status: item.status
        });

        vistos.push(item.id);
        stats[resultado === 'novo' ? 'novos' : 'atualizados']++;
      }
      console.log(`[sync]   ${vistos.length} aprovados até aqui`);
    }

    stats.sumiram = marcarSumidos(db, vistos, inicio);
    fecharExecucao(db, execucao, stats);

    console.log(
      `\n[sync] concluído: ${stats.novos} novos, ${stats.atualizados} atualizados, ` +
      `${stats.sumiram} marcados como indisponíveis.\n`
    );
  } catch (err) {
    fecharExecucao(db, execucao, stats, err.message);
    console.error(`\n[sync] ERRO: ${err.message}\n`);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

if (process.argv.includes('--loop')) {
  const INTERVALO = Number(process.env.ML_INTERVALO_MIN || 60) * 60_000;
  const ciclo = async () => {
    await rodar();
    console.log(`[sync] próxima execução em ${INTERVALO / 60000} min.`);
  };
  await ciclo();
  setInterval(ciclo, INTERVALO);
} else {
  await rodar();
}
