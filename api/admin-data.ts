import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import {
  handleAdminData, createAdminSession, getAdminSession, deleteAdminSession,
  checkLoginRateLimit, recordFailedLogin, clearLoginAttempts, upsertUsuarioGoogle, registrarAuditoria,
  usuarioConvidadoAtivo, usuarioPorSenha, donoDoTokenSenha, usarTokenSenha,
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

  // A senha *compartilhada* foi removida em 28/08/2026: ela criava sessão sem
  // dono, e toda escrita dela ficava anônima na auditoria. A ação antiga
  // responde 410 para deixar claro que sumiu de propósito, em vez de 400 de
  // "ação inválida". O que existe hoje é outra coisa: senha por pessoa, só de
  // convidado, criada por quem convidou - ver `login-senha` logo abaixo.
  if (bodyAction === 'login') {
    return res.status(410).json({ error: 'A entrada por senha compartilhada foi desativada.' });
  }

  // A porta alternativa: e-mail e senha, para o convidado que não tem conta
  // Google. Mesmo limitador do Google - é o caminho mais fácil de martelar.
  if (bodyAction === 'login-senha') {
    const ip = String(
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket?.remoteAddress ??
      '0.0.0.0'
    );
    try {
      if (await checkLoginRateLimit(db, ip)) {
        return res.status(429).json({ error: 'Muitas tentativas incorretas. Aguarde 15 minutos.' });
      }
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const senha = String(req.body?.senha ?? '');
      const usuario = email && senha ? await usuarioPorSenha(db, email, senha) : null;
      if (!usuario) {
        // Uma recusa só, sem dizer se o que falhou foi o e-mail ou a senha:
        // a diferença entre as duas mensagens é um mapa de quem existe.
        await recordFailedLogin(db, ip);
        return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
      }
      await clearLoginAttempts(db, ip);
      const token = await createAdminSession(db, usuario.id);
      await registrarAuditoria(db, usuario, 'login-senha', usuario.email);
      console.log('[admin-data] login-senha ok:', usuario.email);
      return res.status(200).json({ token, usuario });
    } catch (err) {
      console.error('[admin-data] login-senha error', err);
      return res.status(500).json({ error: 'Erro interno.' });
    }
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
        // A segunda porta: quem não é do domínio da casa entra se tiver sido
        // cadastrado antes no painel de Usuários, e enquanto estiver ativo.
        const conta = await verificarIdTokenGoogle(idToken, cfg,
          email => usuarioConvidadoAtivo(db, email));
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

  // ── O convite de criar a senha ───────────────────────────────────────────
  //
  // Sem sessão, e é o ponto: quem chega aqui ainda não tem uma. O que prova
  // quem a pessoa é não é um login, é o token que só existe na caixa de e-mail
  // dela - e ele vale 24 horas e uma vez só.

  // De quem é o convite, para a tela dizer "crie a senha de fulano" em vez de
  // pedir a senha de ninguém.
  if (bodyAction === 'senha-token-info') {
    try {
      const dono = await donoDoTokenSenha(db, String(req.body?.token ?? ''));
      if (!dono) return res.status(410).json({ error: 'Este link não vale mais. Peça um novo ao time.' });
      return res.status(200).json({ nome: dono.nome, email: dono.email });
    } catch (err) {
      console.error('[admin-data] senha-token-info', err);
      return res.status(500).json({ error: 'Erro interno.' });
    }
  }

  // Gasta o convite: grava a senha escolhida e já devolve a sessão, para quem
  // acabou de criar a senha entrar sem digitá-la de novo na tela ao lado.
  if (bodyAction === 'senha-token-usar') {
    const ip = String(
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket?.remoteAddress ??
      '0.0.0.0'
    );
    try {
      // Mesmo limitador da entrada: token é adivinhável no papel, e sem freio
      // alguém poderia tentar aos milhares.
      if (await checkLoginRateLimit(db, ip)) {
        return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
      }
      const r = await usarTokenSenha(db, String(req.body?.token ?? ''), String(req.body?.senha ?? ''));
      if (!r.ok) {
        await recordFailedLogin(db, ip);
        return res.status(400).json({ error: r.erro });
      }
      await clearLoginAttempts(db, ip);
      const token = await createAdminSession(db, r.usuario.id);
      await registrarAuditoria(db, r.usuario, 'senha-criada-por-link', r.usuario.email);
      console.log('[admin-data] senha criada por link:', r.usuario.email);
      return res.status(200).json({ token, usuario: r.usuario });
    } catch (err) {
      console.error('[admin-data] senha-token-usar', err);
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
      sessao.usuario
    );
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[admin-data]', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
