import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigir } from './_permissoes.js';

// Integração DEPS (api-portal.deps.com.br)
// Login: POST /api/v3/conta/entrar { email, senha } -> token
// Consulta Mix: POST /api/v3/consultas/depsmix { documento, identificadorProduto, reutilizarDadosExistentes }
//
// Requer no ambiente:
//   DEPS_EMAIL, DEPS_SENHA
//   DEPS_PRODUTO_PJ (default 20C2F2B4 = Mix PJ 057)
//   DEPS_PRODUTO_PF (opcional, ex. 61D351FE = Smart PF 019)

const BASE = 'https://api-portal.deps.com.br/api/v3';
const PRODUTO_PJ_DEFAULT = '20C2F2B4'; // Mix PJ 057

function getDb() {
  return createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN! });
}

// Cache de token em memória (vive enquanto a instância estiver quente)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function extractToken(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'string') return data;
  return data.token ?? data.accessToken ?? data.access_token ?? data.jwt
    ?? data.dados?.token ?? data.data?.token ?? null;
}

async function login(): Promise<string> {
  const email = process.env.DEPS_EMAIL;
  const senha = process.env.DEPS_SENHA;
  if (!email || !senha) throw new Error('DEPS_EMAIL/DEPS_SENHA não configurados');

  const res = await fetch(`${BASE}/conta/entrar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Login DEPS falhou (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  const token = extractToken(data);
  if (!token) throw new Error('Login DEPS não retornou token reconhecível');
  cachedToken = token;
  // Sem expiração documentada - assume 50 min e re-loga em 401
  tokenExpiresAt = Date.now() + 50 * 60 * 1000;
  return token;
}

async function getToken(force = false): Promise<string> {
  if (!force && cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  return login();
}

async function consultar(documento: string, identificadorProduto: string, reutilizar: boolean): Promise<Response> {
  const body = JSON.stringify({ documento, identificadorProduto, reutilizarDadosExistentes: reutilizar });
  const call = async (token: string) => fetch(`${BASE}/consultas/depsmix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body,
  });
  let token = await getToken();
  let res = await call(token);
  if (res.status === 401) { token = await getToken(true); res = await call(token); }
  return res;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth - mesma sessão do admin (consulta a bureau tem custo)
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });
  const db = getDb();
  let sessao;
  try {
    sessao = await getAdminSession(db, sessionToken);
    if (!sessao) return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    console.error('[deps-consulta] session error', err);
    return res.status(500).json({ error: 'Erro interno' });
  }

  // Consulta paga: a permissão é conferida antes de qualquer validação de
   // entrada, para quem não pode nem descobrir se o documento seria aceito.
  const recusa = await exigir(db, sessao.usuario, ['oportunidades:deps', 'credito:deps']);
  if (recusa) return res.status(recusa.status).json(recusa.body);

  const documento = String(req.body?.documento ?? '').replace(/\D/g, '');
  if (documento.length !== 11 && documento.length !== 14) {
    return res.status(400).json({ error: 'documento (CPF/CNPJ) inválido' });
  }
  // Consulta a bureau é paga: fica registrado quem pediu, antes de gastar.
  await registrarAuditoria(db, sessao.usuario, 'deps-consulta', documento);
  const isPF = documento.length === 11;
  const identificadorProduto = String(
    req.body?.identificadorProduto
    ?? (isPF ? process.env.DEPS_PRODUTO_PF : process.env.DEPS_PRODUTO_PJ)
    ?? PRODUTO_PJ_DEFAULT
  );
  const reutilizar = req.body?.reutilizarDadosExistentes !== false; // default true

  // Erro que indica "não há análise válida para reutilizar" → devemos gerar nova
  const precisaNova = (data: any, text: string) => {
    const blob = JSON.stringify(data ?? text ?? '').toLowerCase();
    return /vencid|reprocess|an[aá]lise v[aá]lida|sem hist[oó]rico|n[aã]o (foi )?encontrad|n[aã]o possui informa[cç][oõ]es|sem informa[cç][oõ]es/.test(blob);
  };

  try {
    const dr = await consultar(documento, identificadorProduto, reutilizar);
    const text = await dr.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* mantém texto cru */ }

    if (!dr.ok) {
      // Pediu reutilizar mas não há análise válida no histórico → sinaliza para a UI
      // pedir confirmação antes de gerar uma nova consulta (que tem custo).
      if (reutilizar && precisaNova(data, text)) {
        return res.status(200).json({ success: false, needsNew: true, error: 'Sem consulta válida no histórico para reaproveitar.' });
      }
      console.error('[deps-consulta] erro', dr.status, text.slice(0, 300));
      return res.status(502).json({ success: false, error: `Consulta DEPS falhou (${dr.status})`, detalhe: data ?? text.slice(0, 500) });
    }
    return res.status(200).json({
      success: true,
      documento,
      identificadorProduto,
      reutilizou: reutilizar,   // true = veio do histórico; false = consulta nova gerada
      resultado: data ?? text,
    });
  } catch (err: any) {
    console.error('[deps-consulta]', err);
    return res.status(500).json({ success: false, error: err?.message ?? 'Erro na consulta DEPS' });
  }
}
