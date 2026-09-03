// ─────────────────────────────────────────────────────────────────────────────
//  Verificação do ID token do "Entrar com o Google".
//
//  Sem dependência nova: o node:crypto importa a chave pública do JWKS do Google
//  direto em formato JWK e confere a assinatura RS256. O que o Google exige que
//  seja checado está todo aqui - assinatura, emissor, audiência, validade e
//  e-mail verificado -, mais o filtro de quem pode entrar.
//
//  O token que chega vem do navegador, então nada dele é confiável antes da
//  verificação da assinatura: só depois disso o e-mail vale como identidade.
// ─────────────────────────────────────────────────────────────────────────────
import { createPublicKey, createVerify } from 'node:crypto';

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISSORES = ['https://accounts.google.com', 'accounts.google.com'];
/** Folga de relógio entre o servidor do Google e o nosso. */
const FOLGA_SEG = 60;

interface ChaveJwk extends JsonWebKey { kid?: string; alg?: string }

let cacheChaves: { chaves: ChaveJwk[]; expira: number } | null = null;

/** JWKS do Google, com o cache que o próprio cabeçalho da resposta manda usar. */
async function chavesGoogle(): Promise<ChaveJwk[]> {
  if (cacheChaves && cacheChaves.expira > Date.now()) return cacheChaves.chaves;

  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`JWKS do Google respondeu ${res.status}`);
  const { keys } = (await res.json()) as { keys: ChaveJwk[] };
  if (!Array.isArray(keys) || !keys.length) throw new Error('JWKS do Google veio vazio');

  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1];
  // Piso de 10min e teto de 24h: o Google roda as chaves, mas não a cada minuto.
  const seg = Math.min(Math.max(Number(maxAge) || 3600, 600), 86400);
  cacheChaves = { chaves: keys, expira: Date.now() + seg * 1000 };
  return keys;
}

