import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

async function insertArquivo(db: ReturnType<typeof getDb>, cedenteId: string, arquivo: any, base64: string) {
  // Grava a categoria na coluna estruturada (usada pelo admin) e mantém o prefixo no
  // nome como fallback legado (ex.: "RG - foto.pdf") para inferência em registros antigos.
  await db.execute({
    sql: `INSERT INTO cedente_arquivos (cedente_id, nome, tipo, tamanho, base64, categoria, criado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      cedenteId,
      arquivo.categoria ? `${arquivo.categoria} - ${arquivo.nome}` : arquivo.nome,
      arquivo.tipo ?? '',
      arquivo.tamanho ?? 0,
      base64,
      arquivo.categoria ?? null,
      new Date().toISOString(),
    ],
  });
}

/**
 * Upload público de documento do auto-cadastro.
 *
 * Suporta upload em PEDAÇOS (chunks) para não esbarrar no limite de body da função
 * Vercel (~4,5 MB) - antes, documentos da empresa perto de 3 MB (que viram ~4 MB em
 * base64) falhavam silenciosamente. Fluxo: N chamadas `action:'chunk'` + 1 `finalize`.
 * Mantém o modo antigo (envio único com `arquivo.base64`) por compatibilidade.
 *
 * Só aceita anexos enquanto o cadastro ainda NÃO foi aprovado (janela de cadastro).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body ?? {};
  const action = String(body.action ?? '');
  const cedenteId = body.cedenteId;
  if (!cedenteId) return res.status(400).json({ error: 'Dados ausentes.' });

  const db = getDb();
  try {
    const row = await db.execute({
      sql: 'SELECT aprovacao_status FROM cedentes WHERE id = ? AND ativo = 1 LIMIT 1',
      args: [cedenteId],
    });
    if (row.rows.length === 0) return res.status(404).json({ error: 'Cadastro não encontrado.' });
    if (String(row.rows[0].aprovacao_status ?? 'aprovado') === 'aprovado') {
      return res.status(403).json({ error: 'Cadastro já aprovado; upload não permitido.' });
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS cedente_file_chunks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        cedente_id TEXT NOT NULL,
        file_id    TEXT NOT NULL,
        seq        INTEGER NOT NULL,
        chunk      TEXT NOT NULL,
        criado_em  TEXT NOT NULL
      )
    `);

    // Um pedaço de um arquivo - mantém o body pequeno.
    if (action === 'chunk') {
      const { fileId, seq, chunk } = body;
      if (!fileId || typeof chunk !== 'string' || seq == null) return res.status(400).json({ error: 'Chunk inválido.' });
      await db.execute({
        sql: 'INSERT INTO cedente_file_chunks (cedente_id, file_id, seq, chunk, criado_em) VALUES (?,?,?,?,?)',
        args: [cedenteId, String(fileId), Number(seq), chunk, new Date().toISOString()],
      });
      return res.status(200).json({ ok: true });
    }

    // Remonta os pedaços e grava o documento.
    if (action === 'finalize') {
      const { fileId, arquivo } = body;
      if (!fileId || !arquivo?.nome) return res.status(400).json({ error: 'Dados ausentes.' });
      const rows = await db.execute({
        sql: 'SELECT chunk FROM cedente_file_chunks WHERE cedente_id = ? AND file_id = ? ORDER BY seq ASC',
        args: [cedenteId, String(fileId)],
      });
      const base64 = rows.rows.map(r => String(r.chunk)).join('');
      if (!base64) return res.status(400).json({ error: 'Nenhum conteúdo recebido.' });
      await insertArquivo(db, cedenteId, arquivo, base64);
      await db.execute({ sql: 'DELETE FROM cedente_file_chunks WHERE cedente_id = ? AND file_id = ?', args: [cedenteId, String(fileId)] }).catch(() => {});
      await db.execute({ sql: 'DELETE FROM cedente_file_chunks WHERE criado_em < ?', args: [new Date(Date.now() - 3600_000).toISOString()] }).catch(() => {});
      return res.status(200).json({ ok: true });
    }

    // Modo antigo: envio único (compatibilidade).
    const { arquivo } = body;
    if (!arquivo?.base64 || !arquivo.nome) return res.status(400).json({ error: 'Dados ausentes.' });
    await insertArquivo(db, cedenteId, arquivo, arquivo.base64);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[register-cedente-file]', err);
    return res.status(500).json({ error: 'Erro ao salvar documento.' });
  }
}
