// ─────────────────────────────────────────────────────────────────────────────
//  A vitrine de profissionais, do lado de fora.
//
//  A regra mora aqui, e não no handler da rota, pelo mesmo motivo das outras
//  peças do portal: assim ela roda contra um banco qualquer - o de verdade na
//  Vercel, um em memória na bancada - e o que a bancada prova é o que o cliente
//  recebe.
//
//  O anonimato é feito AQUI, e não na tela: a resposta é montada campo a campo,
//  e nome, e-mail, telefone e o id da pessoa não entram nela. Esconder no
//  navegador seria entregar o dado e pedir para não olhar.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';

export interface RespostaDaVitrine {
  status: number;
  body: any;
}

/** O token é a única credencial da página: 32 hexadecimais, e nada além. */
export const tokenDeVitrine = (v: unknown) => /^[0-9a-f]{32}$/.test(String(v ?? ''));

const texto = (v: unknown) => (v == null ? null : String(v));

/** Fechada, vencida e inexistente respondem igual: dizer "existiu e acabou"
 *  conta ao mundo que aquele endereço um dia valeu. */
const NAO_EXISTE = { status: 404, body: { error: 'Esta página não está mais disponível.' } };

export async function responderVitrine(
  db: Client, metodo: string, token: string, corpo: any = {},
): Promise<RespostaDaVitrine> {
  if (!tokenDeVitrine(token)) return NAO_EXISTE;

  const v = (await db.execute({
    sql: `SELECT id, titulo, empresa, recado, expira_em, revogada_em
          FROM vitrines WHERE token = ?`,
    args: [token],
  })).rows[0];
  const hoje = new Date().toISOString().slice(0, 10);
  const viva = v && !v.revogada_em && (!v.expira_em || String(v.expira_em) >= hoje);
  if (!viva) return NAO_EXISTE;
  const vitrineId = Number(v.id);

  if (metodo === 'POST') {
    const perfilId = Number(corpo?.perfil_id);
    if (!Number.isFinite(perfilId)) return { status: 400, body: { error: 'Perfil ausente.' } };
    const doPerfil = (await db.execute({
      sql: 'SELECT id FROM vitrine_perfis WHERE id = ? AND vitrine_id = ?',
      args: [perfilId, vitrineId],
    })).rows[0];
    // O perfil de outra vitrine não vale: com o id na mão, alguém marcaria
    // interesse em quem nunca lhe foi mostrado.
    if (!doPerfil) return { status: 404, body: { error: 'Perfil não encontrado.' } };
    // Quem está pedindo é a empresa a quem esta vitrine foi aberta: ela está no
    // link desde que a casa o mandou. Perguntar de novo, num campo de texto,
    // seria pedir o que já se sabe e aceitar qualquer coisa como resposta.
    await db.execute({
      sql: `INSERT INTO vitrine_interesses (vitrine_id, perfil_id, mensagem, quem, criado_em)
            VALUES (?,?,?,?,?)`,
      args: [vitrineId, perfilId, null, texto(v.empresa), new Date().toISOString()],
    });
    return { status: 200, body: { ok: true } };
  }

  // Cada abertura fica registrada, sem nada de quem abriu: o que o portal
  // precisa saber é que o link foi usado, e quando.
  await db.execute({
    sql: 'INSERT INTO vitrine_acessos (vitrine_id, criado_em) VALUES (?,?)',
    args: [vitrineId, new Date().toISOString()],
  });

  const [perfis, jaPedidos] = await Promise.all([
    db.execute({
      // Campo a campo, e sem `pessoa_id`: o que identifica a pessoa não sai daqui.
      sql: `SELECT id, apelido, resumo, senioridade, tempo_experiencia, modelo_trabalho,
                   contratacao, ingles, competencias, habilidades
            FROM vitrine_perfis WHERE vitrine_id = ? ORDER BY ordem, id`,
      args: [vitrineId],
    }),
    db.execute({
      sql: 'SELECT DISTINCT perfil_id FROM vitrine_interesses WHERE vitrine_id = ?',
      args: [vitrineId],
    }),
  ]);
  const pedidos = new Set(jaPedidos.rows.map(x => Number(x.perfil_id)));

  return {
    status: 200,
    body: {
      titulo: String(v.titulo),
      empresa: texto(v.empresa),
      recado: texto(v.recado),
      perfis: perfis.rows.map(p => ({
        id: Number(p.id),
        apelido: String(p.apelido),
        resumo: String(p.resumo ?? ''),
        senioridade: texto(p.senioridade),
        tempo_experiencia: texto(p.tempo_experiencia),
        modelo_trabalho: texto(p.modelo_trabalho),
        contratacao: texto(p.contratacao),
        ingles: texto(p.ingles),
        competencias: JSON.parse(String(p.competencias ?? '[]')),
        habilidades: JSON.parse(String(p.habilidades ?? '[]')),
        // Já pedido: o botão da tela vira "interesse enviado", em vez de
        // oferecer o mesmo gesto de novo.
        pedido: pedidos.has(Number(p.id)),
      })),
    },
  };
}
