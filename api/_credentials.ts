import type { Client } from '@libsql/client';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// ─────────────────────────────────────────────────────────────────────────────
//  Cofre de credenciais de integração (chaves de API salvas no banco).
//
//  Os valores são criptografados em repouso com AES-256-GCM. A chave-mestra é a
//  `APP_ENCRYPTION_KEY`, e só ela: até 08/2026 havia um fallback para a
//  `D4SIGN_CRYPT_KEY`, o que amarrava o cofre a uma credencial de terceiro - e
//  justamente a que o `/api/d4sign` público vazava. Com o fallback, rotacionar a
//  chave da D4Sign tornava o cofre ilegível em silêncio. Agora são independentes:
//  girar uma não mexe na outra.
//
//  Tabela: integration_credentials (criada em ensureAdminSchema)
//    chave      → identificador da integração (ex.: 'anthropic')
//    valor      → segredo criptografado (formato: v1:<iv>:<tag>:<ciphertext>, base64)
//    meta       → JSON com metadados não-secretos (ex.: modelo escolhido)
//    updated_at → ISO timestamp
// ─────────────────────────────────────────────────────────────────────────────

const ENC_PREFIX = 'v1';

function masterKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY ?? '';
  if (!raw) {
    throw new Error('APP_ENCRYPTION_KEY ausente - o cofre de credenciais não abre sem ela.');
  }
  // Deriva uma chave de 32 bytes estável a partir da passphrase.
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENC_PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(enc: string): string {
  const parts = enc.split(':');
  if (parts.length !== 4 || parts[0] !== ENC_PREFIX) {
    throw new Error('Formato de credencial inválido.');
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', masterKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

export interface IntegrationCredential {
  value: string;                 // segredo já descriptografado
  meta: Record<string, any>;
  updatedAt: string;
}

export async function getIntegrationCredential(db: Client, chave: string): Promise<IntegrationCredential | null> {
  const res = await db.execute({
    sql: 'SELECT valor, meta, updated_at FROM integration_credentials WHERE chave = ?',
    args: [chave],
  });
  const row = res.rows[0];
  if (!row) return null;
  let value = '';
  try {
    value = decryptSecret(String(row.valor));
  } catch (err) {
    // Credencial corrompida ou chave-mestra trocada. Antes isso devolvia null
    // calado, e o sintoma aparecia longe da causa (a integração simplesmente
    // "parava de existir"). Agora o motivo fica no log.
    console.error(`[cofre] falha ao decifrar a credencial "${chave}":`, (err as Error).message);
    return null;
  }
  let meta: Record<string, any> = {};
  try { meta = row.meta ? JSON.parse(String(row.meta)) : {}; } catch { /* ignore */ }
  return { value, meta, updatedAt: String(row.updated_at ?? '') };
}

export async function saveIntegrationCredential(
  db: Client,
  chave: string,
  value: string,
  meta: Record<string, any> = {},
): Promise<void> {
  const enc = encryptSecret(value);
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO integration_credentials (chave, valor, meta, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, meta = excluded.meta, updated_at = excluded.updated_at`,
    args: [chave, enc, JSON.stringify(meta), now],
  });
}

// Atualiza apenas os metadados (ex.: trocar o modelo) sem exigir reenvio do segredo.
export async function updateIntegrationMeta(db: Client, chave: string, meta: Record<string, any>): Promise<boolean> {
  const now = new Date().toISOString();
  const res = await db.execute({
    sql: 'UPDATE integration_credentials SET meta = ?, updated_at = ? WHERE chave = ?',
    args: [JSON.stringify(meta), now, chave],
  });
  return (res.rowsAffected ?? 0) > 0;
}

export async function removeIntegrationCredential(db: Client, chave: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM integration_credentials WHERE chave = ?', args: [chave] });
}

// ── Anthropic (conveniência) ────────────────────────────────────────────────
export const ANTHROPIC_KEY = 'anthropic';
/** Identificador do Fireflies no cofre. */
export const FIREFLIES_KEY = 'fireflies';
/** Identificador do Resend no cofre - o serviço que entrega os e-mails. */
export const RESEND_KEY = 'resend';
// Opus 5 custa o mesmo que o 4.8 ($5/$25 por MTok) e é melhor em compreensão de
// documento/visão - o que importa direto na leitura dos anexos da análise.
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

// Testa se a chave da Anthropic é válida (endpoint de listagem de modelos - não
// consome tokens). 200 = válida; 401 = inválida/revogada.
export async function validateAnthropicKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!apiKey || !apiKey.trim()) return { ok: false, error: 'Chave ausente.' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=1', {
      headers: { 'x-api-key': apiKey.trim(), 'anthropic-version': '2023-06-01' },
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'Chave inválida ou revogada.' };
    return { ok: false, error: `Falha na validação (HTTP ${res.status}).` };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sem conexão com a Anthropic.' };
  }
}

/** A chave do Fireflies vale contra a API GraphQL deles: a consulta mais barata
 *  que existe e o proprio usuario dono da chave, e ela ja devolve nome e e-mail
 *  para a tela dizer de qual conta a integracao e - "conectado" sem dizer a
 *  quem serve de pouco quando a casa tem mais de uma conta. */
export async function validateFirefliesKey(
  apiKey: string,
): Promise<{ ok: boolean; conta?: { nome: string | null; email: string | null }; error?: string }> {
  if (!apiKey || !apiKey.trim()) return { ok: false, error: 'Chave ausente.' };
  try {
    const res = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({ query: '{ user { name email } }' }),
    });
    // O corpo e lido antes de olhar o status: o Fireflies responde 500 para
    // chave invalida, e so o `errors` de dentro diz o que houve. Confiar no
    // status devolveria "HTTP 500" para o caso mais comum de todos.
    const corpo: any = await res.json().catch(() => null);
    const erro: string | undefined = corpo?.errors?.[0]?.message;
    const naoAutorizado = res.status === 401 || res.status === 403
      || /unauthor|invalid|forbidden|token|authenticating|api key/i.test(erro ?? '');
    if (naoAutorizado) return { ok: false, error: 'Chave inválida ou revogada.' };
    if (erro) return { ok: false, error: erro };
    if (!res.ok) return { ok: false, error: `Falha na validação (HTTP ${res.status}).` };
    const u = corpo?.data?.user;
    if (!u) return { ok: false, error: 'A API respondeu sem os dados da conta.' };
    return {
      ok: true,
      conta: { nome: u.name ?? null, email: u.email ?? null },
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sem conexão com o Fireflies.' };
  }
}

/** Uma reuniao do Fireflies, no que interessa para escolher e anexar. */
export interface ReuniaoFireflies {
  id: string;
  titulo: string;
  /** ISO. A API devolve milissegundos desde a época. */
  data: string | null;
  /** Em minutos, arredondado. */
  duracao: number | null;
  participantes: string[];
  url: string | null;
  resumo: string | null;
  /** O resto do que a reunião carrega: resumos de outros tamanhos, tópicos com
   *  horário, palavras-chave e itens de ação. Guardado como veio, para a tela
   *  decidir o que mostrar sem uma ida nova à API. */
  detalhe: {
    gist: string | null;
    curto: string | null;
    topicos: string | null;
    notas: string | null;
    palavras: string[];
    acoes: string | null;
    organizador: string | null;
    reuniao_url: string | null;
  } | null;
}

/** Consulta a API do Fireflies. Isolada aqui porque tanto a listagem quanto o
 *  anexo precisam dela, e porque erro de GraphQL nao vem no status HTTP - vem
 *  no corpo, e quem chama nao deveria ter que saber disso. */
async function consultarFireflies(
  apiKey: string, query: string, variables?: Record<string, unknown>,
): Promise<{ ok: true; dados: any } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const corpo: any = await res.json().catch(() => null);
    const erro: string | undefined = corpo?.errors?.[0]?.message;
    if (erro) return { ok: false, error: erro };
    if (!res.ok) return { ok: false, error: `Falha na consulta (HTTP ${res.status}).` };
    if (!corpo?.data) return { ok: false, error: 'A API respondeu sem dados.' };
    return { ok: true, dados: corpo.data };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sem conexão com o Fireflies.' };
  }
}

/** A data vem como milissegundos desde a época, as vezes em texto. */
function dataDeFireflies(v: unknown): string | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isFinite(n) && n > 0) return new Date(n).toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function reuniaoDeFireflies(t: any): ReuniaoFireflies {
  // `meeting_attendees` traz nome quando existe; `participants` e a lista de
  // e-mails. Prefere-se o nome, porque e ele que a pessoa reconhece.
  const convidados: string[] = Array.isArray(t?.meeting_attendees)
    ? t.meeting_attendees.map((p: any) => p?.displayName || p?.name || p?.email).filter(Boolean)
    : [];
  const emails: string[] = Array.isArray(t?.participants) ? t.participants.filter(Boolean) : [];
  const texto = (v: unknown) => (v == null || v === '' ? null : String(v));
  const r = t?.summary;
  return {
    id: String(t?.id ?? ''),
    titulo: String(t?.title ?? 'Reunião sem título'),
    data: dataDeFireflies(t?.date),
    duracao: Number.isFinite(Number(t?.duration)) ? Math.round(Number(t.duration)) : null,
    participantes: (convidados.length ? convidados : emails).slice(0, 12),
    url: t?.transcript_url ? String(t.transcript_url) : null,
    resumo: texto(r?.overview),
    detalhe: r || t?.meeting_link ? {
      gist: texto(r?.gist),
      curto: texto(r?.short_summary),
      topicos: texto(r?.shorthand_bullet),
      notas: texto(r?.notes),
      palavras: Array.isArray(r?.keywords) ? r.keywords.map((k: unknown) => String(k)) : [],
      acoes: texto(r?.action_items),
      organizador: texto(t?.organizer_email),
      reuniao_url: texto(t?.meeting_link),
    } : null,
  };
}

/** As reunioes mais recentes da conta. O filtro por texto e feito aqui e nao na
 *  API: o `transcripts` deles filtra por titulo exato, e quem busca "weekly"
 *  quer achar "Weekly Orteconte" tambem. */
export async function listarReunioesFireflies(
  apiKey: string, busca: string, limite = 50,
): Promise<{ ok: true; reunioes: ReuniaoFireflies[] } | { ok: false; error: string }> {
  const query = `query($limit: Int) {
    transcripts(limit: $limit) {
      id title date duration transcript_url participants
      meeting_attendees { displayName name email }
    }
  }`;
  const r = await consultarFireflies(apiKey, query, { limit: limite });
  if (!r.ok) return r;
  const lista: ReuniaoFireflies[] = (r.dados?.transcripts ?? []).map(reuniaoDeFireflies);
  const q = busca.trim().toLocaleLowerCase('pt-BR');
  if (!q) return { ok: true, reunioes: lista };
  return {
    ok: true,
    reunioes: lista.filter(m =>
      m.titulo.toLocaleLowerCase('pt-BR').includes(q)
      || m.participantes.some(p => p.toLocaleLowerCase('pt-BR').includes(q))),
  };
}

/** O detalhe de uma reuniao, com o resumo - e ele que vira a nota no projeto. */
export async function obterReuniaoFireflies(
  apiKey: string, id: string,
): Promise<{ ok: true; reuniao: ReuniaoFireflies } | { ok: false; error: string }> {
  const query = `query($id: String!) {
    transcript(id: $id) {
      id title date duration transcript_url participants organizer_email meeting_link
      meeting_attendees { displayName name email }
      summary { overview gist short_summary shorthand_bullet notes keywords action_items }
    }
  }`;
  const r = await consultarFireflies(apiKey, query, { id });
  if (!r.ok) return r;
  const t = r.dados?.transcript;
  if (!t) return { ok: false, error: 'Reunião não encontrada no Fireflies.' };
  return { ok: true, reuniao: reuniaoDeFireflies(t) };
}

/** O endereço da gravação, buscado na hora de assistir.
 *
 *  Nunca guardado: a URL vem assinada pela CDN deles e expira em poucos dias.
 *  Salva no banco, ela funcionaria hoje e daria "acesso negado" na semana que
 *  vem, sem ninguém entender por quê. */
export async function obterGravacaoFireflies(
  apiKey: string, id: string,
): Promise<{ ok: true; video: string | null; audio: string | null } | { ok: false; error: string }> {
  const query = `query($id: String!) {
    transcript(id: $id) { video_url audio_url }
  }`;
  const r = await consultarFireflies(apiKey, query, { id });
  if (!r.ok) return r;
  const t = r.dados?.transcript;
  if (!t) return { ok: false, error: 'Reunião não encontrada no Fireflies.' };
  return {
    ok: true,
    video: t.video_url ? String(t.video_url) : null,
    audio: t.audio_url ? String(t.audio_url) : null,
  };
}

export interface AnthropicCredential {
  apiKey: string;
  model: string;
  source: 'db' | 'env';
}

// Resolve a credencial da Anthropic: primeiro o cofre do banco, com fallback para
// a env var ANTHROPIC_API_KEY (mantém compatibilidade com o que já existia).
export async function getAnthropicCredential(db: Client): Promise<AnthropicCredential | null> {
  try {
    const cred = await getIntegrationCredential(db, ANTHROPIC_KEY);
    if (cred?.value) {
      return { apiKey: cred.value, model: cred.meta.model || DEFAULT_ANTHROPIC_MODEL, source: 'db' };
    }
  } catch { /* cai no fallback de env */ }
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return { apiKey: envKey, model: DEFAULT_ANTHROPIC_MODEL, source: 'env' };
  return null;
}

/** A chave do Resend, conferida em duas tentativas.
 *
 *  A primeira é a lista de domínios: é a consulta mais barata que existe lá,
 *  não envia nada, e devolve justamente o que a tela precisa mostrar - de quais
 *  domínios esta conta pode enviar, e quais já estão verificados. Sem domínio
 *  verificado, o Resend só entrega para o e-mail do dono da conta, e é melhor a
 *  tela dizer isso antes de a régua começar a disparar.
 *
 *  Só que chave do Resend tem alcance: a de **acesso de envio** - a que a
 *  maioria cria - não enxerga domínio nenhum, e responde 401 ali. Recusá-la
 *  seria dizer "chave inválida" para uma chave que envia perfeitamente. Então a
 *  segunda tentativa bate na porta do envio com um corpo vazio: chave boa volta
 *  com erro de validação (falta destinatário), chave ruim volta com 401. Nada é
 *  enviado nos dois casos. */
export async function validateResendKey(apiKey: string): Promise<{
  ok: boolean;
  dominios?: { nome: string; situacao: string; verificado: boolean }[];
  /** A chave envia, mas não lista domínios: é uma chave de acesso de envio. */
  somenteEnvio?: boolean;
  error?: string;
}> {
  const chave = (apiKey ?? '').trim();
  if (!chave) return { ok: false, error: 'Chave ausente.' };
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${chave}` },
    });
    if (res.status === 401 || res.status === 403) {
      const envia = await chavePodeEnviar(chave);
      if (envia.ok) return { ok: true, dominios: [], somenteEnvio: true };
      return { ok: false, error: envia.error ?? 'Chave inválida ou revogada.' };
    }
    const corpo: any = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: corpo?.message ?? `Falha na validação (HTTP ${res.status}).` };
    }
    const lista: any[] = Array.isArray(corpo?.data) ? corpo.data : [];
    return {
      ok: true,
      dominios: lista.map(d => ({
        nome: String(d?.name ?? ''),
        situacao: String(d?.status ?? ''),
        verificado: String(d?.status ?? '').toLowerCase() === 'verified',
      })).filter(d => d.nome),
    };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sem conexão com o Resend.' };
  }
}

/** Bate na porta do envio sem enviar nada: corpo vazio é recusado pela
 *  validação deles, e o que interessa aqui é justamente *qual* recusa vem. */
async function chavePodeEnviar(chave: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status === 401 || res.status === 403) {
      const corpo: any = await res.json().catch(() => null);
      return { ok: false, error: corpo?.message ?? 'Chave inválida ou revogada.' };
    }
    // Qualquer outra resposta veio de uma chave autenticada: 422 e 400 são a
    // validação reclamando do corpo vazio, que é o que se queria.
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Sem conexão com o Resend.' };
  }
}