function base64url(parte: string): Buffer {
  return Buffer.from(parte.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export interface ContaGoogle {
  email: string;
  nome: string;
  /** URL da foto do perfil, quando o Google manda. Serve só de avatar na UI. */
  foto: string | null;
}

/**
 * Quem passa direto: o domínio da casa. `GOOGLE_ALLOWED_DOMAIN` troca o domínio
 * e `ADMIN_GOOGLE_EMAILS` (lista separada por vírgula) libera endereços avulsos
 * que precisam entrar mesmo com o banco fora do ar.
 *
 * O domínio é conferido pela claim `hd`, que o Google emite para dizer a que
 * Workspace a conta pertence, e não só pelo sufixo do e-mail: uma conta pessoal
 * pode ter um e-mail com o sufixo da empresa sem estar no Workspace dela.
 *
 * Quem está fora daqui ainda pode entrar por convite - ver `convidado` em
 * `verificarIdTokenGoogle`.
 */
function permitido(email: string, hd: string, dominio: string, avulsos: string): boolean {
  const e = email.toLowerCase();
  const d = dominio.toLowerCase();
  if (d && hd.toLowerCase() === d && e.endsWith(`@${d}`)) return true;
  return avulsos
    .split(',')
    .map(x => x.trim().toLowerCase())
    .filter(Boolean)
    .includes(e);
}

export interface ConfigGoogle {
  clientId: string;
  /** Segredo do OAuth client. Só o servidor conhece; usado na troca do código. */
  clientSecret: string;
  dominio: string;
  avulsos: string;
}

/**
 * Pergunta se um e-mail de fora do domínio foi convidado: cadastrado antes no
 * painel de Usuários e ainda ativo. Quem chama liga isto no banco.
 */
export type ChecarConvite = (email: string) => Promise<boolean>;

/**
 * Devolve a conta quando o token é legítimo e o e-mail tem acesso; lança em
 * qualquer outro caso. Quem chama responde 401 sem detalhar o motivo.
 *
 * `convidado` é a segunda porta, e só ela deixa entrar quem não é do domínio.
 * Sem ela a regra é a de sempre - domínio ou lista do ambiente -, então esquecer
 * de passá-la fecha a porta em vez de abri-la.
 */
export async function verificarIdTokenGoogle(
  idToken: string,
  cfg: ConfigGoogle,
  convidado?: ChecarConvite,
): Promise<ContaGoogle> {
  if (!cfg.clientId) throw new Error('GOOGLE_CLIENT_ID não configurado');

  const partes = String(idToken ?? '').split('.');
  if (partes.length !== 3) throw new Error('token malformado');
  const [cabecalho64, corpo64, assinatura64] = partes;

  const cabecalho = JSON.parse(base64url(cabecalho64).toString('utf8')) as { alg?: string; kid?: string };
  if (cabecalho.alg !== 'RS256') throw new Error(`alg inesperado: ${cabecalho.alg}`);

  const jwk = (await chavesGoogle()).find(k => k.kid === cabecalho.kid);
  if (!jwk) throw new Error('kid fora do JWKS');

  const chave = createPublicKey({ key: jwk, format: 'jwk' });
  const assinaturaOk = createVerify('RSA-SHA256')
    .update(`${cabecalho64}.${corpo64}`)
    .verify(chave, base64url(assinatura64));
  if (!assinaturaOk) throw new Error('assinatura inválida');

  const corpo = JSON.parse(base64url(corpo64).toString('utf8')) as Record<string, unknown>;
  const agora = Math.floor(Date.now() / 1000);

  if (!EMISSORES.includes(String(corpo.iss))) throw new Error('emissor inesperado');
  if (corpo.aud !== cfg.clientId) throw new Error('audiência inesperada');
  if (typeof corpo.exp !== 'number' || corpo.exp < agora - FOLGA_SEG) throw new Error('token expirado');
  if (typeof corpo.iat === 'number' && corpo.iat > agora + 300) throw new Error('token do futuro');
  if (corpo.email_verified !== true) throw new Error('e-mail não verificado no Google');

  const email = String(corpo.email ?? '');
  if (!email) throw new Error('token sem e-mail');
  const hd = String(corpo.hd ?? '');
  if (!permitido(email, hd, cfg.dominio, cfg.avulsos)) {
    // Fora do domínio: entra quem foi cadastrado antes, e só enquanto o cadastro
    // estiver ativo. Tirar o acesso no painel fecha a porta na entrada seguinte.
    const temConvite = convidado ? await convidado(email.toLowerCase()) : false;
    if (!temConvite) throw new Error(`e-mail sem acesso: ${email}`);
  }

  // A claim `picture` só vem quando o Workspace expõe a foto no token. Quando não
  // vem, quem busca a foto é a People API, com o access token que a troca do
  // código devolveu (ver `upsertUsuarioGoogle`).
  const foto = typeof corpo.picture === 'string' && corpo.picture.startsWith('https://') ? corpo.picture : null;
  return { email: email.toLowerCase(), nome: String(corpo.name ?? email), foto };
}

/** Lê a configuração do ambiente, com o domínio da casa como padrão. */
export function configGoogle(env: Record<string, string | undefined>): ConfigGoogle {
  return {
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    dominio: env.GOOGLE_ALLOWED_DOMAIN ?? 'wearedux.com',
    avulsos: env.ADMIN_GOOGLE_EMAILS ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Troca do código de autorização por tokens.
//
//  A entrada usa o fluxo de código (e não só o ID token) por um motivo prático:
//  o Workspace daqui não expõe a claim `picture` no ID token, então a foto do
//  perfil só sai da People API, que precisa de um access token. Pedindo o escopo
//  `profile` já na tela de entrada, o access token vem junto do login e a foto
//  entra sozinha, sem segundo clique e sem segundo popup.
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface TokensGoogle {
  idToken: string;
  /** Access token do escopo `profile`, quando o Google devolve. */
  accessToken: string | null;
}

/**
 * `redirect_uri: 'postmessage'` é o valor literal que o Google exige quando o
 * código veio do popup do GIS, e não de um redirect de verdade.
 *
 * O código sozinho não autentica ninguém: quem vale como identidade continua
 * sendo o ID token que volta daqui, conferido em `verificarIdTokenGoogle`.
 */
export async function trocarCodigoGoogle(codigo: string, cfg: ConfigGoogle): Promise<TokensGoogle> {
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados');
  if (!codigo) throw new Error('código de autorização ausente');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: codigo,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });

  const dados = (await res.json().catch(() => ({}))) as {
    id_token?: string; access_token?: string; error?: string; error_description?: string;
  };
  if (!res.ok || !dados.id_token) {
    throw new Error(`troca do código falhou (${res.status}): ${dados.error_description ?? dados.error ?? 'sem id_token'}`);
  }
  return { idToken: dados.id_token, accessToken: dados.access_token ?? null };
}
