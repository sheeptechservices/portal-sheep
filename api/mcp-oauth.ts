import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { ensureAdminSchema, checkLoginRateLimit, recordFailedLogin } from './_admin-handler.js';
import { enderecoDoPortal } from './_email.js';
import { getQuery } from './_query.js';
import { ErroOAuth, registrarCliente, renovarToken, trocarCodigo } from './_mcp/oauth.js';

// ─────────────────────────────────────────────────────────────────────────────
//  As portas públicas do OAuth do MCP. Chegam aqui por rewrite (ver
//  `vercel.json`), cada uma com a sua `etapa`:
//
//   recurso   /.well-known/oauth-protected-resource    (RFC 9728)
//   servidor  /.well-known/oauth-authorization-server  (RFC 8414)
//   registro  /api/mcp-oauth/registro                  (RFC 7591)
//   token     /api/mcp-oauth/token
//
//  A autorização em si não mora aqui: é a tela `/mcp/conectar` do portal, que
//  exige a sessão de quem está entrando.
//
//  O endereço do portal vem do ambiente, e nunca do cabeçalho `Host`: quem
//  forjasse o `Host` faria o metadado apontar o token para um domínio dele.
// ─────────────────────────────────────────────────────────────────────────────

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

/** Metadado do servidor de autorização. Exportado para o `mcp.ts` apontar. */
export function metadadoServidor(origem: string) {
  return {
    issuer: origem,
    authorization_endpoint: `${origem}/mcp/conectar`,
    token_endpoint: `${origem}/api/mcp-oauth/token`,
    registration_endpoint: `${origem}/api/mcp-oauth/registro`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    authorization_response_iss_parameter_supported: true,
  };
}

export function metadadoRecurso(origem: string) {
  return {
    resource: `${origem}/api/mcp`,
    authorization_servers: [origem],
    bearer_methods_supported: ['header'],
    resource_name: 'Portal Sheep - Tarefas',
  };
}

/** Os clientes que rodam no navegador (o MCP Inspector, por exemplo) chamam
 *  estas portas de outra origem. Nada aqui usa cookie, então `*` não abre nada. */
function cors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, MCP-Protocol-Version');
}

function ipDe(req: VercelRequest): string {
  return String(
    (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
    req.socket?.remoteAddress ??
    '0.0.0.0',
  );
}

/** O corpo do token vem em form-urlencoded pela RFC, mas há cliente que manda
 *  JSON. O `@vercel/node` já entrega os dois como objeto; string sobra só
 *  quando o tipo veio sem cabeçalho. */
function corpoDe(req: VercelRequest): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === 'object') return b as Record<string, unknown>;
  if (typeof b === 'string') return Object.fromEntries(new URLSearchParams(b));
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const etapa = getQuery(req).get('etapa') ?? '';
  const origem = enderecoDoPortal();
  // Nenhuma resposta daqui pode ficar em cache intermediário com token dentro.
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET' && etapa === 'recurso') return res.status(200).json(metadadoRecurso(origem));
  if (req.method === 'GET' && etapa === 'servidor') return res.status(200).json(metadadoServidor(origem));

  if (req.method !== 'POST' || (etapa !== 'registro' && etapa !== 'token')) {
    return res.status(404).json({ error: 'not_found' });
  }

  const db = getDb();
  const ip = ipDe(req);
  try {
    await ensureAdminSchema(db);
    // Mesmo freio do login: estas duas portas são as mais fáceis de martelar.
    if (await checkLoginRateLimit(db, ip)) {
      return res.status(429).json({ error: 'slow_down', error_description: 'Muitas tentativas. Aguarde 15 minutos.' });
    }

    if (etapa === 'registro') {
      return res.status(201).json(await registrarCliente(db, corpoDe(req)));
    }

    const f = corpoDe(req);
    const tipo = String(f.grant_type ?? '');
    if (tipo === 'authorization_code') return res.status(200).json(await trocarCodigo(db, f));
    if (tipo === 'refresh_token') return res.status(200).json(await renovarToken(db, f));
    throw new ErroOAuth('unsupported_grant_type', 'Use authorization_code ou refresh_token.');
  } catch (err) {
    if (err instanceof ErroOAuth) {
      // Só a falha de credencial conta para o freio: pedido malformado de um
      // cliente com defeito não deve trancar o IP de quem está só tentando.
      if (err.codigo === 'invalid_grant') await recordFailedLogin(db, ip).catch(() => {});
      return res.status(err.status).json(err.corpo());
    }
    console.error('[mcp-oauth]', etapa, err);
    return res.status(500).json({ error: 'server_error' });
  }
}
