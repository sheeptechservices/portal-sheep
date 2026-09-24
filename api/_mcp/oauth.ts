// ─────────────────────────────────────────────────────────────────────────────
//  OAuth 2.1 do MCP: o portal como servidor de autorização.
//
//  O cliente MCP (Claude Code, claude.ai, Cursor) se registra sozinho, manda a
//  pessoa para `/mcp/conectar` e volta com um código. Quem vale como identidade
//  continua sendo a sessão do portal, aberta pelo login do Google de sempre: a
//  tela de conectar só emite o código depois que essa sessão existe e a pessoa
//  confirma.
//
//  Nada aqui guarda token em claro. O banco tem só o SHA-256 de cada código e
//  de cada token, então uma cópia do banco não vira acesso de ninguém.
//
//  Este arquivo não importa o `_admin-handler`: é o handler que importa daqui,
//  e o caminho contrário faria um ciclo.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import { createHash, randomBytes } from 'node:crypto';
import { papelEfetivo, type Papel } from '../_papeis.js';

/** Validade do access token. Curta: o refresh renova sem a pessoa ver. */
export const ACCESS_SEG = 60 * 60;
/** Validade do refresh token. Rotativo: cada uso troca o par inteiro. */
const REFRESH_MS = 60 * 24 * 60 * 60 * 1000;
/** Validade do código de autorização, entre o consentimento e a troca. */
const CODIGO_MS = 5 * 60 * 1000;
/** Passo do carimbo de uso, pelo mesmo motivo do da sessão: gravar a cada
 *  chamada seria uma escrita por ferramenta chamada. */
const VISTO_APOS_MS = 60 * 60 * 1000;

type Ddl = (sql: string) => Promise<void>;

export async function ensureMcpSchema(ddl: Ddl): Promise<void> {
  // Quem pode usar o MCP. Por pessoa, e fora da matriz de papel: nem master
  // nem admin ganham por definição. Só o administrador do sistema liga.
  try { await ddl(`ALTER TABLE usuarios ADD COLUMN mcp_habilitado INTEGER NOT NULL DEFAULT 0`); } catch { /* já existe */ }

  // Clientes do registro dinâmico (RFC 7591). Só públicos: nenhum tem segredo,
  // e o que segura a troca do código é o PKCE.
  await ddl(`
    CREATE TABLE IF NOT EXISTS mcp_clientes (
      id            TEXT PRIMARY KEY,
      nome          TEXT NOT NULL,
      redirect_uris TEXT NOT NULL,
      criado_em     TEXT NOT NULL
    )
  `);
  await ddl(`
    CREATE TABLE IF NOT EXISTS mcp_codigos (
      codigo_hash  TEXT PRIMARY KEY,
      cliente_id   TEXT NOT NULL,
      usuario_id   TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      challenge    TEXT NOT NULL,
      expira_em    TEXT NOT NULL
    )
  `);
  // Uma linha por conexão: é ela que o Perfil lista e que "desconectar" apaga.
  // A rotação do refresh reescreve a mesma linha, em vez de somar outra.
  await ddl(`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id     TEXT NOT NULL,
      usuario_id     TEXT NOT NULL,
      access_hash    TEXT NOT NULL UNIQUE,
      access_expira  TEXT NOT NULL,
      refresh_hash   TEXT NOT NULL UNIQUE,
      refresh_expira TEXT NOT NULL,
      criado_em      TEXT NOT NULL,
      visto_em       TEXT
    )
  `);
  try { await ddl(`CREATE INDEX IF NOT EXISTS idx_mcp_tokens_usuario ON mcp_tokens (usuario_id)`); } catch { /* ignora */ }
}

// ── Utilitários ─────────────────────────────────────────────────────────────

const aleatorio = (bytes = 32) => randomBytes(bytes).toString('base64url');
const hash = (valor: string) => createHash('sha256').update(valor).digest('hex');

/** Erro no formato do OAuth: `error` é o código da RFC, `descricao` vai para o
 *  `error_description`. */
export class ErroOAuth extends Error {
  constructor(public codigo: string, descricao: string, public status = 400) {
    super(descricao);
  }
  corpo() { return { error: this.codigo, error_description: this.message }; }
}

/**
 * Para onde o cliente pode pedir a volta. `https` sempre; `http` só no próprio
 * computador, que é onde o Claude Code e o VS Code escutam; e esquema próprio
 * de aplicativo (`cursor://...`), que é o retorno dos clientes de desktop
 * (RFC 8252). Fica de fora o que executa ou lê coisa local no navegador.
 */
