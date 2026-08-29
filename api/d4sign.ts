import type { VercelRequest, VercelResponse } from '@vercel/node';
import PDFDocumentLib from 'pdfkit';
import { createClient } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigir } from './_permissoes.js';
import { getQuery } from './_query.js';

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

// pdfkit is CJS - handle both default and named export patterns
const PDFDocument = (PDFDocumentLib as any).default ?? PDFDocumentLib;

const BASE_URL  = process.env.D4SIGN_BASE_URL  ?? 'https://secure.d4sign.com.br/api/v1';
const TOKEN_API = process.env.D4SIGN_API_KEY   ?? '';
const CRYPT_KEY = process.env.D4SIGN_CRYPT_KEY ?? '';


// ── D4Sign HTTP helper ────────────────────────────────────────────────────────
async function d4fetch(path: string, opts?: RequestInit) {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE_URL}${path}${sep}tokenAPI=${TOKEN_API}&cryptKey=${CRYPT_KEY}`;
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.message ?? data?.error ?? `D4Sign error ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtCNPJ(v: string): string {
  const d = (v ?? '').replace(/\D/g, '');
  if (d.length !== 14) return v;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function fmtBRL(n: number): string {
  return (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ── PDF generation ────────────────────────────────────────────────────────────
interface OpData {
  id: string;
  nomeCedente: string; cnpjCedente: string; emailCedente: string;
  nomeSacado: string; cnpjSacado: string;
  numeroNF?: string; dataEmissaoNF?: string; valorNF?: number;
  vencimento?: string; periodoServico?: string;
  bancoNome?: string; agencia?: string; conta?: string;
  titularConta?: string; cnpjTitular?: string;
}

async function generatePDF(op: OpData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 60, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const BLACK  = '#121316';
    const BLUE   = '#1B3A5C';
    const GRAY   = '#666666';
    const GRAY2  = '#AAAAAA';
    const YELLOW = '#FFB400';
    const W = 475; // content width

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(60, 40, W, 4).fill(YELLOW);
    doc.y = 58;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(BLACK)
      .text('TERMO DE ACEITE DO SACADO', { align: 'center' });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY)
      .text('Operação de Antecipação de Recebíveis - FIDC DUX', { align: 'center' });
    doc.moveDown(1.5);

    // ── Section / row helpers ─────────────────────────────────────────────────
    function section(title: string) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE)
        .text(title.toUpperCase(), { characterSpacing: 0.8 });
      const y = doc.y + 3;
      doc.rect(60, y, W, 0.8).fill('#E3E4DE');
      doc.y = y + 8;
    }

    function row(label: string, value: string) {
      const startY = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GRAY2)
        .text(label, 60, startY, { continued: false, width: 140 });
      doc.font('Helvetica').fontSize(9).fillColor(BLACK)
        .text(value || '-', 200, startY, { width: W - 140 });
      doc.y = Math.max(doc.y, startY + 14);
    }

    // ── Cedente ───────────────────────────────────────────────────────────────
    section('Cedente');
    row('Razão Social', op.nomeCedente);
    row('CNPJ', fmtCNPJ(op.cnpjCedente));
    if (op.emailCedente) row('E-mail', op.emailCedente);
    doc.moveDown(0.8);

    // ── Sacado ────────────────────────────────────────────────────────────────
    section('Sacado');
    row('Razão Social', op.nomeSacado);
    if (op.cnpjSacado) row('CNPJ', fmtCNPJ(op.cnpjSacado));
    doc.moveDown(0.8);

    // ── Operação ──────────────────────────────────────────────────────────────
    if (op.valorNF != null || op.vencimento) {
      section('Operação');
      if (op.valorNF != null) row('Valor', fmtBRL(op.valorNF));
      if (op.vencimento)      row('Vencimento', fmtDate(op.vencimento));
      doc.moveDown(0.8);
    }

    // ── Conta Bancária ────────────────────────────────────────────────────────
    if (op.bancoNome) {
      section('Conta para Pagamento (Escrow)');
      row('Banco', op.bancoNome);
      if (op.agencia) row('Agência', op.agencia);
      if (op.conta)   row('Conta', op.conta);
      if (op.titularConta) row('Titularidade', op.titularConta);
      if (op.cnpjTitular) row('CNPJ', fmtCNPJ(op.cnpjTitular));
      doc.moveDown(0.8);
    }

    // ── Declaração ────────────────────────────────────────────────────────────
    section('Declaração');
    const decl = `Declaro que estou ciente e autorizado a confirmar o recebimento dos serviços e os dados de pagamento de ${op.nomeCedente}. Declaro ainda que a nota fiscal referente a esta operação é exclusiva e não duplicada em outras operações de antecipação, e que os dados bancários indicados para pagamento não poderão ser alterados sob nenhuma hipótese sem a anuência prévia e formal do financeiro DUX.`;
    doc.font('Helvetica').fontSize(9).fillColor(BLACK)
      .text(decl, 60, doc.y, { width: W, align: 'justify', lineGap: 3 });
    doc.moveDown(2.5);

    // ── Signature line ────────────────────────────────────────────────────────
    const sigY = doc.y;
    doc.rect(60, sigY, 200, 0.8).fill('#E3E4DE');
    doc.font('Helvetica').fontSize(8).fillColor(GRAY2)
      .text('Assinatura do Sacado', 60, sigY + 5);

    // ── Footer ────────────────────────────────────────────────────────────────
    doc.rect(60, 775, W, 1).fill(YELLOW);
    doc.font('Helvetica').fontSize(7).fillColor(GRAY2)
      .text(`Documento gerado em ${new Date().toLocaleDateString('pt-BR')}  |  Operação ID: ${op.id}  |  DUX`, 60, 782, { align: 'center', width: W });

    doc.end();
  });
}

