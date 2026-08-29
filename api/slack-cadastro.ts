import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getCadastroSubmissaoRecipients } from './_admin-handler.js';

const SLACK_API = 'https://slack.com/api';

async function slackCall(method: string, body: Record<string, unknown>) {
  const res = await fetch(`${SLACK_API}/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<{ ok: boolean; error?: string; channel?: { id: string } }>;
}

async function resolveChannel(channelId: string): Promise<string> {
  if (channelId.startsWith('U')) {
    const result = await slackCall('conversations.open', { users: channelId });
    if (result.ok && result.channel?.id) return result.channel.id;
  }
  return channelId;
}

function maskCnpj(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v ?? '-';
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { nome, cnpj, responsavel, email, whatsapp } = req.body ?? {};

  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const recipients = await getCadastroSubmissaoRecipients(db);
    if (recipients.length === 0) return res.status(200).json({ ok: true });

    const message = {
      text: `🆕 Novo cadastro de cedente - ${nome ?? maskCnpj(cnpj)}`,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '🆕 Novo cadastro de cedente', emoji: true } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Empresa*\n${nome ?? '-'} (${maskCnpj(cnpj)})` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Responsável*   |   *Contato*\n${responsavel ?? '-'}   |   ${email ?? '-'} · ${whatsapp ?? '-'}` } },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: '⏳ Aguardando análise na pipeline de Aprovação de Cadastros' }] },
      ],
    };

    for (const userId of recipients) {
      const channel = await resolveChannel(userId);
      const result = await slackCall('chat.postMessage', { channel, ...message });
      if (!result.ok) console.error('[slack-cadastro] postMessage failed:', result.error);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[slack-cadastro]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
