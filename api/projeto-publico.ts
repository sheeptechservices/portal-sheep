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
import { etapasDeTarefa, progressoDaEntrega, statusDeduzido } from './_entregas.js';

/** Estados de entrega que o cliente vê. O nome é o mesmo de dentro: inventar um
 *  vocabulário só para fora produziria duas verdades sobre a mesma entrega. */
const ORDEM_STATUS = [
  'Planejada', 'Em andamento', 'Bloqueada', 'Entregue', 'Validada', 'Cancelada',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = String(req.query.token ?? '').trim();
  // Um mesmo endereço serve a página e entrega o conteúdo da evidência. Duas
  // rotas pediriam duas vezes a mesma conferência de token, e é ela que tranca
  // isto - o id do arquivo sozinho não abre nada.
  const anexo = Number(req.query.anexo ?? 0);
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
                   p.link_portal, p.publicado_em, c.nome AS cliente_nome
            FROM projetos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.publico_token = ? AND p.ativo = 1`,
      args: [token],
    });
    const p = projeto.rows[0];
    if (!p) return res.status(404).json({ error: 'Página não encontrada.' });

    // Conteúdo de uma evidência, para a prévia. Só desce o arquivo que pende de
    // uma entrega deste projeto.
    if (anexo > 0) {
      const r = await db.execute({
        sql: `SELECT ev.nome, ev.tipo, ev.base64
              FROM entrega_evidencias ev
              JOIN projeto_entregas e ON e.id = ev.entrega_id
              WHERE ev.id = ? AND e.projeto_id = ?`,
        args: [anexo, p.id as string],
      });
      if (!r.rows[0]) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      res.setHeader('Cache-Control', 'private, max-age=300');
      return res.status(200).json(r.rows[0]);
    }

    const [equipe, entregas, tarefas, evidencias] = await Promise.all([
      // Nome, papel e foto. O e-mail fica de fora: a página é de
      // acompanhamento, não uma lista de contatos da casa para fora.
      db.execute({
        sql: `SELECT u.nome, u.foto_url, e.papel
              FROM projeto_equipe e JOIN usuarios u ON u.id = e.usuario_id
              WHERE e.projeto_id = ? AND u.ativo = 1
              ORDER BY u.nome`,
        args: [p.id as string],
      }),
      // `responsaveis` entra, mas resolvido em nome e foto mais abaixo - o id
      // em si não sai daqui. `links` continua de fora: aponta para Drive e
      // repositório, que são de dentro.
      db.execute({
        sql: `SELECT id, titulo, descricao, marcador, submarcador, status, prazo, ordem, responsaveis
              FROM projeto_entregas WHERE projeto_id = ? ORDER BY ordem, id`,
        args: [p.id as string],
      }),
      // A etapa e as etiquetas de cada tarefa, e não a contagem pronta: é delas
      // que saem o estado e o percentual da entrega, pela mesma regra do painel
      // de dentro. Título de tarefa continua sendo conversa interna e não sai
      // daqui - nada disto chega ao navegador do cliente, só o resultado.
      db.execute({
        sql: `SELECT entrega_id, status, etiquetas
              FROM projeto_tarefas WHERE projeto_id = ? AND entrega_id IS NOT NULL`,
        args: [p.id as string],
      }),
      // A prova do que foi entregue e do que foi validado. Sem o `base64`: a
      // lista descreve o arquivo, e o conteúdo só desce quando alguém abre a
      // prévia. Uma entrega com cinco imagens não pode custar cinco imagens só
      // por a página ter carregado.
      db.execute({
        sql: `SELECT ev.id, ev.entrega_id, ev.nome, ev.tipo, ev.tamanho, ev.criado_em, ev.etapa
              FROM entrega_evidencias ev
              JOIN projeto_entregas e ON e.id = ev.entrega_id
              WHERE e.projeto_id = ? ORDER BY ev.criado_em`,
        args: [p.id as string],
      }),
    ]);

    /** Os ids de responsável guardados em JSON na entrega. Formato inválido -
     *  de uma gravação antiga, por exemplo - devolve lista vazia em vez de
     *  derrubar a página do cliente. */
    const idsDe = (v: unknown): string[] => {
      try {
        const lista = JSON.parse(String(v ?? '[]'));
        return Array.isArray(lista) ? lista.map(x => String(x)) : [];
      } catch { return []; }
    };

    // Uma consulta só para todos os responsáveis de todas as entregas, e o
    // resultado vira nome e foto. O id fica no servidor.
    const idsResponsaveis = [...new Set(entregas.rows.flatMap(e => idsDe(e.responsaveis)))];
    const pessoas = new Map<string, { nome: string; foto_url: string | null }>();
    if (idsResponsaveis.length > 0) {
      const achados = await db.execute({
        sql: `SELECT id, nome, foto_url FROM usuarios
              WHERE ativo = 1 AND id IN (${idsResponsaveis.map(() => '?').join(',')})`,
        args: idsResponsaveis,
      });
      for (const u of achados.rows) {
        pessoas.set(String(u.id), {
          nome: String(u.nome),
          foto_url: u.foto_url != null ? String(u.foto_url) : null,
        });
      }
    }

    // As etapas configuradas em Configurações > Etapas: quais concluem, quais
    // são desconsideradas e quais etiquetas travam.
    const etapas = await etapasDeTarefa(db);
    const daEntrega = (id: number) => tarefas.rows.filter(t => Number(t.entrega_id) === id);

    // Sem cache na borda. Havia cinco minutos de cache mais uma hora de
    // `stale-while-revalidate`, e o efeito era o oposto do que a página promete:
    // mexer no projeto e o cliente continuar vendo o estado antigo por minutos,
    // porque a visita que dispara a revalidação ainda recebe a cópia velha. É
    // uma página de acompanhamento; o que ela mostra tem de ser o que é agora.
    // O custo é uma leitura por visita, e a visita aqui é rara.
    res.setHeader('Cache-Control', 'no-store');
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
        // O endereço do que foi entregue. Sai daqui de propósito, e é o único
        // link do projeto que sai: `repositorio` e `drive` são de dentro.
        link: p.link_portal != null ? String(p.link_portal) : null,
        publicado_em: p.publicado_em,
        cliente: p.cliente_nome ?? null,
      },
      equipe: equipe.rows.map(e => ({
        nome: String(e.nome),
        papel: String(e.papel ?? ''),
        foto_url: e.foto_url != null ? String(e.foto_url) : null,
      })),
      entregas: entregas.rows.map(e => {
        const suas = daEntrega(Number(e.id));
        // O estado gravado só vale quando é resolução de alguém; nos demais
        // casos quem manda são as tarefas. É exatamente o que o painel faz, e
        // é o que faltava aqui: o cliente via "Planejada" numa entrega que lá
        // dentro já estava em andamento.
        const status = ['Planejada', 'Entregue', 'Validada', 'Cancelada'].includes(String(e.status))
          && String(e.status) !== 'Planejada'
          ? String(e.status)
          : statusDeduzido(suas, etapas);
        return {
          id: Number(e.id),
          titulo: String(e.titulo),
          descricao: e.descricao != null ? String(e.descricao) : null,
          marcador: e.marcador != null ? String(e.marcador) : null,
          submarcador: e.submarcador != null ? String(e.submarcador) : null,
          status,
          prazo: e.prazo != null ? String(e.prazo) : null,
          // `progresso` não é coluna: sai das tarefas, como no painel de dentro.
          // Validada vale 100 mesmo com tarefa em aberto - o aceite do cliente
          // é o que encerra a entrega.
          progresso: status === 'Validada' ? 100 : progressoDaEntrega(suas, etapas),
          evidencias: evidencias.rows
            .filter(v => Number(v.entrega_id) === Number(e.id))
            .map(v => ({
              id: Number(v.id),
              nome: String(v.nome),
              tipo: String(v.tipo),
              tamanho: Number(v.tamanho ?? 0),
              criado_em: String(v.criado_em),
              etapa: String(v.etapa ?? 'Entrega'),
            })),
          responsaveis: idsDe(e.responsaveis)
            .map(id => pessoas.get(id))
            .filter((x): x is { nome: string; foto_url: string | null } => !!x),
          // A contagem que o cliente vê é a mesma da conta do progresso: tarefa
          // em etapa desconsiderada fica de fora das duas.
          tarefas_total: suas.filter(t => !etapas.desconsideradas.has(String(t.status))).length,
          tarefas_feitas: suas.filter(t => etapas.conclusivas.has(String(t.status))).length,
        };
      }),
      ordem_status: ORDEM_STATUS,
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a página.' });
  }
}
