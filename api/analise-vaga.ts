import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'crypto';
import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import { getAdminSession, registrarAuditoria } from './_admin-handler.js';
import { exigirFerramenta } from './_permissoes.js';
import { analisarVaga, conferirAnexos, type EventoDaAnalise } from './_analise-vaga.js';

// ─────────────────────────────────────────────────────────────────────────────
//  /api/analise-vaga
//
//  A análise de vaga do banco de talentos. Endpoint próprio, e não mais uma
//  ação do `/api/admin-data`, por um motivo só: esta responde em fluxo. O
//  despacho do admin-data devolve `{ status, body }` de uma vez, e uma espera
//  de um minuto sem notícia nenhuma parece tela travada - ainda mais numa ação
//  que custa dinheiro e que ninguém quer clicar duas vezes na dúvida.
//
//  Então a resposta é um fluxo de eventos (SSE): o dossiê ficou pronto, a vaga
//  foi entendida, fulano foi avaliado, e por fim o relatório. Cada evento é uma
//  linha `data:` com um JSON, e o último diz `pronto` ou `erro`.
//
//  Erro que acontece ANTES do primeiro byte sai como JSON normal, com status;
//  depois disso o cabeçalho já foi, e o jeito de contar é dentro do fluxo.
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  api: {
    // Cinco anexos de 5 MB chegam como uns 33 MB de base64. O teto do
    // `/api/admin-data` (20 MB) recusaria justamente o caso que a tela promete
    // aceitar.
    bodyParser: { sizeLimit: '40mb' },
  },
};

function getDb() {
  return createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
}

/** A entrada de uma análise já feita, para refazê-la igual. */
async function carregarEntrada(
  db: Client, id: string,
): Promise<{ texto: string; anexos: { nome: string; tipo: string; base64: string }[] } | null> {
  const [linha, anexos] = await Promise.all([
    db.execute({ sql: 'SELECT texto FROM analises_vaga WHERE id = ?', args: [id] }),
    db.execute({
      sql: 'SELECT nome, tipo, base64 FROM analise_vaga_anexos WHERE analise_id = ?',
      args: [id],
    }),
  ]);
  if (!linha.rows[0]) return null;
  return {
    texto: String(linha.rows[0].texto ?? ''),
    anexos: anexos.rows.map(a => ({
      nome: String(a.nome ?? 'anexo'),
      tipo: String(a.tipo ?? ''),
      base64: String(a.base64 ?? ''),
    })).filter(a => a.base64),
  };
}

/** Guarda a consulta inteira e devolve o id dela. */
async function guardar(db: Client, dados: {
  texto: string;
  anexos: { nome: string; tipo: string; base64: string }[];
  relatorio: any;
  autorId: string | null;
  autorNome: string | null;
  refeitaDe: string | null;
}): Promise<string> {
  const id = randomUUID();
  const topo = (dados.relatorio?.ranking ?? []).find((p: any) => p?.aderencia != null) ?? null;
  await db.execute({
    sql: `INSERT INTO analises_vaga
          (id, criado_em, criado_por_id, criado_por_nome, texto, relatorio, titulo,
           modelo, pessoas, cortado, topo_nome, topo_nota, refeita_de)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      id, new Date().toISOString(), dados.autorId, dados.autorNome, dados.texto,
      JSON.stringify(dados.relatorio),
      String(dados.relatorio?.vaga?.titulo ?? 'Vaga sem título'),
      String(dados.relatorio?.modelo ?? ''),
      (dados.relatorio?.ranking ?? []).length,
      dados.relatorio?.cortado ? 1 : 0,
      topo ? String(topo.nome) : null,
      topo ? Number(topo.aderencia) : null,
      dados.refeitaDe,
    ],
  });
  // Os anexos entram em paralelo: três arquivos são três gravações ao mesmo
  // tempo, e não uma fila.
  await Promise.all(dados.anexos.map(a => db.execute({
    sql: `INSERT INTO analise_vaga_anexos (analise_id, nome, tipo, tamanho, base64)
          VALUES (?,?,?,?,?)`,
    args: [id, a.nome, a.tipo, Math.round(a.base64.length * 0.75), a.base64],
  })));
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = getDb();
  const token = String(req.headers['x-admin-session'] ?? '');
  const sessao = await getAdminSession(db, token).catch(() => null);
  if (!sessao) return res.status(401).json({ error: 'Unauthorized' });

  const recusa = await exigirFerramenta(db, sessao.usuario, 'talentos:analisar');
  if (recusa) return res.status(recusa.status).json(recusa.body);

  // Refazer uma análise do histórico: a entrada vem de lá, e não do corpo. É o
  // que faz "refazer" ser a mesma pergunta contra a base de hoje, e não uma
  // pergunta parecida que alguém redigitou.
  const baseId = String(req.body?.base_id ?? '').trim();
  let texto = String(req.body?.texto ?? '').trim().slice(0, 20000);
  let anexos: { nome: string; tipo: string; base64: string }[] = [];
  if (baseId) {
    const anterior = await carregarEntrada(db, baseId);
    if (!anterior) return res.status(404).json({ error: 'Análise não encontrada no histórico.' });
    texto = anterior.texto;
    anexos = anterior.anexos;
  } else {
    const conferida = conferirAnexos(req.body?.anexos);
    if (!conferida.ok) return res.status(400).json({ error: conferida.error });
    anexos = conferida.anexos;
  }
  if (!texto && anexos.length === 0) {
    return res.status(400).json({ error: 'Descreva a vaga ou anexe o documento dela.' });
  }

  // Fica registrado quem pediu: a análise lê a base inteira de pessoas e gasta
  // na conta da casa.
  await registrarAuditoria(db, sessao.usuario, 'analisar_vaga', texto.slice(0, 80));

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    // `no-transform` e o `X-Accel-Buffering` são o que impede um proxy pelo
    // caminho de juntar tudo e entregar no fim - que devolveria a espera muda
    // que este endpoint existe para acabar.
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const mandar = (dado: unknown) => { res.write(`data: ${JSON.stringify(dado)}\n\n`); };

  try {
    const r = await analisarVaga(db, { texto, anexos }, (e: EventoDaAnalise) => mandar(e));
    if (r.status !== 200) {
      mandar({ tipo: 'erro', error: r.body?.error ?? 'Não foi possível analisar.' });
    } else {
      // Grava antes de avisar: a tela recebe o relatório já com o id dele no
      // histórico, e não uma linha que ainda vai existir.
      const id = await guardar(db, {
        texto,
        anexos,
        relatorio: r.body,
        autorId: sessao.usuario?.id ?? null,
        autorNome: sessao.usuario?.nome ?? null,
        refeitaDe: baseId || null,
      });
      mandar({ tipo: 'pronto', analise: { ...r.body, id } });
    }
  } catch (e: any) {
    mandar({ tipo: 'erro', error: e?.message || 'Não foi possível analisar.' });
  }
  res.end();
}
