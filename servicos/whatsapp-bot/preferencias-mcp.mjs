// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: as preferências do dono para o jeito de o bot
//  escrever ("manda os resumos em tópicos", "me chama de Gui").
//
//  A preferência gravada entra nas instruções de toda conversa, em qualquer
//  chat e depois de qualquer recomeço. Só o dono, no privado, mexe nelas: para
//  qualquer outra pessoa estas ferramentas nem existem. E nenhuma preferência
//  passa por cima das regras do bot (confirmação, discrição, o que cada um pode
//  fazer): isso só muda no código.
//
//  Quem guarda o arquivo é o processo do bot (index.mjs), e este servidor só
//  fala com ele pela rota interna, como a agenda.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline';

const PREFERENCIAS_URL = process.env.PREFERENCIAS_URL ?? '';
const TOKEN = process.env.AGENDA_TOKEN ?? '';

const FERRAMENTAS = [
  {
    name: 'lembrar_preferencia',
    title: 'Lembrar preferência',
    description: 'Grava uma preferência do dono para o seu jeito de escrever ou de responder, que passa a valer em '
      + 'todas as conversas. Uma frase curta e direta, como "Resumos em tópicos, no máximo cinco". Preferência não '
      + 'muda regra de segurança: confirmação, discrição e o que cada pessoa pode fazer ficam como estão.',
    inputSchema: {
      type: 'object',
      properties: { texto: { type: 'string', description: 'A preferência, em uma frase, até 300 caracteres.' } },
      required: ['texto'],
    },
  },
  {
    name: 'listar_preferencias',
    title: 'Listar preferências',
    description: 'As preferências gravadas, com o id de cada uma.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'esquecer_preferencia',
    title: 'Esquecer preferência',
    description: 'Apaga uma preferência gravada (id de listar_preferencias).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
];

async function rota(corpo) {
  const r = await fetch(PREFERENCIAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-agenda-token': TOKEN },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? `as preferências recusaram (${r.status})`);
  return d;
}

const EXECUTAR = {
  lembrar_preferencia: (a) => rota({ acao: 'criar', texto: a.texto }),
  listar_preferencias: () => rota({ acao: 'listar' }),
  esquecer_preferencia: (a) => rota({ acao: 'apagar', id: a.id }),
};

const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'preferencias', version: '1.0.0' },
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

createInterface({ input: process.stdin }).on('line', (l) => {
  if (!l.trim()) return;
  let pedido;
  try { pedido = JSON.parse(l); } catch { return; }
  void tratar(pedido);
});
