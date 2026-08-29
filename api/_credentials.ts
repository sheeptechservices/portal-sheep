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
