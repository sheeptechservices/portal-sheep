// ─────────────────────────────────────────────────────────────────────────────
//  O painel de chamados do cliente.
//
//  Um endereço por projeto (`/chamados/<token>`), sem login: quem tem o link
//  abre chamados naquele projeto, acompanha os que já abriu e reabre o que foi
//  encerrado. Mora como módulo, e não como rota própria, porque o projeto já
//  está no teto de funções do plano; quem atende é `projeto-publico.ts`, que
//  repassa para cá quando a pergunta é `modo=chamados`.
//
//  As regras, que não afrouxam:
//
//  1. Nunca `SELECT *`, e cada campo que sai está escrito abaixo.
//  2. Token errado, desligado ou de projeto removido: 404, igual para todos.
//  3. O cliente vê só o que ELE escreveu. O chamado guarda uma cópia própria do
//     título, da descrição, de quem pediu, da urgência, dos links e dos anexos
//     (`chamados_cliente`), cada reabertura guarda a dela
//     (`chamado_cliente_eventos`) e cada correção também
//     (`chamado_cliente_ajustes`). Da tarefa do time desce só a etapa atual e
//     o prazo (a previsão de entrega, só o dia) -
//     nem as trocas de etapa, nem quem mexeu, comentário, etiqueta ou descrição
//     interna.
//  4. Abrir cria a tarefa na etapa de entrada (a Triagem), com o gestor do
//     projeto como responsável; reabrir devolve a tarefa à Triagem. Os dois
//     avisam o gestor por e-mail na hora.
//  5. Nenhum id interno sai daqui. O número do chamado é a contagem DENTRO do
//     projeto (#1, #2...), a reabertura é a contagem dentro do chamado, e o
//     anexo se pede pela posição dele no chamado. As sequências da casa inteira
//     diriam ao cliente quanto trabalho os outros clientes têm.
//  6. Todo filtro sai do projeto do token, e nunca do que o navegador manda: o
//     corpo do POST e a query não escolhem projeto, chamado de outro projeto
//     nem arquivo de outro chamado.
//  7. Link só `http` ou `https`. Um `javascript:` guardado aqui viraria código
//     rodando na mão de quem clicasse.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type Client } from '@libsql/client';
import { citacaoEmail, enderecoDoPortal, fichaEmail, notaEmail, botaoEmail, notifyEmail } from './_email.js';
import { emailAdmin } from './_papeis.js';

// ── Limites ─────────────────────────────────────────────────────────────────
//  Na memória da instância, como na página pública: o que se protege aqui é o
//  banco de uma enxurrada, e gravar uma linha por requisição para contar
//  requisições seria pagar o custo que se quer evitar.
const JANELA_MS = 60_000;
const TETO = 60;
const JANELA_ENVIO_MS = 10 * 60_000;
const TETO_ENVIO = 8;
const leituras = new Map<string, number[]>();
const envios = new Map<string, number[]>();

function passou(mapa: Map<string, number[]>, ip: string, janela: number, teto: number): boolean {
  const agora = Date.now();
  const desde = agora - janela;
  const recentes = (mapa.get(ip) ?? []).filter(t => t > desde);
  recentes.push(agora);
  mapa.set(ip, recentes);
  if (mapa.size > 5_000) {
    for (const [chave, quando] of mapa) if (!quando.some(t => t > desde)) mapa.delete(chave);
  }
  return recentes.length > teto;
}

