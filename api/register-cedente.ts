import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { randomUUID } from 'crypto';
import { ensureAdminSchema } from './_admin-handler.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

/**
 * Auto-cadastro público de cedente (onboarding self-service).
 * Cria/atualiza o cedente como `pendente` na pipeline de aprovação.
 * Retorna o id para o front anexar os documentos via /api/register-cedente-file.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const c = req.body ?? {};
  const cnpj = String(c.cnpj_cpf ?? '').replace(/\D/g, '');
  if (cnpj.length !== 14) return res.status(400).json({ error: 'CNPJ inválido.' });
  if (!c.nome && !c.razao_social) return res.status(400).json({ error: 'Nome/razão social obrigatório.' });

  const db = getDb();
  try {
    await ensureAdminSchema(db);

    // Etapa de entrada = primeira etapa ativa por ordem (fallback 'pendente').
    const entryRow = await db.execute(`SELECT chave FROM cadastro_status_configs WHERE ativo = 1 ORDER BY ordem LIMIT 1`);
    const entryChave = String(entryRow.rows[0]?.chave ?? 'pendente');

    // Já existe cedente aprovado com esse CNPJ? Então deve usar o formulário de solicitação.
    const existing = await db.execute({
      sql: `SELECT id, aprovacao_status FROM cedentes WHERE cnpj_cpf = ? AND ativo = 1 LIMIT 1`,
      args: [cnpj],
    });
    if (existing.rows.length > 0) {
      const aprov = String(existing.rows[0].aprovacao_status ?? 'aprovado');
      if (aprov === 'aprovado') {
        return res.status(409).json({ error: 'Este CNPJ já está cadastrado e aprovado como cedente.' });
      }
      // Cadastro pendente/em análise/rejeitado existente: reaproveita a linha, reseta para pendente
      // e limpa documentos antigos (o front vai reenviar).
      const id = String(existing.rows[0].id);
      await db.execute({
        sql: `UPDATE cedentes SET
                nome=?, razao_social=?, natureza_juridica=?, email=?, nome_responsavel=?,
                email_responsavel=?, wpp_contato=?, endereco_pj=?, endereco_responsavel=?,
                cadastro_extra=?, origem='Auto-cadastro', aprovacao_status=?,
                cadastro_movido_em=?
              WHERE id=?`,
        args: [
          c.nome ?? c.razao_social ?? null, c.razao_social ?? null, c.natureza_juridica ?? null,
          c.email ?? null, c.nome_responsavel ?? null, c.email_responsavel ?? null,
          c.wpp_contato ?? null, c.endereco_pj ?? null, c.endereco_responsavel ?? null,
          c.cadastro_extra ?? null, entryChave, new Date().toISOString(), id,
        ],
      });
      await db.execute({ sql: 'DELETE FROM cedente_arquivos WHERE cedente_id = ?', args: [id] });
      return res.status(200).json({ ok: true, id });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    await db.execute({
      sql: `INSERT INTO cedentes (
              id, nome, cnpj_cpf, razao_social, status, flags, origem, natureza_juridica,
              email, endereco_pj, nome_responsavel, email_responsavel, endereco_responsavel,
              cadastro_extra, possui_escrow, wpp_contato, ativo, aprovacao_status, cadastro_movido_em, criado_em
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
      args: [
        id, c.nome ?? c.razao_social, cnpj, c.razao_social ?? null, 'Ativo', 'Regular', 'Auto-cadastro',
        c.natureza_juridica ?? null, c.email ?? null, c.endereco_pj ?? null,
        c.nome_responsavel ?? null, c.email_responsavel ?? null, c.endereco_responsavel ?? null,
        c.cadastro_extra ?? null, 0, c.wpp_contato ?? null, entryChave, now, now,
      ],
    });
    return res.status(200).json({ ok: true, id });
  } catch (err) {
    console.error('[register-cedente]', err);
    return res.status(500).json({ error: 'Erro ao enviar cadastro. Tente novamente.' });
  }
}
