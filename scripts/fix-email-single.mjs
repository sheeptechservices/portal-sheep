/**
 * Unwrap single-element JSON arrays in the `email` column back to plain strings.
 * Multi-email arrays (2+ items) are kept as JSON arrays.
 * Run: node scripts/fix-email-single.mjs
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
  const { rows } = await db.execute('SELECT id, email FROM cedentes');
  let updated = 0;

  for (const row of rows) {
    const raw = row.email;
    if (!raw) continue;
    let parsed;
    try { parsed = JSON.parse(raw); } catch { continue; }
    if (!Array.isArray(parsed) || parsed.length !== 1) continue;

    const plain = parsed[0] ?? null;
    console.log(`[${row.id}] ${raw} → ${plain}`);
    await db.execute({ sql: 'UPDATE cedentes SET email = ? WHERE id = ?', args: [plain, row.id] });
    updated++;
  }

  console.log(`\n✓ ${updated} email(s) de array unitário convertidos para string simples.\n`);
}

run().catch(err => { console.error(err); process.exit(1); });
