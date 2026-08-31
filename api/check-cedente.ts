import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { ensureAdminSchema } from './_admin-handler.js';
import { getQuery } from './_query.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const cnpj = String(getQuery(req).get('cnpj') ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido' });

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  // Garante que a coluna aprovacao_status exista (cacheado após a 1ª chamada na instância)
  await ensureAdminSchema(db);

  const r = await db.execute({
    sql: 'SELECT id, nome, razao_social, aprovacao_status FROM cedentes WHERE cnpj_cpf = ? AND ativo = 1 LIMIT 1',
    args: [cnpj],
  });

  if (r.rows.length > 0) {
    const aprov = String(r.rows[0].aprovacao_status ?? 'aprovado');
    // Só libera o formulário de lead quando o cadastro está aprovado.
    if (aprov === 'aprovado') {
      return res.status(200).json({ found: true, nome: r.rows[0].razao_social || r.rows[0].nome, nome_curto: r.rows[0].nome });
    }
    // Cadastro existe mas ainda não foi aprovado (ou foi rejeitado).
    return res.status(200).json({ found: false, pending: aprov !== 'rejeitado', rejected: aprov === 'rejeitado' });
  }
  return res.status(200).json({ found: false });
}
