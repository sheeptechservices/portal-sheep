import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import {
  handleAdminData, createAdminSession, getAdminSession, deleteAdminSession,
  checkLoginRateLimit, recordFailedLogin, clearLoginAttempts, upsertUsuarioGoogle, registrarAuditoria,
  type SessaoAdmin,
} from './_admin-handler.js';
import { getQuery } from './_query.js';
import { configGoogle, trocarCodigoGoogle, verificarIdTokenGoogle } from './_google-auth.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getDb();
  const bodyAction = req.method === 'POST' ? (req.body?.action ?? '') : '';

  // A entrada por senha compartilhada foi removida em 28/08/2026: ela criava
  // sessão sem dono, e toda escrita dela ficava anônima na auditoria. O único
  // caminho é `login-google`, abaixo. A ação antiga responde 410 para deixar
  // claro que sumiu de propósito, em vez de 400 de "ação inválida".
  if (bodyAction === 'login') {
    return res.status(410).json({ error: 'A entrada por senha foi desativada. Use sua conta Google da DUX.' });
  }

  // Login com o Google - também não exige sessão. Conta pelo mesmo limitador do
  // login por senha: sem isso, sobra um caminho livre para força bruta.
  if (bodyAction === 'login-google') {
    const ip = String(
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket?.remoteAddress ??
      '0.0.0.0'
    );
    try {
      const blocked = await checkLoginRateLimit(db, ip);
      if (blocked) {
        return res.status(429).json({ error: 'Muitas tentativas incorretas. Aguarde 15 minutos.' });
      }
      const cfg = configGoogle(process.env);
      if (!cfg.clientId) {
        return res.status(503).json({ error: 'Login com o Google não está configurado.' });
      }
      let usuario;
      try {
        // O caminho é o fluxo de código: `code` é trocado por ID token mais
        // access token, e é o access token que faz a foto do perfil vir junto da
        // entrada, sem segunda ação em lugar nenhum.
        //
        // `credential` (ID token puro) segue aceito por compatibilidade, mas
        // quem entra por ele fica sem foto - não há access token para a People
        // API. O front não usa mais esse caminho.
        const codigo = String(req.body?.code ?? '');
        let idToken = String(req.body?.credential ?? '');
        let accessToken: string | null = null;
        if (codigo) {
          const tokens = await trocarCodigoGoogle(codigo, cfg);
          idToken = tokens.idToken;
          accessToken = tokens.accessToken;
        }
        const conta = await verificarIdTokenGoogle(idToken, cfg);
        // A sessão só nasce depois que o usuário existe no banco: é ele que
        // assina cada ação daqui pra frente.
        usuario = await upsertUsuarioGoogle(db, conta, accessToken);
      } catch (err) {
        // O motivo fica no log; para fora vai só a recusa, sem dizer se o
        // problema foi o token ou a permissão do e-mail.
        console.warn('[admin-data] login-google recusado:', (err as Error).message);
        await recordFailedLogin(db, ip);
        return res.status(401).json({ error: 'Esta conta Google não tem acesso.' });
      }
      await clearLoginAttempts(db, ip);
      const token = await createAdminSession(db, usuario.id);
      await registrarAuditoria(db, usuario, 'login-google', usuario.email);
      console.log('[admin-data] login-google ok:', usuario.email);
      return res.status(200).json({ token, usuario });
    } catch (err) {
      console.error('[admin-data] login-google error', err);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  }

  // Validate session for all other requests
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let sessao: SessaoAdmin | null;
  try {
    sessao = await getAdminSession(db, sessionToken);
  } catch (err) {
    console.error('[admin-data] session validation error', err);
    return res.status(500).json({ error: 'Internal error' });
  }

  if (!sessao) {
    return res.status(401).json({ error: 'Sessão expirada.' });
  }

  // Logout
  if (bodyAction === 'logout') {
    await deleteAdminSession(db, sessionToken).catch(() => {});
    return res.status(200).json({ ok: true });
  }

  const qs = getQuery(req);

  try {
    const result = await handleAdminData(
      req.method ?? 'GET',
      qs,
      req.body ?? {},
      db,
      process.env.SLACK_BOT_TOKEN,
      sessao.usuario
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[admin-data]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
