import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { getAdminSession } from './_admin-handler.js';
import { exigirFerramenta } from './_permissoes.js';
import { htmlEmPdf } from './_pdf-da-proposta.js';

// ─────────────────────────────────────────────────────────────────────────────
//  /api/proposta-pdf
//
//  Recebe o HTML da proposta, montado na tela pelo mesmo montador da prévia,
//  e devolve o PDF. Endpoint próprio, e não uma ação do `/api/admin-data`,
//  porque a resposta é um arquivo, e não JSON - e porque ele carrega o Chrome,
//  que não precisa pesar em todas as outras ações.
// ─────────────────────────────────────────────────────────────────────────────

/** Teto do HTML: o modelo tem uns 90 kB, e protótipos embutidos somam alguns
 *  megas. Acima disso não é proposta. */
const TETO = 25 * 1024 * 1024;

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  const token = String(req.headers['x-admin-session'] ?? '');
  const sessao = await getAdminSession(db, token).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });

  // Baixar uma proposta é ver uma proposta: vale para quem monta e para quem
  // abre a do card da oportunidade.
  const recusaGerador = await exigirFerramenta(db, sessao.usuario, 'propostas:ver');
  if (recusaGerador) {
    const recusaFunil = await exigirFerramenta(db, sessao.usuario, 'oportunidades:ver');
    if (recusaFunil) return res.status(recusaGerador.status).json(recusaGerador.body);
  }

  const html = typeof req.body?.html === 'string' ? req.body.html : '';
  if (!html.trim()) return res.status(400).json({ error: 'Proposta sem conteúdo.' });
  if (html.length > TETO) return res.status(413).json({ error: 'A proposta passou do tamanho que dá para converter.' });

  const r = await htmlEmPdf(html);
  if (!r.ok) return res.status(r.status).json({ error: r.erro });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(r.pdf.byteLength));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(Buffer.from(r.pdf));
}
