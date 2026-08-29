/**
 * Unwrap email_responsavel back to plain string (it's a single-email field).
 * Run: node scripts/fix-email-responsavel.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const db = createClient({ url: envVars.TURSO_DATABASE_URL, authToken: envVars.TURSO_AUTH_TOKEN });

async function run() {
  const { rows } = await db.execute('SELECT id, email_responsavel FROM cedentes');
  let updated = 0;

  for (const row of rows) {
    const raw = row.email_responsavel;
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed)) continue;

    const plain = parsed[0] ?? null;
    console.log(`[${row.id}] "${raw}" → ${plain}`);
    await db.execute({ sql: 'UPDATE cedentes SET email_responsavel = ? WHERE id = ?', args: [plain, row.id] });
    updated++;
  }

  console.log(`\n✓ ${updated} email_responsavel(s) convertidos de array para string simples.\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
