// ─────────────────────────────────────────────────────────────────────────────
//  A rota da vitrine de profissionais: só o banco e o HTTP.
//
//  A regra mora em `_vitrine.ts`, que roda contra qualquer banco - é o que
//  deixa a bancada provar, com banco em memória, exatamente o que o cliente
//  recebe aqui.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { responderVitrine } from './_vitrine.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return res.status(500).json({ error: 'Banco não configurado.' });
  const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const token = String((req.query?.token ?? '') as string);
  const corpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  const r = await responderVitrine(db, String(req.method ?? 'GET'), token, corpo);
  return res.status(r.status).json(r.body);
}
