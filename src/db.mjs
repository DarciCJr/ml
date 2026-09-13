// Banco SQLite (embutido no Node, sem dependências).
import { DatabaseSync } from 'node:sqlite';

const ARQUIVO = process.env.ML_DB || 'produtos.db';

export function abrir() {
  const db = new DatabaseSync(ARQUIVO);
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS produtos (
      id                TEXT PRIMARY KEY,
      titulo            TEXT NOT NULL,
      preco             REAL,
      preco_original    REAL,
      moeda             TEXT,
      estoque           INTEGER,
      vendidos          INTEGER,
      condicao          TEXT,
      frete_gratis      INTEGER,
      categoria         TEXT,
      vendedor_id       INTEGER,
      vendedor_nivel    TEXT,
      thumbnail         TEXT,
      permalink         TEXT,
      link_afiliado     TEXT,
      regra             TEXT,
      status            TEXT,
      disponivel        INTEGER NOT NULL DEFAULT 1,
      visto_em          TEXT NOT NULL,
      criado_em         TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_disponivel ON produtos(disponivel, regra);
    CREATE INDEX IF NOT EXISTS idx_categoria  ON produtos(categoria);

    -- Histórico para detectar queda de preço.
    CREATE TABLE IF NOT EXISTS precos (
      produto_id  TEXT NOT NULL,
      preco       REAL NOT NULL,
      registrado_em TEXT NOT NULL,
      PRIMARY KEY (produto_id, registrado_em)
    );

    CREATE TABLE IF NOT EXISTS execucoes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      iniciado_em  TEXT NOT NULL,
      terminado_em TEXT,
      encontrados  INTEGER DEFAULT 0,
      novos        INTEGER DEFAULT 0,
      atualizados  INTEGER DEFAULT 0,
      sumiram      INTEGER DEFAULT 0,
      erro         TEXT
    );
  `);
  return db;
}

export function salvarProduto(db, p) {
  const agora = new Date().toISOString();
  const existente = db.prepare('SELECT preco FROM produtos WHERE id = ?').get(p.id);

  db.prepare(`
    INSERT INTO produtos (
      id, titulo, preco, preco_original, moeda, estoque, vendidos, condicao,
      frete_gratis, categoria, vendedor_id, vendedor_nivel, thumbnail,
      permalink, link_afiliado, regra, status, disponivel, visto_em, criado_em
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    ON CONFLICT(id) DO UPDATE SET
      titulo = excluded.titulo,
      preco = excluded.preco,
      preco_original = excluded.preco_original,
      estoque = excluded.estoque,
      vendidos = excluded.vendidos,
      frete_gratis = excluded.frete_gratis,
      vendedor_nivel = excluded.vendedor_nivel,
      thumbnail = excluded.thumbnail,
      permalink = excluded.permalink,
      link_afiliado = excluded.link_afiliado,
      regra = excluded.regra,
      status = excluded.status,
      disponivel = 1,
      visto_em = excluded.visto_em
  `).run(
    p.id, p.titulo, p.preco, p.preco_original, p.moeda, p.estoque, p.vendidos,
    p.condicao, p.frete_gratis ? 1 : 0, p.categoria, p.vendedor_id,
    p.vendedor_nivel, p.thumbnail, p.permalink, p.link_afiliado, p.regra,
    p.status, agora, agora
  );

  // Só registra no histórico quando o preço muda.
  if (!existente || existente.preco !== p.preco) {
    db.prepare('INSERT OR REPLACE INTO precos VALUES (?,?,?)').run(p.id, p.preco, agora);
  }

  return existente ? 'atualizado' : 'novo';
}

/** Marca como indisponível o que não apareceu nesta execução. */
export function marcarSumidos(db, idsVistos, inicio) {
  if (!idsVistos.length) return 0;
  const marcadores = idsVistos.map(() => '?').join(',');
  const r = db.prepare(
    `UPDATE produtos SET disponivel = 0
     WHERE disponivel = 1 AND visto_em < ? AND id NOT IN (${marcadores})`
  ).run(inicio, ...idsVistos);
  return r.changes;
}

export function iniciarExecucao(db) {
  const r = db.prepare('INSERT INTO execucoes (iniciado_em) VALUES (?)')
    .run(new Date().toISOString());
  return r.lastInsertRowid;
}

export function fecharExecucao(db, id, stats, erro = null) {
  db.prepare(`
    UPDATE execucoes SET terminado_em = ?, encontrados = ?, novos = ?,
      atualizados = ?, sumiram = ?, erro = ? WHERE id = ?
  `).run(
    new Date().toISOString(), stats.encontrados, stats.novos,
    stats.atualizados, stats.sumiram, erro, id
  );
}
