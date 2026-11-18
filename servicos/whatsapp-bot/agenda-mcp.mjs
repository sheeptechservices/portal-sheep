// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: agenda ações no portal, e mensagens nos grupos
//  do WhatsApp, para um horário.
//
//  "Amanhã às 9h move o 977 para Fazendo", "toda segunda às 8h cria a tarefa
//  Relatório semanal". O modelo resolve tudo na hora do pedido - o card, a
//  etapa, os campos - e grava a chamada exata da ferramenta do portal. No
//  horário, quem executa é o próprio bot, sem IA no meio: roda exatamente o
//  que a pessoa confirmou ao agendar e avisa no privado.
//
//  Quem guarda a agenda é o processo do bot (index.mjs), e este servidor só
//  fala com ele pela rota interna: um dono só para o arquivo, sem duas mãos
//  escrevendo ao mesmo tempo.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline';

const AGENDA_URL = process.env.AGENDA_URL ?? '';
const AGENDA_TOKEN = process.env.AGENDA_TOKEN ?? '';

/** O que pode ser agendado. Exclusão fica de fora de propósito: apagar no
 *  escuro, horas depois da conversa, é o tipo de coisa que não se desfaz.
 *  `enviar_no_grupo` não é do portal: é a mensagem num grupo do WhatsApp, que
 *  o próprio bot manda pela Evolution no horário. */
export const AGENDAVEIS = ['criar_tarefa', 'editar_tarefa', 'comentar', 'adicionar_subtarefa', 'editar_subtarefa', 'enviar_no_grupo'];
export const REPETICOES = ['diario', 'dias_uteis', 'semanal', 'mensal'];

const FERRAMENTAS = [
  {
    name: 'agendar',
    title: 'Agendar ação no portal ou mensagem num grupo',
    description: 'Grava uma ação do portal, ou uma mensagem num grupo do WhatsApp (enviar_no_grupo), para rodar '
      + 'num horário, uma vez ou repetindo. No horário o bot executa exatamente a chamada gravada, sem perguntar '
      + 'de novo, e avisa no privado. Resolva antes os ids, nomes e números exatos com as ferramentas de leitura. '
      + 'Age mais tarde sem ninguém olhar: só rode depois da confirmação.',
    inputSchema: {
      type: 'object',
      properties: {
        quando: { type: 'string', description: 'Data e hora da (primeira) execução, ISO 8601 com o fuso de Brasília, como 2026-11-18T09:00:00-03:00.' },
        repetir: { type: 'string', enum: REPETICOES, description: 'Sem ele, roda uma vez. dias_uteis pula sábado e domingo; semanal repete no mesmo dia da semana; mensal, no mesmo dia do mês.' },
        ferramenta: { type: 'string', enum: AGENDAVEIS, description: 'A ferramenta do portal (mover de etapa é editar_tarefa com status) ou enviar_no_grupo.' },
        argumentos: { type: 'object', description: 'Os argumentos da ferramenta, exatamente como ela pede.' },
        resumo: { type: 'string', description: 'Uma linha dizendo o que acontece, para a lista e para o aviso. Ex.: "Mover o #977 para Fazendo", "Mensagem no grupo Tech Squad marcando o Raul".' },
      },
      required: ['quando', 'ferramenta', 'argumentos', 'resumo'],
    },
  },
  {
    name: 'listar_agendamentos',
    title: 'Listar agendamentos',
    description: 'Os agendamentos ativos, com a próxima execução (horário de Brasília), a repetição e como foi a última vez.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cancelar_agendamento',
    title: 'Cancelar agendamento',
    description: 'Cancela um agendamento (id de listar_agendamentos). Só rode depois da confirmação.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

async function agenda(corpo) {
  const r = await fetch(AGENDA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agenda-token': AGENDA_TOKEN },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `a agenda recusou (${r.status})`);
  return d;
}

const EXECUTAR = {
  agendar: (a) => agenda({ acao: 'criar', quando: a.quando, repetir: a.repetir ?? null, ferramenta: a.ferramenta, argumentos: a.argumentos, resumo: a.resumo }),
  listar_agendamentos: () => agenda({ acao: 'listar' }),
  cancelar_agendamento: (a) => agenda({ acao: 'cancelar', id: a.id }),
};

const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'agenda', version: '1.0.0' },
    } });
  }
  if (id === undefined) return;
  if (method === 'ping') return enviar({ id, result: {} });
  if (method === 'tools/list') return enviar({ id, result: { tools: FERRAMENTAS } });
  if (method === 'tools/call') {
    const executar = EXECUTAR[params?.name];
    if (!executar) return enviar({ id, error: { code: -32602, message: `ferramenta desconhecida: ${params?.name}` } });
    try {
      const r = await executar(params.arguments ?? {});
      return enviar({ id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } });
    } catch (e) {
      return enviar({ id, result: { content: [{ type: 'text', text: `Não deu: ${e?.message ?? e}` }], isError: true } });
    }
  }
  return enviar({ id, error: { code: -32601, message: `método não suportado: ${method}` } });
}

// Importado pelo bot só pelas listas acima; servidor de verdade só quando
// rodado direto.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  createInterface({ input: process.stdin }).on('line', (l) => {
    if (!l.trim()) return;
    let pedido;
    try { pedido = JSON.parse(l); } catch { return; }
    void tratar(pedido);
  });
}
