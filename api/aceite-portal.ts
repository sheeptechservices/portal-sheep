import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { AUTOR_PORTAL, ensureAdminSchema, marcarEdicao } from './_admin-handler.js';
import { getQuery } from './_query.js';
import { randomBytes } from 'crypto';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

function getDb() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  await ensureAdminSchema(db);

  if (req.method === 'GET') {
    const token = String(getQuery(req).get('token') ?? '');
    if (!token) return res.status(400).json({ error: 'token required' });

    const rowRes = await db.execute({ sql: 'SELECT * FROM aceite_operacoes WHERE token = ?', args: [token] });
    if (!rowRes.rows[0]) return res.status(404).json({ error: 'not_found' });
    const row = rowRes.rows[0] as Record<string, any>;

    // auto-expire
    const now = new Date().toISOString();
    if (String(row.status) === 'PENDENTE' && String(row.token_expires_at) < now) {
      await db.execute({ sql: "UPDATE aceite_operacoes SET status = 'EXPIRADO' WHERE token = ?", args: [token] });
      // Expirar é o prazo vencendo, não alguém agindo: autoria nula, que a UI
      // mostra como "Sistema". Deixar o carimbo do último admin aqui seria mentira.
      await marcarEdicao(db, 'aceite_operacoes', String(row.id), null, null, now);
      row.status = 'EXPIRADO';
    }

    const anexosRes = await db.execute({ sql: 'SELECT * FROM aceite_anexos WHERE operacao_id = ?', args: [String(row.id)] });
    return res.status(200).json({ operacao: row, anexos: anexosRes.rows });
  }

  if (req.method === 'POST') {
    const { action, token } = req.body ?? {};
    if (!token) return res.status(400).json({ error: 'token required' });

    if (action === 'register') {
      const { nome, cpf, cargo, d4signDocUUID, assinaturaDataUrl, fotoIdentidadeDataUrl } = req.body;
      const rowRes = await db.execute({ sql: 'SELECT * FROM aceite_operacoes WHERE token = ?', args: [token] });
      if (!rowRes.rows[0]) return res.status(404).json({ error: 'not_found' });
      const row = rowRes.rows[0] as Record<string, any>;
      if (String(row.status) !== 'PENDENTE') return res.status(400).json({ error: 'not_pending' });

      const protocolo = `FIDC-${new Date().getFullYear()}-${String(row.id).slice(-8).toUpperCase()}`;
      const aceitante = {
        nome, cpf, cargo, protocolo,
        aceitoEm: new Date().toISOString(),
        ...(d4signDocUUID ? { d4signDocUUID } : {}),
        ...(assinaturaDataUrl ? { assinaturaDataUrl } : {}),
        ...(fotoIdentidadeDataUrl ? { fotoIdentidadeDataUrl } : {}),
      };
      await db.execute({ sql: "UPDATE aceite_operacoes SET status = 'ACEITO', aceitante = ? WHERE token = ?", args: [JSON.stringify(aceitante), token] });
      // Quem aceitou é o sacado, do lado de fora: não há usuário do painel para
      // referenciar, e o nome de quem assinou já está em `aceitante`.
      await marcarEdicao(db, 'aceite_operacoes', String(row.id), null, AUTOR_PORTAL, aceitante.aceitoEm);
      return res.status(200).json({ aceitante });
    }

    return res.status(400).json({ error: 'unknown action' });
  }

  return res.status(405).json({ error: 'method not allowed' });
}