function ipDe(req: VercelRequest): string {
  return String(
    (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket?.remoteAddress
    ?? '0.0.0.0'
  );
}

/** A escala de urgência da casa, a mesma das tarefas. */
const URGENCIAS = ['Urgente', 'Alta', 'Média', 'Baixa'];

// ── Ajustes ─────────────────────────────────────────────────────────────────
//  O cliente corrige um chamado que ainda está com o time - o título, a
//  descrição, quem pediu, a urgência - sem reescrever o que mandou: cada
//  correção é uma linha nova, só com os campos que mudaram (os outros ficam
//  nulos), e o original continua como foi enviado. O painel mostra a versão
//  em vigor na linha e as correções dentro do chamado.
//  A tabela nasce aqui e também no esquema do portal: o painel pode ser a
//  primeira coisa a rodar depois de um deploy, e a ficha da tarefa lê a mesma
//  tabela por dentro.
//  Mora junto o tipo do chamado (bug ou melhoria), que entrou na mesma época:
//  a coluna nova em `chamados_cliente` tem de existir antes do primeiro
//  chamado gravado com ela, e o painel pode rodar antes do esquema do portal.
export const DDL_AJUSTES_DO_CHAMADO = [
  `CREATE TABLE IF NOT EXISTS chamado_cliente_ajustes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    chamado_id  INTEGER NOT NULL,
    seq         INTEGER NOT NULL,
    titulo      TEXT,
    descricao   TEXT,
    solicitante TEXT,
    urgencia    TEXT,
    tipo        TEXT,
    autor       TEXT NOT NULL,
    criado_em   TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_chamado_cliente_ajustes ON chamado_cliente_ajustes (chamado_id, seq)`,
  // Acréscimos de coluna: falham quando a coluna já existe, e isso é o normal.
  `ALTER TABLE chamado_cliente_ajustes ADD COLUMN tipo TEXT`,
  `ALTER TABLE chamados_cliente ADD COLUMN tipo TEXT`,
];
let ajustesProntos: Promise<void> | null = null;
/** Uma vez por instância: depois disso as tabelas já estão no ponto. Cada
 *  instrução vale sozinha - o acréscimo de coluna que já existe falha, e não
 *  pode impedir o resto. Falhou a criação, tenta de novo na próxima chamada. */
function garantirAjustes(db: Client): Promise<void> {
  ajustesProntos ??= (async () => {
    for (const sql of DDL_AJUSTES_DO_CHAMADO) {
      try { await db.execute(sql); } catch (e) { if (!/^ALTER/.test(sql)) throw e; }
    }
  })().catch(e => { ajustesProntos = null; throw e; });
  return ajustesProntos;
}

/** O que o chamado é: o mesmo par da fila de chamados de dentro. */
const TIPOS = ['bug', 'melhoria'];
const NOME_DO_TIPO: Record<string, string> = { bug: 'Bug', melhoria: 'Melhoria' };

type CampoAjustavel = 'titulo' | 'descricao' | 'solicitante' | 'urgencia' | 'tipo';
const CAMPOS_AJUSTAVEIS: CampoAjustavel[] = ['titulo', 'descricao', 'solicitante', 'urgencia', 'tipo'];

/** Anexos: imagem ou PDF, até cinco por envio. O teto que vale de verdade é o
 *  do corpo da requisição na Vercel (4,5 MB), e por isso a soma tem teto. */
const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_ANEXOS = 5;
const LIMITE_SOMA = 4 * 1024 * 1024;
/** Links: até cinco por envio, cada um com teto de tamanho. */
const MAX_LINKS = 5;
const LIMITE_LINK = 500;

/** O grupo do status, para os números do painel. Sai das marcações das
 *  etapas, e não do nome: a casa renomeia etapa, e a conta não pode mudar por
 *  isso. Encerrado sem ser concluído é a etapa que sai da conta e fica DEPOIS da
 *  de conclusão (a Cancelada); a que sai da conta antes dela (o Backlog) ainda
 *  é trabalho na fila. */
type Grupo = 'triagem' | 'andamento' | 'concluido' | 'cancelado';

interface Etapa { nome: string; cor: string; ordem: number; entrada: boolean; conclusao: boolean; fora: boolean }

async function lerEtapas(db: Client): Promise<Etapa[]> {
  const r = await db.execute(`SELECT nome, cor, ordem, is_entrada, is_conclusao, is_excluded
                              FROM tarefa_status_configs WHERE ativo = 1 ORDER BY ordem, id`);
  return r.rows.map(e => ({
    nome: String(e.nome),
    cor: String(e.cor ?? '#6E6F69'),
    ordem: Number(e.ordem ?? 0),
    entrada: Number(e.is_entrada) === 1,
    conclusao: Number(e.is_conclusao) === 1,
    fora: Number(e.is_excluded) === 1,
  }));
}

function grupoDa(etapa: Etapa | undefined, etapas: Etapa[]): Grupo {
  if (!etapa) return 'andamento';
  if (etapa.entrada) return 'triagem';
  if (etapa.conclusao) return 'concluido';
  const conclusao = etapas.find(e => e.conclusao);
  if (etapa.fora && conclusao && etapa.ordem > conclusao.ordem) return 'cancelado';
  return 'andamento';
}

/** A tarefa do chamado, só enquanto ela continua sendo deste projeto (o
 *  principal ou um dos da lista). Levada para outro projeto, ela deixa de
 *  falar pelo painel. */
const TAREFA_DO_PROJETO = `t.id = ch.tarefa_id
  AND (t.projeto_id = ch.projeto_id
       OR EXISTS (SELECT 1 FROM json_each(COALESCE(t.projetos, '[]')) jp WHERE jp.value = ch.projeto_id))`;

const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** A lista de links em JSON guardada no banco. Formato inválido vira lista
 *  vazia em vez de derrubar a página. */
function linksDe(v: unknown): string[] {
  try {
    const l = JSON.parse(String(v ?? '[]'));
    return Array.isArray(l) ? l.map(String).filter(u => /^https?:\/\//i.test(u)) : [];
  } catch { return []; }
}

interface Arquivo { nome: string; tipo: string; base64: string; tamanho: number }

/** Os anexos do corpo, conferidos um a um. Devolve a lista ou o motivo da
 *  recusa. */
function lerAnexos(corpo: Record<string, unknown>): Arquivo[] | string {
  const crus = Array.isArray(corpo.anexos) ? corpo.anexos : [];
  if (crus.length > MAX_ANEXOS) return `São no máximo ${MAX_ANEXOS} anexos.`;
  const arquivos: Arquivo[] = [];
  let soma = 0;
  for (const cru of crus) {
    const item = cru as { nome?: string; tipo?: string; base64?: string };
    if (!item?.base64) continue;
    const nome = texto(item.nome ?? 'anexo', 100);
    const tipo = String(item.tipo ?? '');
    if (!TIPOS_DE_ANEXO.includes(tipo)) return `"${nome}" precisa ser uma imagem ou um PDF.`;
    const dados = String(item.base64).split(',').pop() ?? '';
    const tamanho = Math.round(dados.length * 0.75);
    soma += tamanho;
    if (soma > LIMITE_SOMA) return 'Os anexos juntos passam de 4 MB.';
    if (dados) arquivos.push({ nome, tipo, base64: dados, tamanho });
  }
  return arquivos;
}

/** Os links do corpo: só endereço web inteiro, sem repetição. */
function lerLinks(corpo: Record<string, unknown>): string[] | string {
  const crus = Array.isArray(corpo.links) ? corpo.links : [];
  const links: string[] = [];
  for (const cru of crus) {
    const bruto = texto(cru, LIMITE_LINK + 1);
    if (!bruto) continue;
    if (bruto.length > LIMITE_LINK) return 'Um dos links é longo demais.';
    let url: URL;
    try { url = new URL(bruto); } catch { return `"${bruto.slice(0, 60)}" não é um link válido.`; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Os links precisam começar com http:// ou https://.';
    }
    const limpo = url.toString();
    if (!links.includes(limpo)) links.push(limpo);
  }
  if (links.length > MAX_LINKS) return `São no máximo ${MAX_LINKS} links.`;
  return links;
}

/** A etapa de entrada, o gestor do projeto e a próxima posição no quadro: o
 *  que abrir e reabrir precisam saber antes de gravar. */
async function contextoDaTriagem(db: Client, projetoId: string) {
  const [entrada, gestor, posicao] = await Promise.all([
    // A etapa de entrada (a Triagem) e, sem ela marcada, a primeira do quadro:
    // um nome escrito aqui poderia não existir na base e deixar a tarefa fora
    // de todas as colunas.
    db.execute(`SELECT nome FROM tarefa_status_configs WHERE ativo = 1
                ORDER BY is_entrada DESC, ordem, id LIMIT 1`),
    db.execute({
      sql: `SELECT u.id, u.nome, u.email FROM projeto_equipe e
            JOIN usuarios u ON u.id = e.usuario_id
            WHERE e.projeto_id = ? AND u.ativo = 1 AND LOWER(e.papel) = 'gestor'
            ORDER BY u.nome LIMIT 1`,
      args: [projetoId],
    }),
    db.execute({
      sql: 'SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM projeto_tarefas WHERE projeto_id = ?',
      args: [projetoId],
    }),
  ]);
  const g = gestor.rows[0];
  return {
    etapa: entrada.rows[0]?.nome != null ? String(entrada.rows[0].nome) : 'Triagem',
    gestor: g ? { id: String(g.id), nome: String(g.nome), email: g.email != null ? String(g.email) : null } : null,
    posicao: Number(posicao.rows[0]?.proxima ?? 0),
  };
}

/** A tarefa do time para um chamado: na Triagem, com o gestor, etiquetada. */
async function criarTarefa(db: Client, dados: {
  projetoId: string; titulo: string; descricao: string; urgencia: string; autor: string; agora: string;
  ctx: Awaited<ReturnType<typeof contextoDaTriagem>>;
  etiquetas?: string[];
}): Promise<number> {
  const { ctx } = dados;
  const r = await db.execute({
    sql: `INSERT INTO projeto_tarefas
          (projeto_id, entrega_id, titulo, descricao, status, prioridade, responsavel_id,
           responsaveis, prazo, etiquetas, ordem, concluida_em, criado_em,
           criado_por_id, criado_por_nome)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      dados.projetoId, null, dados.titulo, dados.descricao, ctx.etapa,
      // A urgência que o cliente declarou é a prioridade de partida: é a
      // primeira informação da triagem, e o time reclassifica por dentro.
      dados.urgencia,
      ctx.gestor?.id ?? null,
      JSON.stringify(ctx.gestor ? [ctx.gestor.id] : []),
      null,
      JSON.stringify(dados.etiquetas ?? ['Cliente', 'Chamado']),
      ctx.posicao,
      null, dados.agora, null, dados.autor,
    ],
  });
  return Number(r.lastInsertRowid ?? 0);
}

/** Os anexos nos dois lados: na cópia do cliente (o que ele vê para sempre) e
 *  num comentário da tarefa, que é onde o time procura arquivo. Apagar o
 *  comentário por dentro não tira nada do cliente. Gravações em paralelo. */
async function gravarAnexos(db: Client, dados: {
  chamadoId: number; eventoId: number | null; comentarioId: number | null; arquivos: Arquivo[]; agora: string;
}): Promise<{ ordem: number; nome: string; tipo: string; tamanho: number }[]> {
  if (!dados.arquivos.length) return [];
  const ultima = await db.execute({
    sql: 'SELECT COALESCE(MAX(ordem), 0) AS n FROM chamado_cliente_anexos WHERE chamado_id = ?',
    args: [dados.chamadoId],
  });
  const base = Number(ultima.rows[0]?.n ?? 0);
  return Promise.all(dados.arquivos.map(async (a, i) => {
    const ordem = base + i + 1;
    await Promise.all([
      db.execute({
        sql: `INSERT INTO chamado_cliente_anexos (chamado_id, evento_id, ordem, nome, tipo, tamanho, base64, criado_em)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [dados.chamadoId, dados.eventoId, ordem, a.nome, a.tipo, a.tamanho, a.base64, dados.agora],
      }),
      dados.comentarioId ? db.execute({
        sql: `INSERT INTO tarefa_comentario_anexos (comentario_id, nome, tipo, tamanho, base64, criado_em)
              VALUES (?,?,?,?,?,?)`,
        args: [dados.comentarioId, a.nome, a.tipo, a.tamanho, a.base64, dados.agora],
      }) : Promise.resolve(null),
    ]);
    return { ordem, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho };
  }));
}

