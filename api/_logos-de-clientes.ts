// ─────────────────────────────────────────────────────────────────────────────
//  A logo do cliente gravada pelo portal.
//
//  As marcas da casa moram em `src/lib/marcas.ts`, como arquivos do site. Esta
//  é a outra fonte: a logo que alguém (o bot do WhatsApp, quase sempre) anexa
//  ao cliente pelo portal. Ela fica no banco, em base64, e sai por duas portas
//  públicas da rota do projeto, porque o carrossel da tela de entrada aparece
//  antes de qualquer login:
//
//  - `modo=marcas`: a lista das logos gravadas, com o nome do cliente e o
//    endereço da imagem. Só cliente ativo.
//  - `modo=logo&id=...`: a imagem. O endereço leva a versão (`v`), então a
//    borda guarda a resposta por um ano e a troca de logo muda o endereço.
//
//  Só PNG, WEBP e JPEG, conferidos pelos primeiros bytes: SVG fica de fora
//  porque é documento, e servido do domínio do portal pode rodar script. Quem
//  tem um SVG converte antes (o bot passa a imagem por um conversor).
//
//  Como a rota pública, este módulo não fala com `_admin-handler`: o handler
//  importa daqui o DDL e a validação, e não o contrário.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type Client } from '@libsql/client';

export const DDL_LOGOS_DE_CLIENTES = `
  CREATE TABLE IF NOT EXISTS cliente_logos (
    cliente_id     TEXT PRIMARY KEY,
    mime           TEXT NOT NULL,
    dados          TEXT NOT NULL,
    versao         TEXT NOT NULL,
    atualizado_em  TEXT NOT NULL,
    atualizado_por TEXT
  )
`;

/** Teto da logo. Uma marca bem exportada tem dezenas de KB; isto é folga para
 *  um PNG grande, e não convite a foto. */
export const LOGO_MAX_BYTES = 700 * 1024;

const ASSINATURAS: { mime: string; confere: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', confere: b => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', confere: b => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', confere: b => b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

/** O tipo de verdade da imagem, pelos primeiros bytes, ou o erro para a tela. */
export function conferirLogo(base64: unknown): { mime: string; dados: string } | { erro: string } {
  const texto = String(base64 ?? '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!texto) return { erro: 'Faltou a imagem da logo.' };
  const bytes = Buffer.from(texto, 'base64');
  if (!bytes.length) return { erro: 'A imagem da logo veio vazia.' };
  if (bytes.length > LOGO_MAX_BYTES) {
    return { erro: `A logo tem ${Math.round(bytes.length / 1024)} KB, e o teto é ${Math.round(LOGO_MAX_BYTES / 1024)} KB.` };
  }
  const tipo = ASSINATURAS.find(a => a.confere(bytes));
  if (!tipo) return { erro: 'A logo precisa ser PNG, WEBP ou JPEG.' };
  return { mime: tipo.mime, dados: bytes.toString('base64') };
}

/** O endereço público da logo, com a versão: muda quando a logo muda. */
export const enderecoDaLogo = (clienteId: string, versao: string) =>
  `/api/projeto-publico?modo=logo&id=${encodeURIComponent(clienteId)}&v=${encodeURIComponent(versao)}`;

/** As logos gravadas, por cliente ativo: nome e endereço. */
export async function logosGravadas(db: Client): Promise<{ cliente_id: string; nome: string; src: string }[]> {
  try {
    const r = await db.execute(`
      SELECT c.id AS cliente_id, c.nome AS nome, l.versao AS versao
      FROM cliente_logos l JOIN clientes c ON c.id = l.cliente_id
      WHERE c.ativo = 1
      ORDER BY c.nome
    `);
    return r.rows.map(x => ({
      cliente_id: String(x.cliente_id), nome: String(x.nome), src: enderecoDaLogo(String(x.cliente_id), String(x.versao)),
    }));
  } catch {
    // Antes da primeira gravação a tabela pode nem existir: sem logo, sem erro.
    return [];
  }
}

/** As duas portas públicas: a lista (`modo=marcas`) e a imagem (`modo=logo`). */
export async function atenderLogos(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });

  if (req.query.modo === 'marcas') {
    const logos = await logosGravadas(db);
    // Cinco minutos na borda: a logo nova aparece logo, e a tela de entrada,
    // que todo mundo abre, não vira uma consulta por visita.
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ marcas: logos.map(({ nome, src }) => ({ nome, src })) });
  }

  const id = String(req.query.id ?? '').trim();
  if (!id || id.length > 64) return res.status(404).json({ error: 'Logo não encontrada.' });
  let linha: Record<string, unknown> | undefined;
  try {
    const r = await db.execute({
      sql: `SELECT l.mime AS mime, l.dados AS dados
            FROM cliente_logos l JOIN clientes c ON c.id = l.cliente_id
            WHERE l.cliente_id = ? AND c.ativo = 1`,
      args: [id],
    });
    linha = r.rows[0] as Record<string, unknown> | undefined;
  } catch { linha = undefined; }
  if (!linha) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(404).json({ error: 'Logo não encontrada.' });
  }
  res.setHeader('Content-Type', String(linha.mime));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  // O endereço leva a versão: a mesma URL é sempre a mesma imagem.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // `end`, e não `send`: o servidor local de desenvolvimento não tem o `send`.
  res.status(200);
  return res.end(Buffer.from(String(linha.dados), 'base64'));
}
