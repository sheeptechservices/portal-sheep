import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { createSign } from 'crypto';
import { getAdminSession } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getQuery } from './_query.js';

// ─────────────────────────────────────────────────────────────────────────────
//  /api/relatorios
//  Lê a aba OPERACOES da planilha "BASE DE DADOS - OPERAÇÕES & FINANCEIRO" no
//  Google Sheets (via service account) e devolve as operações já mapeadas para o
//  formato consumido pela tela de Relatórios › Veículos.
//
//  Env vars necessárias (Vercel):
//    GOOGLE_SA_EMAIL        → client_email do JSON da service account
//    GOOGLE_SA_PRIVATE_KEY  → private_key do JSON (string com \n literais)
//    RELATORIOS_SHEET_ID    → ID da planilha (parte entre /d/ e /edit da URL)
//    RELATORIOS_SHEET_ABA   → (opcional) nome da aba; default "OPERACOES"
// ─────────────────────────────────────────────────────────────────────────────

type VehicleId = 'FIDC' | 'ATLAS' | 'DUX';

interface Op {
  id: string;
  veiculo: VehicleId;
  subFundo: string; // sub-etiqueta do FIDC: 'Direta' | 'Cedida' | 'Recomprada' | ''
  status: string;
  carteira: 'ativa' | 'historico';
  cliente: string;
  dataAdiant: string;
  dateISO: string;
  sacado: string;
  bruto: number;
  liquido: number;
  fat: number;
  dur: number;
}

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

// ── Cache leve em memória (instância reaproveitada sob Fluid Compute) ────────────
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; ops: Op[] } | null = null;

// ── Auth Google (JWT RS256 → access token) ──────────────────────────────────────
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL;
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error('Credenciais do Google ausentes (GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY).');
  }
  const privateKey = rawKey.replace(/\\n/g, '\n');

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = b64url(createSign('RSA-SHA256').update(signingInput).sign(privateKey));
  const jwt = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json() as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao autenticar no Google: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

// ── Helpers de mapeamento ────────────────────────────────────────────────────────
function norm(s: unknown): string {
  return String(s ?? '').trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Serial do Sheets (dias desde 1899-12-30) → ISO yyyy-mm-dd, em UTC
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
function serialToISO(serial: unknown): string {
  const n = typeof serial === 'number' ? serial : Number(serial);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(SHEETS_EPOCH + Math.round(n) * 86400000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function isoToBR(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function vehicleFromTag(tag: unknown): VehicleId {
  const t = norm(tag);
  if (t.startsWith('FIDC')) return 'FIDC';
  if (t.startsWith('ATLAS')) return 'ATLAS';
  return 'DUX'; // sem tag de fundo = book próprio
}

// Sub-etiqueta do FIDC (cascateia do macro): Direta / Cedida / Recomprada
function subFundoFromTag(tag: unknown): string {
  const t = norm(tag);
  if (t.includes('RECOMPR')) return 'Recomprada';
  if (t.includes('CEDID')) return 'Cedida';
  if (t.includes('DIRET')) return 'Direta';
  return '';
}

async function fetchOps(): Promise<Op[]> {
  const sheetId = process.env.RELATORIOS_SHEET_ID;
  if (!sheetId) throw new Error('RELATORIOS_SHEET_ID não configurado.');
  const aba = process.env.RELATORIOS_SHEET_ABA || 'OPERACOES';

  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(aba)}`
    + `?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json() as { values?: unknown[][]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Sheets API: ${data.error?.message || res.status}`);

  const rows = data.values ?? [];
  if (rows.length < 2) return [];

  // Localiza colunas pelo cabeçalho (robusto a reordenação de colunas)
  const header = rows[0].map(norm);
  const idx = (name: string) => header.indexOf(norm(name));
  const cID      = idx('ID');
  const cStatus  = idx('STATUS');
  const cCliente = idx('CLIENTE');
  const cBruto   = idx('VALOR BRUTO ANTECIPADO');
  const cLiquido = idx('VALOR LÍQUIDO ANTECIPADO');
  const cDur     = idx('DURAÇÃO (DIAS)');
  const cSacado  = idx('SACADO RS');
  const cTag     = idx('TAG FUNDO');
  const cData    = idx('DATA PAGAMENTO SOLICITAÇÃO');

  const ops: Op[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawId = cID >= 0 ? r[cID] : null;
    if (rawId == null || String(rawId).trim() === '') continue; // pula linhas vazias

    const status = cStatus >= 0 ? String(r[cStatus] ?? '').trim() : '';
    const bruto = toNum(r[cBruto]);
    const liquido = toNum(r[cLiquido]);
    const iso = cData >= 0 ? serialToISO(r[cData]) : '';

    ops.push({
      id: 'OP-' + String(rawId).padStart(5, '0'),
      veiculo: vehicleFromTag(cTag >= 0 ? r[cTag] : null),
      subFundo: subFundoFromTag(cTag >= 0 ? r[cTag] : null),
      status,
      carteira: status === 'Concluída' ? 'historico' : 'ativa',
      cliente: cCliente >= 0 ? String(r[cCliente] ?? '').trim() : '',
      dataAdiant: isoToBR(iso),
      dateISO: iso,
      sacado: cSacado >= 0 ? String(r[cSacado] ?? '').trim() : '',
      bruto,
      liquido,
      fat: Math.round((bruto - liquido) * 100) / 100, // deságio total da operação
      dur: cDur >= 0 ? Math.round(toNum(r[cDur])) : 0,
    });
  }
  return ops;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Auth admin (mesmo padrão das demais rotas)
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const db = getDb();
    // `getAdminSession` no lugar de `validateAdminSession`: aqui precisa da
    // pessoa, não só de "a sessão vale", para conferir a permissão dela.
    const sessao = await getAdminSession(db, sessionToken);
    if (!sessao) return res.status(401).json({ error: 'Sessão expirada.' });
    const recusa = await exigir(db, sessao.usuario, 'relatorios:ver');
    if (recusa) return res.status(recusa.status).json(recusa.body);
  } catch {
    return res.status(500).json({ error: 'Internal error' });
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const refresh = getQuery(req).get('refresh') === '1';
    const fresh = !cache || refresh || (Date.now() - cache.at) > CACHE_TTL_MS;
    if (fresh) {
      const ops = await fetchOps();
      cache = { at: Date.now(), ops };
    }
    return res.status(200).json({
      ops: cache!.ops,
      total: cache!.ops.length,
      fetchedAt: cache!.at,
      cached: !fresh,
    });
  } catch (err: any) {
    console.error('[api/relatorios]', err);
    return res.status(500).json({ error: err?.message || 'Erro ao ler a planilha.' });
  }
}
