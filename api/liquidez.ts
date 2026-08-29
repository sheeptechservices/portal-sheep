import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, ensureAdminSchema, autoriaDe, registrarAuditoria, type SessaoAdmin } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getQuery } from './_query.js';
import { randomUUID } from 'crypto';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  await ensureAdminSchema(db);

  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });

  let sessao: SessaoAdmin | null;
  try {
    sessao = await getAdminSession(db, sessionToken);
  } catch {
    return res.status(500).json({ error: 'Internal error' });
  }
  if (!sessao) return res.status(401).json({ error: 'Sessão expirada.' });
  const [autorId, autorNome] = autoriaDe(sessao.usuario);

  // Permissão por ação (ver / lançar / editar / excluir). O `/api/admin-data`
  // tem o porteiro no despacho; esta rota é própria, então pergunta aqui - senão
  // a matriz seria contornável indo direto nela.
  const acaoLiq = req.method === 'POST' ? String(req.body?.action ?? '') : '';
  const permLiq =
    req.method === 'GET' ? 'liquidez:ver'
    : acaoLiq === 'create' ? 'liquidez:lancar'
    : acaoLiq === 'delete' ? 'liquidez:excluir'
    : 'liquidez:editar';
  const recusaLiq = await exigir(db, sessao.usuario, permLiq);
  if (recusaLiq) return res.status(recusaLiq.status).json(recusaLiq.body);

  try {
    if (req.method === 'GET') {
      const qs = Object.fromEntries(getQuery(req)) as Record<string, string>;
      const weekStart = qs.week_start ?? '';

      if (qs.saldos === '1') {
        if (!weekStart) return res.status(400).json({ error: 'week_start é obrigatório' });
        const result = await db.execute({
          sql: `SELECT source, amount FROM liquidez_saldos WHERE week_start = ?`,
          args: [weekStart],
        });
        const saldos: Record<string, number> = {};
        for (const r of result.rows) saldos[r.source as string] = r.amount as number;
        return res.status(200).json({ saldos });
      }

      const weekEnd = qs.week_end ?? '';
      if (!weekStart || !weekEnd) return res.status(400).json({ error: 'week_start e week_end são obrigatórios' });

      const result = await db.execute({
        sql: `SELECT * FROM liquidez_transactions WHERE date >= ? AND date <= ? ORDER BY date, created_at`,
        args: [weekStart, weekEnd],
      });
      const transactions = result.rows.map(r => ({
        id: r.id, date: r.date, source: r.source, type: r.type,
        category: r.category, amount: r.amount, description: r.description,
        realized: Boolean(r.realized), created_at: r.created_at,
        criado_por_nome: r.criado_por_nome ?? null,
        atualizado_por_nome: r.atualizado_por_nome ?? null,
      }));
      return res.status(200).json({ transactions });
    }

    if (req.method === 'POST') {
      const body = req.body ?? {};
      const action: string = body.action ?? '';
      // Toda gravação aqui deixa registro de quem fez, como no /api/admin-data.
      if (action) await registrarAuditoria(db, sessao.usuario, `liquidez:${action}`, body.id ?? body.week_start ?? null);

      if (action === 'create') {
        const { date, source, type, category, amount, description } = body;
        if (!date || !source || !type || !category || amount == null)
          return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
        const id = randomUUID();
        const now = new Date().toISOString();
        await db.execute({
          sql: `INSERT INTO liquidez_transactions
                (id, date, source, type, category, amount, description, realized, created_at, criado_por_id, criado_por_nome)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          args: [id, date, source, type, category, Number(amount), description ?? null, now, autorId, autorNome],
        });
        return res.status(201).json({ ok: true, id });
      }

      if (action === 'update') {
        const { id, date, source, type, category, amount, description } = body;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });
        await db.execute({
          sql: `UPDATE liquidez_transactions SET date=?, source=?, type=?, category=?, amount=?, description=?,
                  atualizado_por_id=?, atualizado_por_nome=?, atualizado_em=?
                WHERE id=?`,
          args: [date, source, type, category, Number(amount), description ?? null, autorId, autorNome, new Date().toISOString(), id],
        });
        return res.status(200).json({ ok: true });
      }

      if (action === 'toggle_realized') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });
        await db.execute({
          sql: `UPDATE liquidez_transactions SET realized = CASE WHEN realized = 1 THEN 0 ELSE 1 END,
                  atualizado_por_id = ?, atualizado_por_nome = ?, atualizado_em = ?
                WHERE id = ?`,
          args: [autorId, autorNome, new Date().toISOString(), id],
        });
        const row = await db.execute({ sql: `SELECT realized FROM liquidez_transactions WHERE id = ?`, args: [id] });
        return res.status(200).json({ ok: true, realized: Boolean(row.rows[0]?.realized) });
      }

      if (action === 'delete') {
        const { id } = body;
        if (!id) return res.status(400).json({ error: 'id obrigatório' });
        await db.execute({ sql: `DELETE FROM liquidez_transactions WHERE id=?`, args: [id] });
        return res.status(200).json({ ok: true });
      }

      if (action === 'set_saldo') {
        const { week_start, source, amount } = body;
        if (!week_start || !source || amount == null)
          return res.status(400).json({ error: 'week_start, source e amount são obrigatórios' });
        const now = new Date().toISOString();
        await db.execute({
          sql: `INSERT INTO liquidez_saldos (week_start, source, amount, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(week_start, source) DO UPDATE SET amount=excluded.amount, updated_at=excluded.updated_at`,
          args: [week_start, source, Number(amount), now],
        });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'action inválida' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/liquidez]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
