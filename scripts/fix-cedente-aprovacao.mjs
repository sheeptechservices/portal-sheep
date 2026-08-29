/**
 * Corrige cedentes de REGISTRO DIRETO ("+ Novo cedente") que ficaram presos em
 * aprovacao_status != 'aprovado' por causa de um bug no create_cedente
 * (setava a 1ª etapa do pipeline para todo cedente, não só os de onboarding).
 *
 * Esses cedentes somem da lista de Cedentes (filtra por 'aprovado') e não
 * aparecem no board de Onboarding (filtra origem='Auto-cadastro') → invisíveis.
 *
 * Critério seguro: só toca cedentes com origem != 'Auto-cadastro' (os de
 * onboarding legitimamente ficam pendentes até aprovação). NULL fica como está
 * (a lista já trata NULL como aprovado).
 *
 * Uso:
 *   node scripts/fix-cedente-aprovacao.mjs           (dry-run)
 *   node scripts/fix-cedente-aprovacao.mjs --apply    (aplica)
 */
import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });

async function run() {
  const { rows } = await db.execute(`
    SELECT id, nome, origem, aprovacao_status
    FROM cedentes
    WHERE ativo = 1
      AND (origem IS NULL OR origem != 'Auto-cadastro')
      AND aprovacao_status IS NOT NULL
      AND aprovacao_status != 'aprovado'
    ORDER BY criado_em DESC
  `);

  for (const r of rows) {
    console.log(`[${r.id}] ${r.nome}  origem="${r.origem ?? '(null)'}"  ${r.aprovacao_status} → aprovado`);
    if (APPLY) {
      await db.execute({ sql: `UPDATE cedentes SET aprovacao_status = 'aprovado' WHERE id = ?`, args: [r.id] });
    }
  }

  console.log(`\n${rows.length} cedente(s) de registro direto presos em status não-aprovado.`);
  console.log(APPLY ? '✓ Corrigidos para "aprovado".' : '⚠ Dry-run — rode com --apply para efetivar.');
}

run().catch(err => { console.error(err); process.exit(1); });
