import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { validateAdminSession } from './_admin-handler.js';
import { getQuery } from './_query.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  const valid = await validateAdminSession(db, sessionToken).catch(() => false);
  if (!valid) return res.status(401).json({ error: 'Unauthorized' });

  const id = getQuery(req).get('id') ?? undefined;

  try {
    if (id) {
      const sub = await db.execute({ sql: 'SELECT * FROM leads WHERE id = ?', args: [id] });
      if (sub.rows.length === 0) return res.status(404).json({ error: 'Not found' });

      const arqs = await db.execute({
        sql: 'SELECT id, categoria, nome, tipo, tamanho, base64 FROM lead_arquivos WHERE lead_id = ?',
        args: [id],
      });

      return res.status(200).json({ submission: sub.rows[0], arquivos: arqs.rows });
    }

    const result = await db.execute(`
      SELECT s.*, COUNT(a.id) AS arquivo_count
      FROM leads s
      LEFT JOIN lead_arquivos a ON a.lead_id = s.id
      GROUP BY s.id
      ORDER BY s.created_at DESC
    `);

    return res.status(200).json({ submissions: result.rows });
  } catch (err) {
    console.error('[submissions]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
