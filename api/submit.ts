import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';
import { ensureAdminSchema, getEntryStatusId } from './_admin-handler.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

async function ensureSchema(db: ReturnType<typeof getDb>) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS leads (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      cnpj_contratado    TEXT,
      nome_contratado    TEXT,
      situacao_contratado TEXT,
      cnpj_sacado        TEXT,
      nome_sacado        TEXT,
      situacao_sacado    TEXT,
      valor              TEXT,
      valor_numerico     REAL,
      prazo_limite       TEXT,
      decisions          TEXT,
      fim_type           INTEGER
    )
  `);
  try { await db.execute(`ALTER TABLE leads ADD COLUMN parcelas TEXT`); } catch {}
  try { await db.execute(`ALTER TABLE leads ADD COLUMN previsao_execucao TEXT`); } catch {}
  try { await db.execute(`ALTER TABLE leads ADD COLUMN data_execucao TEXT`); } catch {}

  await db.execute(`
    CREATE TABLE IF NOT EXISTS lead_arquivos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      categoria      TEXT NOT NULL,
      nome           TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      tamanho        INTEGER NOT NULL,
      base64         TEXT NOT NULL
    )
  `);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, createdAt, formData } = req.body ?? {};

  if (!id || !createdAt || !formData) {
    return res.status(400).json({ error: 'Dados obrigatórios ausentes.' });
  }

  const db = getDb();

  try {
    await ensureSchema(db);
    // Garante colunas novas (aprovacao_status etc.) antes de consultar o cedente
    await ensureAdminSchema(db);

    // Enforce cedente restriction + capture cedente_id
    const cnpjDigits = (formData.cnpjContratado ?? '').replace(/\D/g, '');
    let cedenteId: string | null = null;
    if (cnpjDigits.length === 14) {
      const cedente = await db.execute({
        sql: `SELECT id FROM cedentes WHERE cnpj_cpf = ? AND ativo = 1 AND (aprovacao_status IS NULL OR aprovacao_status = 'aprovado') LIMIT 1`,
        args: [cnpjDigits],
      });
      if (cedente.rows.length === 0) {
        return res.status(403).json({ error: 'CNPJ não está cadastrado/aprovado como cedente.' });
      }
      cedenteId = String(cedente.rows[0].id);
    }

    // Auto-register sacado if not yet in DB
    const cnpjSacadoDigits = (formData.cnpjSacado ?? '').replace(/\D/g, '');
    let sacadoId: string | null = null;
    if (cnpjSacadoDigits.length >= 11) {
      const existing = await db.execute({
        sql: 'SELECT id FROM sacados WHERE cnpj_cpf = ? LIMIT 1',
        args: [cnpjSacadoDigits],
      });
      if (existing.rows.length > 0) {
        sacadoId = String(existing.rows[0].id);
      } else {
        const newId = randomUUID();
        await db.execute({
          sql: 'INSERT INTO sacados (id, cnpj_cpf, razao_social, criado_em) VALUES (?, ?, ?, ?)',
          args: [newId, cnpjSacadoDigits, formData.nomeSacado ?? null, createdAt],
        });
        sacadoId = newId;
      }
    }

    await db.execute({
      sql: `INSERT INTO leads (
              id, created_at,
              cnpj_contratado, nome_contratado, situacao_contratado,
              cnpj_sacado, nome_sacado, situacao_sacado,
              valor, valor_numerico, prazo_limite,
              decisions, fim_type, cedente_id, sacado_id, parcelas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        id,
        createdAt,
        cnpjDigits || null,
        formData.nomeContratado ?? null,
        formData.situacaoContratado ?? null,
        cnpjSacadoDigits || null,
        formData.nomeSacado ?? null,
        formData.situacaoSacado ?? null,
        formData.valor ?? null,
        formData.valorNumerico ?? null,
        formData.prazoLimite ?? null,
        formData.decisions ? JSON.stringify(formData.decisions) : null,
        formData.fimType ?? null,
        cedenteId,
        sacadoId,
        formData.parcelas ? JSON.stringify(formData.parcelas) : null,
      ],
    });

    // Auto-assign the configured entry stage (Configurações → Etapas)
    try {
      await ensureAdminSchema(db);
      const statusId = await getEntryStatusId(db);
      if (statusId !== null) {
        await db.execute({
          sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em)
                VALUES (?, 'status_change', ?, 'Lead recebida', ?)`,
          args: [id, statusId, createdAt],
        });
      }
    } catch (e) {
      console.warn('[submit] auto-assign status failed:', e);
    }

    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[submit]', err);
    return res.status(500).json({ error: 'Erro ao salvar lead. Tente novamente.' });
  }
}
