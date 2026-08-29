// Migra todo o schema + dados de um banco Turso (ORIGEM) para outro (DESTINO).
// Uso:
//   1) Crie um banco novo no Turso (de preferência num GRUPO novo, região US East).
//   2) Rode:
//      OLD_URL=libsql://... OLD_TOKEN=... NEW_URL=libsql://... NEW_TOKEN=... node scripts/migrate-turso.mjs
//   (Se OLD_URL/OLD_TOKEN não forem passados, usa TURSO_DATABASE_URL/TURSO_AUTH_TOKEN do .env)
import fs from 'fs';
import { createClient } from '@libsql/client';

function envFromDotenv() {
  const env = {};
  try {
    for (const l of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
      const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {}
  return env;
}

const de = envFromDotenv();
const OLD_URL = process.env.OLD_URL || de.TURSO_DATABASE_URL;
const OLD_TOKEN = process.env.OLD_TOKEN || de.TURSO_AUTH_TOKEN;
const NEW_URL = process.env.NEW_URL || de.NEW_URL;
const NEW_TOKEN = process.env.NEW_TOKEN || de.NEW_TOKEN;

if (!OLD_URL || !OLD_TOKEN) { console.error('Faltam OLD_URL/OLD_TOKEN (ou TURSO_* no .env).'); process.exit(1); }
if (!NEW_URL || !NEW_TOKEN) { console.error('Faltam NEW_URL/NEW_TOKEN (do banco novo).'); process.exit(1); }

const old = createClient({ url: OLD_URL, authToken: OLD_TOKEN });
const neu = createClient({ url: NEW_URL, authToken: NEW_TOKEN });

const ident = (n) => '"' + String(n).replace(/"/g, '""') + '"';

async function main() {
  console.log('Lendo schema da origem…');
  const tablesRes = await old.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND sql IS NOT NULL ORDER BY name`
  );
  const indexesRes = await old.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL ORDER BY name`
  );
  const tables = tablesRes.rows;
  console.log(`Tabelas: ${tables.map(t => t.name).join(', ')}`);

  for (const t of tables) {
    const name = String(t.name);
    // Cria a tabela no destino (idempotente)
    const createSql = String(t.sql).replace(/CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS');
    await neu.execute(createSql);

    const data = await old.execute(`SELECT * FROM ${ident(name)}`);
    if (data.rows.length === 0) { console.log(`  ${name}: 0 linhas`); continue; }

    const cols = data.columns;
    const colList = cols.map(ident).join(', ');
    const placeholders = '(' + cols.map(() => '?').join(', ') + ')';
    const sql = `INSERT INTO ${ident(name)} (${colList}) VALUES ${placeholders}`;

    // Insere em lotes
    const batchSize = 100;
    for (let i = 0; i < data.rows.length; i += batchSize) {
      const slice = data.rows.slice(i, i + batchSize);
      const stmts = slice.map(row => ({ sql, args: cols.map(c => row[c] ?? null) }));
      await neu.batch(stmts, 'write');
    }
    console.log(`  ${name}: ${data.rows.length} linhas migradas`);
  }

  // Recria índices customizados (autoindex é recriado sozinho)
  for (const idx of indexesRes.rows) {
    try {
      const s = String(idx.sql).replace(/CREATE INDEX/i, 'CREATE INDEX IF NOT EXISTS').replace(/CREATE UNIQUE INDEX/i, 'CREATE UNIQUE INDEX IF NOT EXISTS');
      await neu.execute(s);
    } catch (e) { console.warn(`  índice ${idx.name}: ${e.message}`); }
  }

  console.log('✅ Migração concluída. Atualize TURSO_DATABASE_URL/TURSO_AUTH_TOKEN (.env + Vercel) para o banco novo.');
}

main().catch(e => { console.error('Falhou:', e.message); process.exit(1); });