// ── Vercel handler ────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Sem CORS de propósito: o painel é servido da mesma origem, então liberar
  // outras origens só serviria para um site qualquer chamar isto pelo navegador
  // de quem tem sessão. Era assim que este endpoint estava, com `*`.
  // Exige sessão do painel: este endpoint fala com a conta da empresa na D4Sign
  // (cria documento, consulta status) usando as credenciais mestras. Vem antes
  // da checagem de configuração de propósito: quem não tem sessão não precisa
  // saber se a integração está montada ou não.
  const sessionToken = String(req.headers['x-admin-session'] ?? '');
  if (!sessionToken) return res.status(401).json({ error: 'Unauthorized' });
  const db = getDb();
  let sessao;
  try {
    sessao = await getAdminSession(db, sessionToken);
  } catch (err) {
    console.error('[d4sign] session error', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
  if (!sessao) return res.status(401).json({ error: 'Sessão expirada.' });

  // Mesma ordem do resto da rota: permissão antes da configuração, para quem
  // não pode assinar não descobrir se a integração está montada.
  const recusaPerm = await exigir(db, sessao.usuario, 'aceites:assinatura');
  if (recusaPerm) return res.status(recusaPerm.status).json(recusaPerm.body);

  if (!TOKEN_API || !CRYPT_KEY) {
    return res.status(501).json({ error: 'D4Sign não configurado - defina D4SIGN_API_KEY e D4SIGN_CRYPT_KEY no .env' });
  }

  const query = getQuery(req);
  const action = String(query.get('action') ?? '');

  // ── GET /api/d4sign?action=status&uuid=xxx ────────────────────────────────
  if (req.method === 'GET' && action === 'status') {
    const uuid = String(query.get('uuid') ?? '');
    if (!uuid) return res.status(400).json({ error: 'uuid required' });
    try {
      const data = await d4fetch(`/documents/${uuid}`);
      const statusId = Number(data.statusId ?? data.uuidStatus ?? data.status_id ?? 0);
      const status = statusId === 3 ? 'signed' : statusId === 4 ? 'canceled' : 'pending';
      return res.status(200).json({ status, statusId });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao verificar status' });
    }
  }

  // ── POST /api/d4sign?action=create ───────────────────────────────────────
  if (req.method === 'POST' && action === 'create') {
    try {
      const op: OpData = req.body?.operacao;
      if (!op?.id) return res.status(400).json({ error: 'operacao required' });
      // Cria documento na conta da empresa: fica registrado quem pediu.
      await registrarAuditoria(db, sessao.usuario, 'd4sign:create', op.id);

      // 1. Get first safe (pasta)
      const safes = await d4fetch('/safes');
      const safeList: Array<{ uuid: string }> = Array.isArray(safes) ? safes : Object.values(safes);
      const safeUUID = safeList[0]?.uuid;
      if (!safeUUID) throw new Error('Nenhuma pasta encontrada no D4Sign. Crie ao menos uma pasta no painel.');

      // 2. Generate PDF
      const pdfBuffer = await generatePDF(op);
      const pdfBase64 = pdfBuffer.toString('base64');

      // 3. Upload document
      const doc = await d4fetch('/documents', {
        method: 'POST',
        body: JSON.stringify({
          uuid_folder:         safeUUID,
          name:                `Aceite - ${op.nomeCedente}`,
          base64_binary_file:  pdfBase64,
          mime_type:           'application/pdf',
        }),
      });
      const documentUUID: string = doc.uuid ?? doc.uuidDoc;
      if (!documentUUID) throw new Error('D4Sign não retornou UUID do documento');

      // 4. Add signer (presencial - widget, no email auth)
      const signerEmail = op.emailCedente || 'assinar@wearedux.com';
      const listResult = await d4fetch(`/documents/${documentUUID}/createlist`, {
        method: 'POST',
        body: JSON.stringify({
          signers: [{
            email:                  signerEmail,
            act:                    '1',
            foreign:                '0',
            certificadoicpbr:       '0',
            assinatura_presencial:  '1',
          }],
        }),
      });

      // 5. Send to sign
      await d4fetch(`/documents/${documentUUID}/sendtosigner`, {
        method: 'POST',
        body: JSON.stringify({
          message:    `Prezado sacado, assine o documento de aceite referente à operação de ${op.nomeCedente}.`,
          skip_email: '1',
        }),
      });

      // A URL de assinatura embutida da D4Sign carrega `tokenAPI` e `cryptKey`
      // na query string - as credenciais mestras da conta. Ela NÃO é devolvida
      // ao navegador: os segredos ficam só dentro do `d4fetch`, aqui no
      // servidor. Se um dia a assinatura embutida voltar a ser usada, o caminho
      // é uma rota própria que monte a URL e redirecione, nunca este JSON.
      return res.status(200).json({ documentUUID });
    } catch (err: unknown) {
      console.error('[d4sign/create]', err);
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao criar documento D4Sign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
