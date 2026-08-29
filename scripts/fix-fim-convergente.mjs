/**
 * Corrige o fim_type de solicitações antigas afetadas pelo bug do nó "nodeConvergente".
 *
 * Bug: o nó convergente sempre gravava fim_type = 2 (Anuência), ignorando a resposta.
 * Regra correta:
 *   - nodeConvergente === true  → fim_type = 3 (Escrow na Nota)
 *   - nodeConvergente === false → fim_type = null (sem fluxo definido)
 *
 * Só registros que passaram pelo convergente têm a chave `nodeConvergente` em `decisions`
 * (quando nodeA1=SIM a operação vira 2 direto e nunca visita o convergente), então o
 * critério é seguro e não afeta Anuências legítimas.
 *
 * Uso:
 *   node scripts/fix-fim-convergente.mjs           (dry-run: só mostra o que mudaria)
 *   node scripts/fix-fim-convergente.mjs --apply    (aplica as alterações)
 */

import { createClient } from '@libsql/client';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APPLY = process.argv.includes('--apply');

const envVars = Object.fromEntries(
  readFileSync(resolve(__dirname, '../.env'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);

const db = createClient({ url: envVars.TURSO_DATABASE_URL, authToken: envVars.TURSO_AUTH_TOKEN });

const FIM_LABEL = { 1: 'Trava Perfeita', 2: 'Anuência', 3: 'Escrow na Nota', 4: 'Repasse', null: '(sem fluxo)' };

async function run() {
  const { rows } = await db.execute('SELECT id, decisions, fim_type FROM solicitacoes WHERE decisions IS NOT NULL AND deleted_at IS NULL');
  let candidatos = 0, mudar = 0;

  for (const row of rows) {
    let dec;
    try { dec = JSON.parse(row.decisions); } catch { continue; }
    if (!dec || typeof dec !== 'object' || !('nodeConvergente' in dec)) continue; // não passou pelo convergente
    candidatos++;

    const atual = row.fim_type === null || row.fim_type === undefined ? null : Number(row.fim_type);
    // O bug só gravava fim_type = 2. Valores diferentes de 2 foram ajustes manuais → preservar.
    if (atual !== 2) continue;
    const correto = dec.nodeConvergente === true ? 3 : null;
    if (atual === correto) continue;

    mudar++;
    console.log(`[${row.id}] convergente=${dec.nodeConvergente}  fim_type: ${FIM_LABEL[atual]} (${atual}) → ${FIM_LABEL[correto]} (${correto})`);

    if (APPLY) {
      await db.execute({ sql: 'UPDATE solicitacoes SET fim_type = ? WHERE id = ?', args: [correto, row.id] });
    }
  }

  console.log(`\n${candidatos} registro(s) passaram pelo convergente · ${mudar} precisam de correção.`);
  console.log(APPLY ? '✓ Alterações aplicadas.' : '⚠ Dry-run — rode com --apply para efetivar.');
}

run().catch(err => { console.error(err); process.exit(1); });
