import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { oportunidadeId, arquivo } = req.body ?? {};

  if (!oportunidadeId || !arquivo?.base64 || !arquivo.nome) {
    return res.status(400).json({ error: 'Dados ausentes.' });
  }

  const db = getDb();
  try {
    const row = await db.execute({
      sql: 'SELECT id FROM oportunidades WHERE id = ? LIMIT 1',
      args: [oportunidadeId],
    });
    if (row.rows.length === 0) return res.status(404).json({ error: 'Oportunidade não encontrada.' });

    await db.execute({
      sql: `INSERT INTO oportunidade_arquivos (oportunidade_id, categoria, nome, tipo, tamanho, base64)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        oportunidadeId,
        arquivo.categoria ?? '',
        arquivo.nome,
        arquivo.tipo ?? '',
        arquivo.tamanho ?? 0,
        arquivo.base64,
      ],
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[submit-file]', err);
    return res.status(500).json({ error: 'Erro ao salvar arquivo.' });
  }
}