/** Os links em texto, para o comentário da tarefa e para o e-mail. */
const linksEmTexto = (links: string[]) => links.length ? `\n\nLinks:\n${links.map(l => `- ${l}`).join('\n')}` : '';

export async function atenderChamados(req: VercelRequest, res: VercelResponse) {
  // Nada daqui vai para cache, nem a recusa: a resposta é sobre um projeto, e o
  // navegador não tem por que guardá-la.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const token = String(req.query.token ?? '').trim();
  if (!/^[0-9a-f]{32}$/.test(token)) return res.status(404).json({ error: 'Painel não encontrado.' });
  if (passou(leituras, ipDe(req), JANELA_MS, TETO)) {
    res.setHeader('Retry-After', String(Math.ceil(JANELA_MS / 1000)));
    return res.status(429).json({ error: 'Muitas requisições. Tente de novo em um minuto.' });
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    // As colunas e a tabela novas antes de qualquer leitura que as cite: o
    // painel pode ser o primeiro a rodar depois de um deploy. Uma vez por
    // instância, e uma falha aqui não derruba o painel - a leitura dos ajustes
    // tem a própria rede.
    await garantirAjustes(db).catch(() => {});
    const r = await db.execute({
      sql: `SELECT p.id, p.nome, c.nome AS cliente_nome
            FROM projetos p LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.chamados_token = ? AND p.ativo = 1`,
      args: [token],
    });
    const p = r.rows[0];
    if (!p) return res.status(404).json({ error: 'Painel não encontrado.' });
    const projetoId = String(p.id);

    if (req.method === 'POST') {
      if (passou(envios, ipDe(req), JANELA_ENVIO_MS, TETO_ENVIO)) {
        res.setHeader('Retry-After', String(Math.ceil(JANELA_ENVIO_MS / 1000)));
        return res.status(429).json({ error: 'Muitos envios seguidos. Tente de novo em alguns minutos.' });
      }
      if (req.query.acao === 'reabrir') return await reabrirChamado(req, res, db, projetoId, String(p.nome));
      if (req.query.acao === 'ajustar') return await ajustarChamado(req, res, db, projetoId, String(p.nome));
      return await abrirChamado(req, res, db, projetoId, String(p.nome));
    }

    // ── O conteúdo de um anexo, para a prévia ──────────────────────────────
    //  Pedido pelo número do chamado no projeto e pela posição do arquivo nele.
    //  O projeto vem do token, então o par só alcança arquivo deste projeto.
    if (req.query.anexo != null) {
      const numeroDoChamado = Number(req.query.chamado ?? 0);
      const posicao = Number(req.query.anexo ?? 0);
      if (!Number.isInteger(numeroDoChamado) || numeroDoChamado < 1
        || !Number.isInteger(posicao) || posicao < 1) {
        return res.status(404).json({ error: 'Arquivo não encontrado.' });
      }
      const a = await db.execute({
        sql: `SELECT a.nome, a.tipo, a.base64
              FROM chamado_cliente_anexos a
              JOIN chamados_cliente ch ON ch.id = a.chamado_id
              WHERE ch.projeto_id = ? AND ch.numero = ? AND a.ordem = ?`,
        args: [projetoId, numeroDoChamado, posicao],
      });
      if (!a.rows[0]) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      return res.status(200).json({
        nome: String(a.rows[0].nome), tipo: String(a.rows[0].tipo), base64: String(a.rows[0].base64),
      });
    }

    // ── A lista ────────────────────────────────────────────────────────────
    // Os ajustes à parte: sem a tabela (ou com ela falhando) o painel abre do
    // mesmo jeito, só sem as correções - perder a lista inteira por elas seria
    // pior.
    const lendoAjustes = garantirAjustes(db)
      .then(() => db.execute({
        sql: `SELECT aj.chamado_id, aj.seq, aj.titulo, aj.descricao, aj.solicitante, aj.urgencia, aj.tipo,
                     aj.autor, aj.criado_em
              FROM chamado_cliente_ajustes aj
              JOIN chamados_cliente ch ON ch.id = aj.chamado_id
              WHERE ch.projeto_id = ? ORDER BY aj.chamado_id, aj.seq`,
        args: [projetoId],
      }))
      .then(r => r.rows)
      .catch(() => []);
    const [chamados, anexos, eventos, etapas] = await Promise.all([
      db.execute({
        // Da tarefa, só a etapa e o prazo. Título, descrição e etiquetas dela
        // são do time.
        sql: `SELECT ch.id, ch.numero, ch.titulo, ch.descricao, ch.solicitante, ch.urgencia, ch.tipo,
                     ch.links, ch.criado_em, t.status AS etapa, t.prazo
              FROM chamados_cliente ch
              LEFT JOIN projeto_tarefas t ON ${TAREFA_DO_PROJETO}
              WHERE ch.projeto_id = ?
              ORDER BY ch.numero DESC`,
        args: [projetoId],
      }),
      db.execute({
        // Sem o base64: a lista descreve o arquivo, e o conteúdo desce quando
        // alguém abre a prévia.
        sql: `SELECT a.chamado_id, a.ordem, a.nome, a.tipo, a.tamanho, ev.seq AS reabertura
              FROM chamado_cliente_anexos a
              JOIN chamados_cliente ch ON ch.id = a.chamado_id
              LEFT JOIN chamado_cliente_eventos ev ON ev.id = a.evento_id
              WHERE ch.projeto_id = ? ORDER BY a.chamado_id, a.ordem`,
        args: [projetoId],
      }),
      db.execute({
        sql: `SELECT ev.chamado_id, ev.seq, ev.texto, ev.links, ev.autor, ev.criado_em
              FROM chamado_cliente_eventos ev
              JOIN chamados_cliente ch ON ch.id = ev.chamado_id
              WHERE ch.projeto_id = ? ORDER BY ev.chamado_id, ev.seq`,
        args: [projetoId],
      }),
      lerEtapas(db),
    ]);
    const ajustes = await lendoAjustes;

    return res.status(200).json({
      projeto: { nome: String(p.nome), cliente: p.cliente_nome != null ? String(p.cliente_nome) : null },
      // Todas as etapas ativas, na ordem do quadro: a legenda do painel mostra
      // o caminho inteiro, e não só onde os chamados estão hoje. Sai o nome, a
      // cor e o grupo - nada da configuração interna delas.
      etapas: etapas.map(e => ({ nome: e.nome, cor: e.cor, grupo: grupoDa(e, etapas) })),
      chamados: chamados.rows.map(c => {
        const id = Number(c.id);
        // Tarefa apagada ou levada para outro projeto: o chamado continua na
        // lista do cliente, encerrado - sumir com ele seria apagar o que o
        // cliente escreveu. E reabrir continua possível.
        const etapa = c.etapa != null ? etapas.find(e => e.nome === String(c.etapa)) : undefined;
        const status = c.etapa != null ? String(c.etapa) : 'Encerrado';
        const doChamado = anexos.rows.filter(a => Number(a.chamado_id) === id).map(a => ({
          ordem: Number(a.ordem),
          nome: String(a.nome),
          tipo: String(a.tipo),
          tamanho: Number(a.tamanho ?? 0),
          // A reabertura em que o arquivo veio; nulo é o que veio na abertura.
          reabertura: a.reabertura != null ? Number(a.reabertura) : null,
        }));
        // As reaberturas, da mais antiga para a mais nova: o que o cliente
        // escreveu cada vez que pediu o chamado de volta.
        const reaberturas = eventos.rows.filter(e => Number(e.chamado_id) === id).map(e => ({
          seq: Number(e.seq),
          em: String(e.criado_em),
          autor: String(e.autor),
          texto: String(e.texto ?? ''),
          links: linksDe(e.links),
        }));
        return {
          numero: Number(c.numero),
          titulo: String(c.titulo),
          descricao: String(c.descricao),
          solicitante: String(c.solicitante),
          urgencia: String(c.urgencia),
          // Nulo no chamado gravado antes de o tipo existir.
          tipo: c.tipo != null && TIPOS.includes(String(c.tipo)) ? String(c.tipo) : null,
          links: linksDe(c.links),
          criado_em: String(c.criado_em),
          status,
          // O prazo da tarefa, que o cliente vê como previsão de entrega. Só
          // o dia: a hora, se houver, não sai. Sem prazo, ou sem tarefa, nulo.
          previsao: /^\d{4}-\d{2}-\d{2}/.test(String(c.prazo ?? '')) ? String(c.prazo).slice(0, 10) : null,
          cor: etapa?.cor ?? '#8D939B',
          grupo: c.etapa == null ? 'cancelado' : grupoDa(etapa, etapas),
          anexos: doChamado,
          reaberturas,
          // As correções, da mais antiga para a mais nova, cada uma só com o
          // que mudou nela. Título, descrição, quem pediu e urgência acima
          // continuam os do envio original; a versão em vigor sai da soma.
          ajustes: ajustes.filter(a => Number(a.chamado_id) === id).map(a => {
            const mudou: Partial<Record<CampoAjustavel, string>> = {};
            for (const k of CAMPOS_AJUSTAVEIS) if (a[k] != null && a[k] !== '') mudou[k] = String(a[k]);
            return { seq: Number(a.seq), em: String(a.criado_em), autor: String(a.autor), mudou };
          }),
        };
      }),
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar o painel.' });
  }
}

/** Grava o chamado: a cópia do cliente, a tarefa do time na Triagem, os anexos
 *  nos dois lados, e o aviso ao gestor. */
async function abrirChamado(req: VercelRequest, res: VercelResponse, db: Client, projetoId: string,
  projetoNome: string) {
  const corpo = (req.body ?? {}) as Record<string, unknown>;

  const titulo = texto(corpo.titulo, 140);
  if (titulo.length < 3) return res.status(400).json({ error: 'Dê um título ao chamado.' });
  const descricao = texto(corpo.descricao, 6000);
  if (descricao.length < 5) return res.status(400).json({ error: 'Descreva o que está acontecendo.' });
  const solicitante = texto(corpo.solicitante, 80);
  if (solicitante.length < 2) return res.status(400).json({ error: 'Diga quem está pedindo.' });
  // O formulário obriga a escolher; aqui o vazio passa, porque uma aba aberta
  // antes do tipo existir ainda manda o chamado sem ele.
  const tipo = texto(corpo.tipo, 20);
  if (tipo && !TIPOS.includes(tipo)) return res.status(400).json({ error: 'Escolha se é um bug ou uma melhoria.' });
  // O e-mail saiu do formulário; continua aceito para a aba aberta antes disso.
  const email = texto(corpo.email, 120);
  if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
    return res.status(400).json({ error: 'Confira o e-mail.' });
  }
  const urgencia = texto(corpo.urgencia, 20);
  if (!URGENCIAS.includes(urgencia)) return res.status(400).json({ error: 'Escolha a urgência.' });
  const arquivos = lerAnexos(corpo);
  if (typeof arquivos === 'string') return res.status(400).json({ error: arquivos });
  const links = lerLinks(corpo);
  if (typeof links === 'string') return res.status(400).json({ error: links });

  const agora = new Date().toISOString();
  const ctx = await contextoDaTriagem(db, projetoId);
  const autor = `${solicitante} (cliente)`;

  // O chamado nasce primeiro, com o número dele no projeto calculado na mesma
  // instrução que grava: o SQLite escreve uma de cada vez, então dois chamados
  // ao mesmo tempo não pegam o mesmo número.
  const chamado = await db.execute({
    sql: `INSERT INTO chamados_cliente (projeto_id, numero, titulo, descricao, solicitante, email,
                                        urgencia, tipo, links, criado_em)
          SELECT ?, COALESCE(MAX(numero), 0) + 1, ?, ?, ?, ?, ?, ?, ?, ?
          FROM chamados_cliente WHERE projeto_id = ?
          RETURNING id, numero`,
    args: [projetoId, titulo, descricao, solicitante, email || null, urgencia, tipo || null,
      JSON.stringify(links), agora, projetoId],
  });
  const nomeDoTipo = tipo ? NOME_DO_TIPO[tipo] : null;
  const chamadoId = Number(chamado.rows[0]?.id ?? 0);
  const numeroNoProjeto = Number(chamado.rows[0]?.numero ?? 0);

  let tarefaId = 0;
  try {
    tarefaId = await criarTarefa(db, {
      projetoId, titulo, urgencia, autor, agora, ctx,
      // O número do chamado vai na tarefa: é por ele que o cliente pergunta.
      descricao: `${descricao}${linksEmTexto(links)}\n\n---\nChamado nº ${numeroNoProjeto} do painel, `
        + `aberto por ${solicitante}${email ? ` (${email})` : ''}${nomeDoTipo ? `. Tipo: ${nomeDoTipo}` : ''}.`,
      // O tipo vira etiqueta: é como o time separa, no quadro, o que quebrou
      // do que falta.
      etiquetas: ['Cliente', 'Chamado', ...(nomeDoTipo ? [nomeDoTipo] : [])],
    });
    await db.execute({ sql: 'UPDATE chamados_cliente SET tarefa_id = ? WHERE id = ?', args: [tarefaId, chamadoId] });
  } catch {
    // Sem a tarefa o chamado não chegaria a ninguém: desfaz e recusa, em vez
    // de deixar na lista do cliente um pedido que o time nunca vai ver.
    await db.execute({ sql: 'DELETE FROM chamados_cliente WHERE id = ?', args: [chamadoId] }).catch(() => {});
    return res.status(500).json({ error: 'Não foi possível abrir o chamado. Tente de novo.' });
  }

  let comentarioId: number | null = null;
  if (arquivos.length) {
    const comentario = await db.execute({
      sql: `INSERT INTO tarefa_comentarios (tarefa_id, pai_id, usuario_id, usuario_nome, texto, criado_em)
            VALUES (?,?,?,?,?,?)`,
      args: [tarefaId, null, null, autor,
        arquivos.length === 1 ? 'Anexo enviado junto do chamado.' : 'Anexos enviados junto do chamado.', agora],
    });
    comentarioId = Number(comentario.lastInsertRowid ?? 0);
  }
  const anexosDoCliente = await gravarAnexos(db, { chamadoId, eventoId: null, comentarioId, arquivos, agora });

  await avisarGestor(db, {
    ctx, projetoNome, assunto: `Chamado em ${projetoNome}: ${titulo}`, previa: `${urgencia} | ${titulo}`,
    ficha: [
      ['Projeto', projetoNome],
      ['Quem pediu', email ? `${solicitante} (${email})` : solicitante],
      ...(nomeDoTipo ? [['Tipo', nomeDoTipo] as [string, string]] : []),
      ['Urgência', urgencia],
      ['Chamado', `nº ${numeroNoProjeto} do painel`],
      ['Tarefa', `#${tarefaId} - ${titulo}`],
      ['Etapa', ctx.etapa],
    ],
    citacao: `${descricao}${linksEmTexto(links)}`, anexos: arquivos.length, tarefaId,
  });

  // Devolve só o que a tela não sabe: o número no projeto e o carimbo. Nenhum
  // id interno - nem o da tarefa, que fica com o time.
  return res.status(201).json({
    ok: true, numero: numeroNoProjeto, criado_em: agora, status: ctx.etapa, anexos: anexosDoCliente,
  });
}

/**
 * Reabre um chamado encerrado: a tarefa volta para a Triagem (ou nasce de novo,
 * se foi apagada ou levada para outro projeto), a reabertura fica guardada com
 * o comentário, os links e os anexos dela, e o gestor é avisado.
 *
 * Só vale para chamado concluído ou encerrado: em andamento não há o que
 * reabrir, e reabrir de novo um que já está na fila só embaralharia o
 * histórico.
 */
async function reabrirChamado(req: VercelRequest, res: VercelResponse, db: Client, projetoId: string,
  projetoNome: string) {
  const numero = Number(req.query.chamado ?? 0);
  if (!Number.isInteger(numero) || numero < 1) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const corpo = (req.body ?? {}) as Record<string, unknown>;

  const comentario = texto(corpo.texto, 6000);
  if (comentario.length < 5) return res.status(400).json({ error: 'Conte por que o chamado precisa voltar.' });
  const autorNome = texto(corpo.autor, 80);
  if (autorNome.length < 2) return res.status(400).json({ error: 'Diga quem está reabrindo.' });
  const arquivos = lerAnexos(corpo);
  if (typeof arquivos === 'string') return res.status(400).json({ error: arquivos });
  const links = lerLinks(corpo);
  if (typeof links === 'string') return res.status(400).json({ error: links });

  // O chamado deste projeto, e a tarefa dele só se ainda for deste projeto.
  const achado = await db.execute({
    sql: `SELECT ch.id, ch.titulo, ch.descricao, ch.urgencia, t.id AS tarefa_id, t.status AS etapa
          FROM chamados_cliente ch
          LEFT JOIN projeto_tarefas t ON ${TAREFA_DO_PROJETO}
          WHERE ch.projeto_id = ? AND ch.numero = ?`,
    args: [projetoId, numero],
  });
  const ch = achado.rows[0];
  if (!ch) return res.status(404).json({ error: 'Chamado não encontrado.' });

  const etapas = await lerEtapas(db);
  const atual = ch.etapa != null ? etapas.find(e => e.nome === String(ch.etapa)) : undefined;
  const grupo: Grupo = ch.etapa == null ? 'cancelado' : grupoDa(atual, etapas);
  if (grupo !== 'concluido' && grupo !== 'cancelado') {
    return res.status(409).json({ error: 'Este chamado ainda está aberto: o time já está com ele.' });
  }

  const agora = new Date().toISOString();
  const ctx = await contextoDaTriagem(db, projetoId);
  const autor = `${autorNome} (cliente)`;
  const chamadoId = Number(ch.id);
  const textoDaTarefa = `Chamado nº ${numero} reaberto por ${autorNome}:\n\n${comentario}${linksEmTexto(links)}`;

  // A tarefa: volta para a Triagem, ou nasce de novo se sumiu do projeto.
  let tarefaId = ch.tarefa_id != null ? Number(ch.tarefa_id) : 0;
  if (tarefaId) {
    await db.batch([
      // A tarefa volta para a Triagem com a etiqueta "Reaberto": é o que diz,
      // no card, que aquilo já foi entregue uma vez e voltou.
      {
        sql: `UPDATE projeto_tarefas SET status = ?, concluida_em = NULL,
                     etiquetas = CASE
                       WHEN EXISTS (SELECT 1 FROM json_each(COALESCE(etiquetas, '[]')) WHERE value = 'Reaberto')
                         THEN etiquetas
                       ELSE json_insert(COALESCE(etiquetas, '[]'), '$[#]', 'Reaberto')
                     END
              WHERE id = ?`,
        args: [ctx.etapa, tarefaId],
      },
      // O diário da tarefa conta a volta, como contaria se alguém de dentro a
      // tivesse movido: quem olha o histórico do card sabe de onde ela veio.
      {
        sql: `INSERT INTO tarefa_eventos (tarefa_id, usuario_id, usuario_nome, acao, campo, de, para, criado_em)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [tarefaId, null, autor, 'alterou', 'status', String(ch.etapa), ctx.etapa, agora],
      },
      ...(atual?.conclusao ? [{
        sql: `INSERT INTO tarefa_eventos (tarefa_id, usuario_id, usuario_nome, acao, campo, de, para, criado_em)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [tarefaId, null, autor, 'reabriu', null, null, null, agora],
      }] : []),
    ], 'write');
  } else {
    tarefaId = await criarTarefa(db, {
      projetoId, titulo: String(ch.titulo), urgencia: String(ch.urgencia), autor, agora, ctx,
      descricao: `${String(ch.descricao)}\n\n---\n${textoDaTarefa}`,
      etiquetas: ['Cliente', 'Chamado', 'Reaberto'],
    });
    await db.execute({ sql: 'UPDATE chamados_cliente SET tarefa_id = ? WHERE id = ?', args: [tarefaId, chamadoId] });
  }

  // A reabertura do lado do cliente, com o número dela no chamado calculado na
  // mesma instrução que grava.
  const evento = await db.execute({
    sql: `INSERT INTO chamado_cliente_eventos (chamado_id, seq, tipo, texto, links, autor, criado_em)
          SELECT ?, COALESCE(MAX(seq), 0) + 1, 'reaberto', ?, ?, ?, ?
          FROM chamado_cliente_eventos WHERE chamado_id = ?
          RETURNING id, seq`,
    args: [chamadoId, comentario, JSON.stringify(links), autorNome, agora, chamadoId],
  });
  const eventoId = Number(evento.rows[0]?.id ?? 0);
  const seq = Number(evento.rows[0]?.seq ?? 1);

  // O motivo entra na conversa da tarefa, que é onde o time lê o porquê.
  const nota = await db.execute({
    sql: `INSERT INTO tarefa_comentarios (tarefa_id, pai_id, usuario_id, usuario_nome, texto, criado_em)
          VALUES (?,?,?,?,?,?)`,
    args: [tarefaId, null, null, autor, textoDaTarefa, agora],
  });
  const comentarioId = Number(nota.lastInsertRowid ?? 0);
  const anexosDoCliente = await gravarAnexos(db, { chamadoId, eventoId, comentarioId, arquivos, agora });

  await avisarGestor(db, {
    ctx, projetoNome,
    assunto: `Chamado reaberto em ${projetoNome}: ${String(ch.titulo)}`,
    previa: `Reaberto por ${autorNome}`,
    ficha: [
      ['Projeto', projetoNome],
      ['Quem reabriu', autorNome],
      ['Chamado', `nº ${numero} do painel`],
      ['Tarefa', `#${tarefaId} - ${String(ch.titulo)}`],
      ['Voltou para', ctx.etapa],
    ],
    citacao: `${comentario}${linksEmTexto(links)}`, anexos: arquivos.length, tarefaId,
  });

  return res.status(200).json({
    ok: true, status: ctx.etapa, reabertura: seq, em: agora, anexos: anexosDoCliente,
  });
}

