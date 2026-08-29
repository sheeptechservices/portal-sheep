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

  const { solicitacaoId, arquivo } = req.body ?? {};

  if (!solicitacaoId || !arquivo?.base64 || !arquivo.nome) {
    return res.status(400).json({ error: 'Dados ausentes.' });
  }

  const db = getDb();
  try {
    const row = await db.execute({
      sql: 'SELECT id FROM solicitacoes WHERE id = ? LIMIT 1',
      args: [solicitacaoId],
    });
    if (row.rows.length === 0) return res.status(404).json({ error: 'Solicitação não encontrada.' });

    await db.execute({
      sql: `INSERT INTO solicitacao_arquivos (solicitacao_id, categoria, nome, tipo, tamanho, base64)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        solicitacaoId,
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
