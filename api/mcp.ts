import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { ensureAdminSchema } from './_admin-handler.js';
import { enderecoDoPortal } from './_email.js';
import { permissoesDoUsuario } from './_permissoes.js';
import { usuarioDoToken } from './_mcp/oauth.js';
import { atender, erro, ERRO_INTERNO, ERRO_PARSE, type MensagemRpc } from './_mcp/protocolo.js';
import { SERVIDOR, type Ctx } from './_mcp/ferramentas.js';

// ─────────────────────────────────────────────────────────────────────────────
//  O servidor MCP das tarefas. Streamable HTTP sem estado: um POST, uma
//  mensagem JSON-RPC (ou um lote), uma resposta JSON.
//
//  Quem chama se identifica pelo access token do OAuth do portal (ver
//  `mcp-oauth.ts`). Sem token válido a resposta é 401 com o endereço do
//  metadado, que é o que faz o cliente abrir o login sozinho.
// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export const config = {
  // Anexo de comentário chega em base64 dentro da mensagem: 8 MB de arquivo
  // viram perto de 11 MB de texto.
  api: { bodyParser: { sizeLimit: '20mb' } },
};

/** Clientes no navegador (o MCP Inspector) chamam de outra origem. A credencial
 *  é o cabeçalho Authorization, e não cookie, então `*` não abre nada. */
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  // Sem sessão e sem fluxo de eventos: GET (o canal SSE) e DELETE (encerrar
  // sessão) não têm o que fazer aqui, e 405 é o que a especificação pede.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getDb();
  const origem = enderecoDoPortal();
  const cabecalho = String(req.headers.authorization ?? '');
  const token = /^Bearer\s+(.+)$/i.exec(cabecalho)?.[1]?.trim() ?? '';

  let usuario;
  try {
    await ensureAdminSchema(db);
    usuario = await usuarioDoToken(db, token);
  } catch (err) {
    console.error('[mcp] autenticação', err);
    return res.status(500).json(erro(null, ERRO_INTERNO, 'Erro interno.'));
  }
  if (!usuario) {
    const metadado = `${origem}/.well-known/oauth-protected-resource/api/mcp`;
    res.setHeader('WWW-Authenticate', token
      ? `Bearer error="invalid_token", resource_metadata="${metadado}"`
      : `Bearer resource_metadata="${metadado}"`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  let corpo: unknown = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch {
      return res.status(400).json(erro(null, ERRO_PARSE, 'JSON inválido.'));
    }
  }
  if (corpo == null || typeof corpo !== 'object') {
    return res.status(400).json(erro(null, ERRO_PARSE, 'Corpo vazio.'));
  }

  const ctx: Ctx = { db, usuario, permissoes: await permissoesDoUsuario(db, usuario), cache: new Map() };
  const responder = async (msg: MensagemRpc) => {
    try {
      return await atender(msg, SERVIDOR, ctx);
    } catch (err) {
      console.error('[mcp]', msg?.method, msg?.params?.name ?? '', err);
      return erro(msg?.id, ERRO_INTERNO, 'Erro interno.');
    }
  };

  // Lote: as mensagens rodam uma de cada vez, na ordem em que vieram, porque
  // uma pode depender do que a anterior gravou.
  if (Array.isArray(corpo)) {
    const respostas = [];
    for (const m of corpo) {
      const r = await responder(m as MensagemRpc);
      if (r) respostas.push(r);
    }
    return respostas.length ? res.status(200).json(respostas) : res.status(202).end();
  }
  const r = await responder(corpo as MensagemRpc);
  return r ? res.status(200).json(r) : res.status(202).end();
}