/**
 * Corrige um chamado que ainda está com o time: título, descrição, quem pediu
 * e urgência. Nada do envio original é reescrito - a correção é guardada à
 * parte, só com o que mudou -, e a tarefa do time ganha um comentário com as
 * novas informações. Os campos da tarefa não mudam: título e prioridade dela
 * são do time, que pode já ter reclassificado.
 *
 * Só vale enquanto o chamado está aberto: encerrado, o caminho é reabrir.
 */
async function ajustarChamado(req: VercelRequest, res: VercelResponse, db: Client, projetoId: string,
  projetoNome: string) {
  const numero = Number(req.query.chamado ?? 0);
  if (!Number.isInteger(numero) || numero < 1) return res.status(404).json({ error: 'Chamado não encontrado.' });
  const corpo = (req.body ?? {}) as Record<string, unknown>;

  const pedido: Record<CampoAjustavel, string> = {
    titulo: texto(corpo.titulo, 140),
    descricao: texto(corpo.descricao, 6000),
    solicitante: texto(corpo.solicitante, 80),
    urgencia: texto(corpo.urgencia, 20),
    tipo: texto(corpo.tipo, 20),
  };
  if (pedido.tipo && !TIPOS.includes(pedido.tipo)) {
    return res.status(400).json({ error: 'Escolha se é um bug ou uma melhoria.' });
  }
  if (pedido.titulo.length < 3) return res.status(400).json({ error: 'Dê um título ao chamado.' });
  if (pedido.descricao.length < 5) return res.status(400).json({ error: 'Descreva o que está acontecendo.' });
  if (pedido.solicitante.length < 2) return res.status(400).json({ error: 'Diga quem está pedindo.' });
  if (!URGENCIAS.includes(pedido.urgencia)) return res.status(400).json({ error: 'Escolha a urgência.' });
  const autorNome = texto(corpo.autor, 80);
  if (autorNome.length < 2) return res.status(400).json({ error: 'Diga quem está editando.' });

  // O chamado deste projeto, e a tarefa dele só se ainda for deste projeto.
  const achado = await db.execute({
    sql: `SELECT ch.id, ch.titulo, ch.descricao, ch.solicitante, ch.urgencia, ch.tipo,
                 t.id AS tarefa_id, t.status AS etapa
          FROM chamados_cliente ch
          LEFT JOIN projeto_tarefas t ON ${TAREFA_DO_PROJETO}
          WHERE ch.projeto_id = ? AND ch.numero = ?`,
    args: [projetoId, numero],
  });
  const ch = achado.rows[0];
  if (!ch) return res.status(404).json({ error: 'Chamado não encontrado.' });

  const etapas = await lerEtapas(db);
  const atual = ch.etapa != null ? etapas.find(e => e.nome === String(ch.etapa)) : undefined;
  const grupo: Grupo = ch.etapa == null ? 'cancelado' : grupoDa(atual, etapas);
  if (grupo !== 'triagem' && grupo !== 'andamento') {
    return res.status(409).json({ error: 'Este chamado já foi encerrado. Para pedir algo nele de novo, reabra.' });
  }

  // A versão em vigor: o envio original com as correções por cima, em ordem.
  await garantirAjustes(db);
  const chamadoId = Number(ch.id);
  const anteriores = await db.execute({
    sql: `SELECT titulo, descricao, solicitante, urgencia, tipo FROM chamado_cliente_ajustes
          WHERE chamado_id = ? ORDER BY seq`,
    args: [chamadoId],
  });
  const vigente = {} as Record<CampoAjustavel, string>;
  for (const k of CAMPOS_AJUSTAVEIS) vigente[k] = String(ch[k] ?? '');
  for (const a of anteriores.rows) {
    for (const k of CAMPOS_AJUSTAVEIS) if (a[k] != null && a[k] !== '') vigente[k] = String(a[k]);
  }

  // Tipo em branco não é pedido de mudança: é o chamado antigo, gravado antes
  // de o tipo existir, que segue sem um.
  const mudou = CAMPOS_AJUSTAVEIS.filter(k => pedido[k] !== vigente[k] && !(k === 'tipo' && !pedido.tipo));
  if (mudou.length === 0) return res.status(400).json({ error: 'Nada mudou em relação ao que está no chamado.' });

  const agora = new Date().toISOString();
  const ajuste = await db.execute({
    sql: `INSERT INTO chamado_cliente_ajustes (chamado_id, seq, titulo, descricao, solicitante, urgencia, tipo,
                                             autor, criado_em)
          SELECT ?, COALESCE(MAX(seq), 0) + 1, ?, ?, ?, ?, ?, ?, ?
          FROM chamado_cliente_ajustes WHERE chamado_id = ?
          RETURNING seq`,
    args: [chamadoId,
      ...CAMPOS_AJUSTAVEIS.map(k => (mudou.includes(k) ? pedido[k] : null)),
      autorNome, agora, chamadoId],
  });
  const seq = Number(ajuste.rows[0]?.seq ?? 1);

  // O que mudou, em linhas curtas: de onde para onde nos campos curtos, e a
  // descrição nova inteira, porque a antiga já está na tarefa.
  const NOME: Record<CampoAjustavel, string> = {
    titulo: 'Título', descricao: 'Descrição', solicitante: 'Quem pede', urgencia: 'Urgência', tipo: 'Tipo',
  };
  // O tipo sai pelo nome (Bug, Melhoria), e não pelo valor guardado.
  const legivel = (k: CampoAjustavel, v: string) => (k === 'tipo' ? (NOME_DO_TIPO[v] ?? 'sem tipo') : v);
  const linhas = mudou.filter(k => k !== 'descricao')
    .map(k => `- **${NOME[k]}:** ${legivel(k, vigente[k])} → ${legivel(k, pedido[k])}`);
  const textoDaTarefa = `Chamado nº ${numero} ajustado pelo cliente (${autorNome}):`
    + (linhas.length ? `\n\n${linhas.join('\n')}` : '')
    + (mudou.includes('descricao') ? `\n\n**Descrição corrigida:**\n${pedido.descricao}` : '');

  const tarefaId = ch.tarefa_id != null ? Number(ch.tarefa_id) : 0;
  if (tarefaId) {
    await db.execute({
      sql: `INSERT INTO tarefa_comentarios (tarefa_id, pai_id, usuario_id, usuario_nome, texto, criado_em)
            VALUES (?,?,?,?,?,?)`,
      args: [tarefaId, null, null, `${autorNome} (cliente)`, textoDaTarefa, agora],
    });
    const ctx = await contextoDaTriagem(db, projetoId);
    await avisarGestor(db, {
      ctx, projetoNome,
      assunto: `Chamado ajustado em ${projetoNome}: ${pedido.titulo}`,
      previa: `Ajustado por ${autorNome}`,
      ficha: [
        ['Projeto', projetoNome],
        ['Quem ajustou', autorNome],
        ['Chamado', `nº ${numero} do painel`],
        ['O que mudou', mudou.map(k => NOME[k]).join(', ')],
        ['Tarefa', `#${tarefaId}`],
      ],
      citacao: textoDaTarefa, anexos: 0, tarefaId,
    });
  }

  return res.status(200).json({ ok: true, ajuste: seq, em: agora });
}

