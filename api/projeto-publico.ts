// ─────────────────────────────────────────────────────────────────────────────
//  Página pública do projeto.
//
//  A única rota do sistema que responde sem sessão. Ela existe para o cliente
//  acompanhar o andamento do que contratou, e nada mais: devolve um punhado de
//  campos escolhidos a dedo de um projeto publicado, e só isso.
//
//  Três regras que não podem afrouxar:
//
//  1. Nunca `SELECT *`. Cada campo que sai daqui está escrito abaixo, um a um.
//     O dia em que uma coluna nova aparecer na tabela, ela não vaza por
//     esquecimento - precisa ser acrescentada aqui de propósito.
//  2. Só projeto publicado e ativo. Sem token, com token errado, despublicado
//     ou removido, a resposta é a mesma: 404, sem dizer qual dos casos é.
//  3. Nada daqui abre porta para o portal interno. Este arquivo não cria
//     sessão, não lê cabeçalho de sessão e não fala com `_admin-handler`.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';

/** Estados de entrega que o cliente vê. O nome é o mesmo de dentro: inventar um
 *  vocabulário só para fora produziria duas verdades sobre a mesma entrega. */
const ORDEM_STATUS = [
  'Planejada', 'Em andamento', 'Bloqueada', 'Entregue', 'Validada', 'Cancelada',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.query.token ?? '').trim();
  // Formato conferido antes de ir ao banco: o token é sempre 32 hexadecimais,
  // e qualquer coisa fora disso é ruído ou tentativa.
  if (!/^[0-9a-f]{32}$/.test(token)) return res.status(404).json({ error: 'Página não encontrada.' });

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const projeto = await db.execute({
      sql: `SELECT p.id, p.nome, p.descricao, p.status, p.previsao_entrega, p.progresso,
                   p.publicado_em, c.nome AS cliente_nome
            FROM projetos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.publico_token = ? AND p.ativo = 1`,
      args: [token],
    });
    const p = projeto.rows[0];
    if (!p) return res.status(404).json({ error: 'Página não encontrada.' });

    const [equipe, entregas, tarefas] = await Promise.all([
      // Nome, papel e foto. O e-mail fica de fora: a página é de
      // acompanhamento, não uma lista de contatos da casa para fora.
      db.execute({
        sql: `SELECT u.nome, u.foto_url, e.papel
              FROM projeto_equipe e JOIN usuarios u ON u.id = e.usuario_id
              WHERE e.projeto_id = ? AND u.ativo = 1
              ORDER BY u.nome`,
        args: [p.id as string],
      }),
      // Sem `responsaveis` e sem `links`: o primeiro é id de gente e o segundo
      // aponta para Drive e repositório, que são de dentro.
      db.execute({
        sql: `SELECT id, titulo, descricao, categoria, status, prazo, ordem
              FROM projeto_entregas WHERE projeto_id = ? ORDER BY ordem, id`,
        args: [p.id as string],
      }),
      // Só a contagem por entrega, para a barra de progresso. Título de tarefa
      // é conversa interna e não sai daqui.
      db.execute({
        sql: `SELECT entrega_id, COUNT(*) AS total,
                     SUM(CASE WHEN concluida_em IS NOT NULL THEN 1 ELSE 0 END) AS feitas
              FROM projeto_tarefas WHERE projeto_id = ? AND entrega_id IS NOT NULL
              GROUP BY entrega_id`,
        args: [p.id as string],
      }),
    ]);

    const contagem = new Map(tarefas.rows.map(t => [
      Number(t.entrega_id),
      { total: Number(t.total ?? 0), feitas: Number(t.feitas ?? 0) },
    ]));

    // Uma hora de cache na borda: a página muda quando alguém mexe no projeto,
    // e não a cada visita. `stale-while-revalidate` deixa a visita seguinte
    // instantânea enquanto a versão nova é buscada por trás.
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    // A página não é para buscador: link encaminhado adiante não deveria virar
    // resultado de pesquisa.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    return res.status(200).json({
      projeto: {
        nome: p.nome,
        descricao: p.descricao,
        status: p.status,
        previsao_entrega: p.previsao_entrega,
        progresso: Number(p.progresso ?? 0),
        publicado_em: p.publicado_em,
        cliente: p.cliente_nome ?? null,
      },
      equipe: equipe.rows.map(e => ({
        nome: String(e.nome),
        papel: String(e.papel ?? ''),
        foto_url: e.foto_url != null ? String(e.foto_url) : null,
      })),
      entregas: entregas.rows.map(e => {
        const c = contagem.get(Number(e.id)) ?? { total: 0, feitas: 0 };
        return {
          id: Number(e.id),
          titulo: String(e.titulo),
          descricao: e.descricao != null ? String(e.descricao) : null,
          categoria: e.categoria != null ? String(e.categoria) : null,
          status: String(e.status),
          prazo: e.prazo != null ? String(e.prazo) : null,
          tarefas_total: c.total,
          tarefas_feitas: c.feitas,
        };
      }),
      ordem_status: ORDEM_STATUS,
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a página.' });
  }
}