export function redirectAceito(uri: string): boolean {
  let url: URL;
  try { url = new URL(uri); } catch { return false; }
  if (url.hash) return false;
  const esquema = url.protocol.replace(/:$/, '').toLowerCase();
  if (esquema === 'https') return true;
  if (esquema === 'http') return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return !['javascript', 'data', 'file', 'vbscript', 'about', 'blob', 'ftp', 'ws', 'wss'].includes(esquema);
}

// ── Registro dinâmico ───────────────────────────────────────────────────────

export async function registrarCliente(db: Client, corpo: any) {
  const uris: unknown[] = Array.isArray(corpo?.redirect_uris) ? corpo.redirect_uris : [];
  const redirects = [...new Set(uris.map(u => String(u).trim()).filter(Boolean))];
  if (redirects.length === 0 || redirects.length > 10) {
    throw new ErroOAuth('invalid_redirect_uri', 'Informe de 1 a 10 redirect_uris.');
  }
  const recusado = redirects.find(u => !redirectAceito(u));
  if (recusado) throw new ErroOAuth('invalid_redirect_uri', `redirect_uri não aceito: ${recusado}`);

  const metodo = String(corpo?.token_endpoint_auth_method ?? 'none');
  if (metodo !== 'none') {
    throw new ErroOAuth('invalid_client_metadata', 'Só clientes públicos (token_endpoint_auth_method: none).');
  }
  // O nome aparece na tela de consentimento e no Perfil. Cortado, para um
  // registro não conseguir empurrar um parágrafo para dentro da tela.
  const nome = String(corpo?.client_name ?? '').trim().slice(0, 80) || 'Cliente MCP';
  const id = randomBytes(16).toString('hex');
  const agora = new Date();
  await db.execute({
    sql: 'INSERT INTO mcp_clientes (id, nome, redirect_uris, criado_em) VALUES (?,?,?,?)',
    args: [id, nome, JSON.stringify(redirects), agora.toISOString()],
  });
  return {
    client_id: id,
    client_id_issued_at: Math.floor(agora.getTime() / 1000),
    client_name: nome,
    redirect_uris: redirects,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

// ── Autorização ─────────────────────────────────────────────────────────────

export interface PedidoAutorizacao {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  state: string | null;
}

/**
 * Confere o pedido que chegou na tela de conectar. Só depois disto a tela pode
 * mandar alguém de volta para o `redirect_uri`: um endereço que o cliente não
 * registrou nunca recebe nada, nem o erro.
 */
export async function conferirPedido(db: Client, p: Record<string, unknown>)
  : Promise<{ pedido: PedidoAutorizacao; clienteNome: string }> {
  const clientId = String(p.client_id ?? '');
  const redirectUri = String(p.redirect_uri ?? '');
  const r = await db.execute({ sql: 'SELECT nome, redirect_uris FROM mcp_clientes WHERE id = ?', args: [clientId] });
  const cliente = r.rows[0];
  if (!cliente) throw new ErroOAuth('invalid_client', 'Cliente não registrado.');
  const registrados = JSON.parse(String(cliente.redirect_uris ?? '[]')) as string[];
  if (!registrados.includes(redirectUri)) throw new ErroOAuth('invalid_request', 'redirect_uri não registrado.');

  if (String(p.response_type ?? '') !== 'code') {
    throw new ErroOAuth('unsupported_response_type', 'Só response_type=code.');
  }
  const challenge = String(p.code_challenge ?? '');
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || String(p.code_challenge_method ?? '') !== 'S256') {
    throw new ErroOAuth('invalid_request', 'PKCE com S256 é obrigatório.');
  }
  const state = p.state != null && p.state !== '' ? String(p.state) : null;
  return {
    pedido: { client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, state },
    clienteNome: String(cliente.nome),
  };
}

/** Emite o código de uso único e devolve a URL de volta, pronta. */
export async function emitirCodigo(db: Client, usuarioId: string, pedido: PedidoAutorizacao, emissor: string) {
  const codigo = aleatorio();
  // Limpeza oportunista: código vencido não serve para nada.
  await db.execute({ sql: 'DELETE FROM mcp_codigos WHERE expira_em <= ?', args: [new Date().toISOString()] });
  await db.execute({
    sql: `INSERT INTO mcp_codigos (codigo_hash, cliente_id, usuario_id, redirect_uri, challenge, expira_em)
          VALUES (?,?,?,?,?,?)`,
    args: [hash(codigo), pedido.client_id, usuarioId, pedido.redirect_uri, pedido.code_challenge,
      new Date(Date.now() + CODIGO_MS).toISOString()],
  });
  const volta = new URL(pedido.redirect_uri);
  volta.searchParams.set('code', codigo);
  if (pedido.state) volta.searchParams.set('state', pedido.state);
  // RFC 9207: diz ao cliente de quem veio o código.
  volta.searchParams.set('iss', emissor);
  return volta.toString();
}

// ── Tokens ──────────────────────────────────────────────────────────────────

function parDeTokens() {
  const access = aleatorio();
  const refresh = aleatorio();
  const agora = Date.now();
  return {
    access, refresh,
    accessHash: hash(access), refreshHash: hash(refresh),
    accessExpira: new Date(agora + ACCESS_SEG * 1000).toISOString(),
    refreshExpira: new Date(agora + REFRESH_MS).toISOString(),
  };
}

function respostaDeToken(par: ReturnType<typeof parDeTokens>) {
  return {
    access_token: par.access,
    token_type: 'Bearer',
    expires_in: ACCESS_SEG,
    refresh_token: par.refresh,
  };
}

/** Só quem está ativo e com o MCP ligado recebe token. */
async function usuarioComMcp(db: Client, usuarioId: string): Promise<boolean> {
  const r = await db.execute({
    sql: 'SELECT 1 FROM usuarios WHERE id = ? AND ativo = 1 AND mcp_habilitado = 1', args: [usuarioId],
  });
  return r.rows.length > 0;
}

export async function trocarCodigo(db: Client, f: Record<string, unknown>) {
  const codigo = String(f.code ?? '');
  const verifier = String(f.code_verifier ?? '');
  if (!codigo || !verifier) throw new ErroOAuth('invalid_request', 'code e code_verifier são obrigatórios.');

  // Apaga antes de conferir o resto: o código é de uso único mesmo quando a
  // troca falha, senão um verifier errado poderia ser tentado de novo.
  const r = await db.execute({
    sql: `DELETE FROM mcp_codigos WHERE codigo_hash = ?
          RETURNING cliente_id, usuario_id, redirect_uri, challenge, expira_em`,
    args: [hash(codigo)],
  });
  const linha = r.rows[0];
  if (!linha || String(linha.expira_em) <= new Date().toISOString()) {
    throw new ErroOAuth('invalid_grant', 'Código inválido ou vencido.');
  }
  if (String(f.client_id ?? '') !== String(linha.cliente_id)) {
    throw new ErroOAuth('invalid_grant', 'O código é de outro cliente.');
  }
  if (String(f.redirect_uri ?? '') !== String(linha.redirect_uri)) {
    throw new ErroOAuth('invalid_grant', 'redirect_uri diferente do pedido.');
  }
  const conferido = createHash('sha256').update(verifier).digest('base64url');
  if (conferido !== String(linha.challenge)) throw new ErroOAuth('invalid_grant', 'code_verifier não confere.');

  const usuarioId = String(linha.usuario_id);
  if (!(await usuarioComMcp(db, usuarioId))) throw new ErroOAuth('invalid_grant', 'Acesso não liberado.');

  const par = parDeTokens();
  const agora = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO mcp_tokens
            (cliente_id, usuario_id, access_hash, access_expira, refresh_hash, refresh_expira, criado_em, visto_em)
          VALUES (?,?,?,?,?,?,?,?)`,
    args: [String(linha.cliente_id), usuarioId, par.accessHash, par.accessExpira,
      par.refreshHash, par.refreshExpira, agora, agora],
  });
  return respostaDeToken(par);
}

export async function renovarToken(db: Client, f: Record<string, unknown>) {
  const refresh = String(f.refresh_token ?? '');
  if (!refresh) throw new ErroOAuth('invalid_request', 'refresh_token é obrigatório.');
  const r = await db.execute({
    sql: 'SELECT id, cliente_id, usuario_id, refresh_expira FROM mcp_tokens WHERE refresh_hash = ?',
    args: [hash(refresh)],
  });
  const linha = r.rows[0];
  if (!linha || String(linha.refresh_expira) <= new Date().toISOString()) {
    throw new ErroOAuth('invalid_grant', 'refresh_token inválido ou vencido.');
  }
  if (f.client_id != null && String(f.client_id) !== String(linha.cliente_id)) {
    throw new ErroOAuth('invalid_grant', 'O refresh_token é de outro cliente.');
  }
  if (!(await usuarioComMcp(db, String(linha.usuario_id)))) {
    // Acesso tirado: a conexão morre aqui, e não só na próxima chamada.
    await db.execute({ sql: 'DELETE FROM mcp_tokens WHERE id = ?', args: [linha.id as never] });
    throw new ErroOAuth('invalid_grant', 'Acesso não liberado.');
  }
  const par = parDeTokens();
  // A troca é condicionada ao hash antigo: dois refreshes simultâneos com o
  // mesmo token não saem os dois com um par válido.
  const trocou = await db.execute({
    sql: `UPDATE mcp_tokens
          SET access_hash = ?, access_expira = ?, refresh_hash = ?, refresh_expira = ?, visto_em = ?
          WHERE id = ? AND refresh_hash = ?`,
    args: [par.accessHash, par.accessExpira, par.refreshHash, par.refreshExpira,
      new Date().toISOString(), linha.id as never, hash(refresh)],
  });
  if (trocou.rowsAffected === 0) throw new ErroOAuth('invalid_grant', 'refresh_token já usado.');
  return respostaDeToken(par);
}

// ── O token na chamada ──────────────────────────────────────────────────────

export interface UsuarioMcp {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  papel: Papel;
}

/**
 * Quem está chamando, ou null. As três conferências são uma consulta só: o
 * token vale, a pessoa está ativa e o MCP dela continua ligado. Desligar no
 * painel corta na chamada seguinte.
 */
export async function usuarioDoToken(db: Client, token: string): Promise<UsuarioMcp | null> {
  if (!token) return null;
  const r = await db.execute({
    sql: `SELECT t.id AS token_id, t.visto_em, u.id, u.email, u.nome, u.foto_url, u.papel
          FROM mcp_tokens t JOIN usuarios u ON u.id = t.usuario_id
          WHERE t.access_hash = ? AND t.access_expira > ?
            AND u.ativo = 1 AND u.mcp_habilitado = 1`,
    args: [hash(token), new Date().toISOString()],
  });
  const l = r.rows[0];
  if (!l) return null;
  const visto = Date.parse(String(l.visto_em ?? ''));
  if (!Number.isFinite(visto) || Date.now() - visto > VISTO_APOS_MS) {
    db.execute({
      sql: 'UPDATE mcp_tokens SET visto_em = ? WHERE id = ?',
      args: [new Date().toISOString(), l.token_id as never],
    }).catch(() => { /* o carimbo é apoio, não trava a chamada */ });
  }
  const email = String(l.email);
  return {
    id: String(l.id),
    email,
    nome: String(l.nome),
    foto_url: l.foto_url != null ? String(l.foto_url) : null,
    papel: papelEfetivo(email, l.papel),
  };
}

// ── Conexões da pessoa ──────────────────────────────────────────────────────

export async function mcpHabilitado(db: Client, usuarioId: string | null | undefined): Promise<boolean> {
  if (!usuarioId) return false;
  const r = await db.execute({
    sql: 'SELECT mcp_habilitado FROM usuarios WHERE id = ?', args: [usuarioId],
  });
  return Number(r.rows[0]?.mcp_habilitado ?? 0) === 1;
}

export async function conexoesDoUsuario(db: Client, usuarioId: string) {
  const r = await db.execute({
    sql: `SELECT t.id, c.nome AS cliente, t.criado_em, t.visto_em
          FROM mcp_tokens t LEFT JOIN mcp_clientes c ON c.id = t.cliente_id
          WHERE t.usuario_id = ? AND t.refresh_expira > ?
          ORDER BY COALESCE(t.visto_em, t.criado_em) DESC`,
    args: [usuarioId, new Date().toISOString()],
  });
  return r.rows.map(l => ({
    id: Number(l.id),
    cliente: String(l.cliente ?? 'Cliente MCP'),
    criado_em: String(l.criado_em),
    visto_em: l.visto_em != null ? String(l.visto_em) : null,
  }));
}

/** Apaga uma conexão, e só se for de quem pede. */
export async function desconectar(db: Client, usuarioId: string, conexaoId: number): Promise<boolean> {
  const r = await db.execute({
    sql: 'DELETE FROM mcp_tokens WHERE id = ? AND usuario_id = ?', args: [conexaoId, usuarioId],
  });
  return r.rowsAffected > 0;
}

export async function revogarTudo(db: Client, usuarioId: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM mcp_tokens WHERE usuario_id = ?', args: [usuarioId] });
  await db.execute({ sql: 'DELETE FROM mcp_codigos WHERE usuario_id = ?', args: [usuarioId] });
}
