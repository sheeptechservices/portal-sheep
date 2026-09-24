// ─────────────────────────────────────────────────────────────────────────────
//  O recorte do protocolo MCP que um servidor de ferramentas precisa, sobre
//  JSON-RPC 2.0, no transporte Streamable HTTP sem estado: cada POST traz uma
//  mensagem e leva a resposta em JSON. Sem SSE e sem sessão.
//
//  Escrito à mão, e não com o SDK: são cinco métodos, e o SDK traria o zod e
//  uma camada de transporte que a função da Vercel não usa.
// ─────────────────────────────────────────────────────────────────────────────

export const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26'];

export const ERRO_PARSE = -32700;
export const ERRO_PEDIDO = -32600;
export const ERRO_METODO = -32601;
export const ERRO_PARAMS = -32602;
export const ERRO_INTERNO = -32603;

export interface MensagemRpc {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

export function resposta(id: MensagemRpc['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

export function erro(id: MensagemRpc['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

/** Falha que a IA deve ler e corrigir: volta como resultado com `isError`, e
 *  não como erro de protocolo, que o cliente trataria como pane. */
export class ErroFerramenta extends Error {}

export interface Ferramenta<C> {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  /** Ações do `handleAdminData` que a ferramenta chama. Ela só aparece no
   *  `tools/list` de quem pode todas. */
  acoes: string[];
  executar: (args: Record<string, any>, ctx: C) => Promise<unknown>;
}

export interface Servidor<C> {
  nome: string;
  versao: string;
  instrucoes: string;
  /** As ferramentas que esta pessoa enxerga. */
  visiveis: (ctx: C) => Ferramenta<C>[];
}

/** O conteúdo que a ferramenta devolveu, no formato do `tools/call`. Quem já
 *  devolve blocos (imagem, recurso) passa direto; o resto vira JSON em texto. */
function comoConteudo(saida: unknown) {
  if (saida && typeof saida === 'object' && Array.isArray((saida as any).content)) return saida;
  return { content: [{ type: 'text', text: typeof saida === 'string' ? saida : JSON.stringify(saida) }] };
}

/** Confere os obrigatórios do schema. O resto da validação é das ações do
 *  portal, que já recusam o que não serve com mensagem legível. */
function faltando(schema: Record<string, any>, args: Record<string, unknown>): string[] {
  const obrigatorios: string[] = Array.isArray(schema.required) ? schema.required : [];
  return obrigatorios.filter(k => args[k] === undefined || args[k] === null || args[k] === '');
}

/**
 * Responde uma mensagem. Notificação (sem `id`) não tem resposta: devolve
 * `null`, e o transporte responde 202.
 */
export async function atender<C>(msg: MensagemRpc, servidor: Servidor<C>, ctx: C) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return erro(msg?.id, ERRO_PEDIDO, 'Mensagem JSON-RPC inválida.');
  }
  const notificacao = msg.id === undefined;
  if (notificacao) return null;

  switch (msg.method) {
    case 'initialize': {
      const pedida = String(msg.params?.protocolVersion ?? '');
      return resposta(msg.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: servidor.nome, version: servidor.versao },
        instructions: servidor.instrucoes,
      });
    }
    case 'ping':
      return resposta(msg.id, {});
    case 'tools/list':
      return resposta(msg.id, {
        tools: servidor.visiveis(ctx).map(f => ({
          name: f.name,
          title: f.title,
          description: f.description,
          inputSchema: f.inputSchema,
          ...(f.annotations ? { annotations: { title: f.title, ...f.annotations } } : {}),
        })),
      });
    case 'tools/call': {
      const nome = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, any>;
      // Ferramenta fora da vitrine desta pessoa responde como inexistente.
      const f = servidor.visiveis(ctx).find(x => x.name === nome);
      if (!f) return erro(msg.id, ERRO_PARAMS, `Ferramenta desconhecida: ${nome}`);
      if (typeof args !== 'object' || Array.isArray(args)) {
        return erro(msg.id, ERRO_PARAMS, 'arguments precisa ser um objeto.');
      }
      const ausentes = faltando(f.inputSchema, args);
      if (ausentes.length) {
        return resposta(msg.id, {
          content: [{ type: 'text', text: `Faltou informar: ${ausentes.join(', ')}.` }],
          isError: true,
        });
      }
      try {
        return resposta(msg.id, comoConteudo(await f.executar(args, ctx)));
      } catch (err) {
        if (err instanceof ErroFerramenta) {
          return resposta(msg.id, { content: [{ type: 'text', text: err.message }], isError: true });
        }
        throw err;
      }
    }
    default:
      return erro(msg.id, ERRO_METODO, `Método não suportado: ${msg.method}`);
  }
}
