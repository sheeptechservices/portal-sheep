import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigirFerramenta } from './_permissoes.js';
import { preencherProposta, type EventoDaProposta } from './_proposta-ia.js';

// ─────────────────────────────────────────────────────────────────────────────
//  /api/proposta-ia
//
//  A proposta preenchida pela IA, a partir da oportunidade. Endpoint próprio,
//  e não mais uma ação do `/api/admin-data`, pelo mesmo motivo da análise de
//  vaga: esta responde em fluxo. Ler as transcrições e escrever a proposta
//  inteira leva um minuto, e um minuto sem notícia parece tela travada - numa
//  ação que custa dinheiro e que ninguém quer clicar duas vezes na dúvida.
//
//  Cada evento é uma linha `data:` com um JSON: leu o card, leu a reunião tal,
//  está escrevendo o cronograma. O último diz `pronto`, com a proposta, ou
//  `erro`. Erro antes do primeiro byte sai como JSON normal, com status.
// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  const token = String(req.headers['x-admin-session'] ?? '');
  const sessao = await getAdminSession(db, token).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });

  // A mesma porta do gerador: quem monta a proposta pode pedir o rascunho.
  const recusa = await exigirFerramenta(db, sessao.usuario, 'propostas:ver');
  if (recusa) return res.status(recusa.status).json(recusa.body);

  const oportunidadeId = String(req.body?.oportunidade_id ?? '').trim();
  const contexto = String(req.body?.contexto ?? '').trim().slice(0, 20000);
  if (!oportunidadeId) return res.status(400).json({ error: 'Escolha a oportunidade primeiro.' });

  // Fica registrado quem pediu: lê as reuniões do cliente e gasta na conta da
  // casa.
  await registrarAuditoria(db, sessao.usuario, 'proposta_ia', oportunidadeId);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-transform` e o `X-Accel-Buffering` impedem um proxy pelo caminho de
    // juntar tudo e entregar no fim.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const mandar = (dado: unknown) => { res.write(`data: ${JSON.stringify(dado)}\n\n`); };

  try {
    const informado = req.body?.informado && typeof req.body.informado === 'object'
      ? req.body.informado : undefined;
    // A volta de uma pergunta traz o estado que a tela guardou e as respostas.
    // O estado tem teto: é a conversa do modelo, e não um lugar para despejar
    // qualquer coisa.
    const cru = req.body?.retomada;
    const retomada = cru && typeof cru.estado === 'string' && cru.estado.length <= 2_000_000
      && Array.isArray(cru.respostas)
      ? {
        estado: cru.estado,
        respostas: cru.respostas.slice(0, 4).map((r: any) => ({
          id: String(r?.id ?? ''),
          resposta: r?.resposta == null ? null : String(r.resposta),
        })),
      }
      : undefined;
    const r = await preencherProposta(db, { oportunidadeId, contexto, informado, retomada },
      (e: EventoDaProposta) => mandar(e));
    // Parou numa pergunta: o fluxo termina aqui, e a resposta volta num pedido
    // novo, com o estado que vai junto.
    if ('pausa' in r) mandar({ tipo: 'pergunta', ...r.pausa });
    else if (r.status !== 200) mandar({ tipo: 'erro', error: r.body?.error ?? 'Não foi possível preencher.' });
    else mandar({ tipo: 'pronto', ...r.body });
  } catch (e: any) {
    mandar({ tipo: 'erro', error: e?.message || 'Não foi possível preencher.' });
  }
  res.end();
}
