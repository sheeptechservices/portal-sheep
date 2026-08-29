import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession } from './_admin-handler.js';
import { exigir } from './_permissoes.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  const db = getDb();
  const sessao = await getAdminSession(db, sessionToken).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });
  // A lista de gente do Slack só serve para configurar notificação.
  const recusa = await exigir(db, sessao.usuario, 'configuracoes:notificacoes');
  if (recusa) return res.status(recusa.status).json(recusa.body);

  try {
    const r = await fetch('https://slack.com/api/users.list?limit=200', {
      headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` },
    });
    const data = await r.json() as { ok: boolean; members?: any[] };

    if (!data.ok) return res.status(500).json({ error: 'Slack error' });

    const users = (data.members ?? [])
      .filter((m: any) => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT' && !m.is_restricted)
      .map((m: any) => ({
        id: m.id,
        name: m.real_name || m.name,
        username: m.name,
        avatar: m.profile?.image_48 ?? null,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));

    return res.status(200).json({ users });
  } catch (err) {
    console.error('[slack-users]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