/** O e-mail ao gestor do projeto, ou a quem cuida do portal se não houver
 *  gestor. Vai depois da gravação, e o resultado dele não muda a resposta: o
 *  chamado já está no quadro. */
async function avisarGestor(db: Client, d: {
  ctx: Awaited<ReturnType<typeof contextoDaTriagem>>;
  projetoNome: string; assunto: string; previa: string; ficha: [string, string][];
  citacao: string; anexos: number; tarefaId: number;
}) {
  const paraQuem = d.ctx.gestor?.email ?? emailAdmin();
  if (!paraQuem) return;
  await notifyEmail(
    db, paraQuem, d.assunto,
    fichaEmail(d.ficha)
    + citacaoEmail(d.citacao)
    + (d.anexos ? notaEmail(d.anexos === 1
      ? 'Um anexo veio junto, e está nos comentários da tarefa.'
      : `${d.anexos} anexos vieram juntos, e estão nos comentários da tarefa.`) : '')
    + botaoEmail('Abrir a tarefa', `${enderecoDoPortal()}/?tarefa=${d.tarefaId}`),
    'chamado-cliente',
    {
      previa: d.previa,
      rodape: d.ctx.gestor?.email
        ? 'Você recebe este aviso porque é o gestor deste projeto.'
        : 'Você recebe este aviso porque é quem cuida do portal.',
    },
  ).catch(() => { /* o aviso é apoio: o chamado já está gravado */ });
}
