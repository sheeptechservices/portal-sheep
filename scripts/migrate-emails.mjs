/**
 * One-time migration: normalize email columns in cedentes table
 * from comma-separated strings to JSON arrays (or plain string for single emails).
 *
 * Matches the serialization logic used by the frontend (serializeEmails).
 *
 * Run: node scripts/migrate-emails.mjs
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (no dotenv dependency needed)
const envPath = resolve(__dirname, '../.env');
const envVars = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^["']|["']$/g, '')];
    })
);

const db = createClient({
  url: envVars.TURSO_DATABASE_URL,
  authToken: envVars.TURSO_AUTH_TOKEN,
});

function parseEmails(raw) {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(e => typeof e === 'string' && e.trim());
  } catch {}
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

function serializeEmails(emails) {
  const clean = emails.filter(e => e.trim());
  if (clean.length === 0) return null;
  return JSON.stringify(clean);
}

function needsMigration(raw) {
  if (!raw || !raw.trim()) return false;
  // Already a JSON array → skip
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return false;
  } catch {}
  // Plain string (single or comma-separated) → needs migration
  return true;
}

async function run() {
  const { rows } = await db.execute('SELECT id, email, email_responsavel FROM cedentes');

  console.log(`\nTotal de cedentes: ${rows.length}`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const id = row.id;
    const emailRaw = row.email;
    const emailRespRaw = row.email_responsavel;

    const migrateEmail = needsMigration(emailRaw);
    const migrateResp  = needsMigration(emailRespRaw);

    if (!migrateEmail && !migrateResp) {
      skipped++;
      continue;
    }

    const newEmail     = migrateEmail ? serializeEmails(parseEmails(emailRaw))     : emailRaw;
    const newEmailResp = migrateResp  ? serializeEmails(parseEmails(emailRespRaw)) : emailRespRaw;

    console.log(`\n[${id}]`);
    if (migrateEmail) console.log(`  email:             "${emailRaw}" → ${newEmail}`);
    if (migrateResp)  console.log(`  email_responsavel: "${emailRespRaw}" → ${newEmailResp}`);

    await db.execute({
      sql: 'UPDATE cedentes SET email = ?, email_responsavel = ? WHERE id = ?',
      args: [newEmail, newEmailResp, id],
    });

    updated++;
  }

  console.log(`\n✓ Migração concluída: ${updated} atualizado(s), ${skipped} sem alteração.\n`);
}

run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
