import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getNovaSubmissaoRecipients } from './_admin-handler.js';

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
  return res.json() as Promise<{ ok: boolean; ts?: string; error?: string; channel?: { id: string } }>;
}

async function resolveChannel(channelId: string): Promise<string> {
  if (channelId.startsWith('U')) {
    const result = await slackCall('conversations.open', { users: channelId });
    if (result.ok && result.channel?.id) return result.channel.id;
  }
  return channelId;
}

const FIM_LABELS: Record<number, string> = {
  1: 'Escrow direto na operação',
  2: 'Pagamento direto / Domicílio bancário',
  3: 'Escrow na nota + aceite via email',
};

function buildBlocks(data: Record<string, any>, fimType?: number, arquivosCount?: number) {
  const row = (l1: string, v1: string, l2: string, v2: string) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*${l1}*   |   *${l2}*\n${v1}   |   ${v2}`,
    },
  });

  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '✅ Nova solicitação recebida', emoji: true },
    },
    row('Empresa Contratado', data.nomeContratado ?? '-', 'Empresa Sacado', data.nomeSacado ?? '-'),
    row('CNPJ Contratado', data.cnpjContratado ?? '-', 'CNPJ Sacado', data.cnpjSacado ?? '-'),
    { type: 'divider' },
    row('Valor', data.valor ?? '-', 'Prazo limite', data.prazoLimite ?? '-'),
  ];

  if (fimType) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*Fluxo*\n${FIM_LABELS[fimType] ?? `FIM ${fimType}`}` },
    });
  }

  blocks.push({ type: 'divider' });

  const contextElements: unknown[] = [
    { type: 'mrkdwn', text: '✅ Formulário completo e enviado' },
  ];

  if (arquivosCount && arquivosCount > 0) {
    contextElements.push({
      type: 'mrkdwn',
      text: `📎 ${arquivosCount} arquivo${arquivosCount !== 1 ? 's' : ''} enviado${arquivosCount !== 1 ? 's' : ''}`,
    });
  }

  blocks.push({ type: 'context', elements: contextElements });

  return {
    text: `✅ Nova solicitação - ${data.nomeContratado ?? data.cnpjContratado ?? '-'}`,
    blocks,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { data, fimType, arquivosCount } = req.body ?? {};

  if (!data) return res.status(400).json({ error: 'Missing data' });

  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN!,
    });
    const recipients = await getNovaSubmissaoRecipients(db);

    if (recipients.length === 0) {
      return res.status(200).json({ ok: true });
    }

    const message = buildBlocks(data, fimType, arquivosCount);
    for (const userId of recipients) {
      const channel = await resolveChannel(userId);
      const result = await slackCall('chat.postMessage', { channel, ...message });
      if (!result.ok) console.error('[slack] postMessage failed:', result.error);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[slack]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
