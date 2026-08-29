import type { VercelRequest } from '@vercel/node';

/**
 * Lê os parâmetros de query usando a WHATWG URL API em vez de `req.query`.
 *
 * O getter `req.query` do @vercel/node chama `url.parse()` internamente, que emite
 * o DeprecationWarning DEP0169 nos logs. Parsear `req.url` com `new URL(...)` evita isso.
 */
export function getQuery(req: VercelRequest): URLSearchParams {
  return new URL(req.url ?? '', 'http://localhost').searchParams;
}
