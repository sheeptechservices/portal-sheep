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
//  4. O POST cria UMA tarefa no projeto daquele token - e os anexos dela -, com
//     os campos conferidos um a um logo abaixo. Ele não lê nada de volta: a
//     resposta é "recebido" e o número da tarefa, e nada do que já está no
//     quadro desce por aqui.
//  5. O aviso por e-mail sai por `_email`, que é um módulo de envio e nada mais.
//     A regra 3 continua de pé: quem não pode ser importado daqui é o handler do
//     portal, com sessão, permissão e ações - e nada disso mora lá.
// ─────────────────────────────────────────────────────────────────────────────
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@libsql/client';
import { etapasDeTarefa, statusDeduzido } from './_entregas.js';
import { citacaoEmail, fichaEmail, notaEmail, notifyEmail } from './_email.js';
// Só o endereço do dono do painel: é o mesmo que o aviso de chamado do time usa,
// e repetir a regra aqui abriria a chance de os dois divergirem.
import { emailAdmin } from './_papeis.js';

// ── Limite de taxa ──────────────────────────────────────────────────────────
//
//  Na memória da instância, e não numa tabela como o limitador do login. São
//  problemas diferentes: lá o que se protege é credencial, o volume é baixo e a
//  contagem precisa valer entre instâncias, então uma gravação por tentativa se
//  justifica. Aqui o que se protege é o próprio banco de uma enxurrada - gravar
//  uma linha por requisição para contar requisições seria pagar exatamente o
//  custo que se quer evitar.
//
//  A borda faz a primeira metade do trabalho: com cinco segundos de cache, uma
//  repetição no mesmo link nem chega até aqui. Isto pega o resto.

/** Janela e teto. Sessenta por minuto é folgado para gente: a página busca uma
 *  vez por minuto com a aba à vista, e um escritório inteiro atrás do mesmo IP
 *  cabe com sobra. Enxurrada de máquina passa disso na primeira fração de
 *  segundo. */
const JANELA_MS = 60_000;
const TETO = 60;

/** IP → quando cada requisição da janela chegou. */
const visitas = new Map<string, number[]>();

/** O IP de quem pediu. Atrás da borda da Vercel, o primeiro da lista do
 *  `x-forwarded-for` é o cliente; o resto são os saltos até aqui. */
function ipDe(req: VercelRequest): string {
  // Tudo opcional: o `req` chega montado de jeitos diferentes conforme quem
  // executa o handler, e ficar sem IP não pode derrubar a página do cliente.
  return String(
    (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0].trim()
    ?? req.socket?.remoteAddress
    ?? '0.0.0.0'
  );
}

/** Passou do teto na janela? Conta a requisição atual antes de responder. */
function passouDoTeto(ip: string): boolean {
  const agora = Date.now();
  const desde = agora - JANELA_MS;
  const recentes = (visitas.get(ip) ?? []).filter(t => t > desde);
  recentes.push(agora);
  visitas.set(ip, recentes);
  // A instância fica de pé entre requisições, então o mapa precisa de poda: sem
  // ela, um bombardeio com IP forjado cresceria a memória até derrubar a função.
  // A varredura só acontece quando o mapa já está grande, e não a cada visita.
  if (visitas.size > 5_000) {
    for (const [chave, quando] of visitas) {
      if (!quando.some(t => t > desde)) visitas.delete(chave);
    }
  }
  return recentes.length > TETO;
}

// ── Quanto se pode mandar ───────────────────────────────────────────────────
//
//  Escrever tem teto próprio, e bem mais apertado que o de ler: ler é a página
//  se atualizando sozinha, escrever é gente digitando. Cinco pedidos em dez
//  minutos cobre com folga quem tem muito a dizer, e corta o robô que descobriu
//  o link.
const JANELA_ENVIO_MS = 10 * 60_000;
const TETO_ENVIO = 5;
const envios = new Map<string, number[]>();

function passouDoTetoDeEnvio(ip: string): boolean {
  const agora = Date.now();
  const desde = agora - JANELA_ENVIO_MS;
  const recentes = (envios.get(ip) ?? []).filter(t => t > desde);
  recentes.push(agora);
  envios.set(ip, recentes);
  if (envios.size > 5_000) {
    for (const [chave, quando] of envios) {
      if (!quando.some(t => t > desde)) envios.delete(chave);
    }
  }
  return recentes.length > TETO_ENVIO;
}

/** O que o cliente diz que está mandando. Fechada de propósito: o tipo vira
 *  etiqueta na fila de dentro, e etiqueta que qualquer texto cria não etiqueta
 *  nada. */
const TIPOS_DE_PEDIDO = ['problema', 'ajuste', 'ideia', 'duvida'];

/** O mesmo tipo, escrito como gente lê - é assim que ele vai no e-mail. */
const ROTULO_DO_TIPO: Record<string, string> = {
  problema: 'Problema',
  ajuste: 'Ajuste',
  ideia: 'Nova ideia',
  duvida: 'Dúvida',
};

/** Anexos: até cinco, imagem ou PDF, cinco megas cada. Um pedido raramente tem
 *  um print só - tem o da tela, o do erro e o PDF que veio por e-mail. */
const TIPOS_DE_ANEXO = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const LIMITE_ANEXO = 5 * 1024 * 1024;
const MAX_ANEXOS = 5;

/** Estados de entrega que o cliente vê. O nome é o mesmo de dentro: inventar um
 *  vocabulário só para fora produziria duas verdades sobre a mesma entrega. */
const ORDEM_STATUS = [
  'Triagem', 'Planejada', 'Em andamento', 'Bloqueada', 'Entregue', 'Validada', 'Cancelada',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = String(req.query.token ?? '').trim();
  // Um mesmo endereço serve a página e entrega o conteúdo da evidência. Duas
  // rotas pediriam duas vezes a mesma conferência de token, e é ela que tranca
  // isto - o id do arquivo sozinho não abre nada.
  const anexo = Number(req.query.anexo ?? 0);
  // Formato conferido antes de ir ao banco: o token é sempre 32 hexadecimais,
  // e qualquer coisa fora disso é ruído ou tentativa.
  if (!/^[0-9a-f]{32}$/.test(token)) return res.status(404).json({ error: 'Página não encontrada.' });

  // Antes de abrir conexão com o banco: requisição barrada não custa consulta.
  if (passouDoTeto(ipDe(req))) {
    res.setHeader('Retry-After', String(Math.ceil(JANELA_MS / 1000)));
    // Sem cache: a resposta é sobre quem pediu, não sobre a página.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(429).json({ error: 'Muitas requisições. Tente de novo em um minuto.' });
  }

  const db = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  try {
    const projeto = await db.execute({
      sql: `SELECT p.id, p.nome, p.descricao, p.status, p.previsao_entrega,
                   p.link_portal, p.publicado_em, c.nome AS cliente_nome
            FROM projetos p
            LEFT JOIN clientes c ON c.id = p.cliente_id
            WHERE p.publico_token = ? AND p.ativo = 1`,
      args: [token],
    });
    const p = projeto.rows[0];
    if (!p) return res.status(404).json({ error: 'Página não encontrada.' });

    // ── O pedido do cliente ────────────────────────────────────────────────
    //
    //  Cai na mesma fila de chamados do time, marcado como vindo do cliente e
    //  amarrado a este projeto. Mesma fila de propósito: pedido de cliente é
    //  trabalho como outro qualquer, e uma segunda caixa de entrada seria mais
    //  uma coisa para alguém lembrar de olhar.
    if (req.method === 'POST') {
      if (passouDoTetoDeEnvio(ipDe(req))) {
        res.setHeader('Retry-After', String(Math.ceil(JANELA_ENVIO_MS / 1000)));
        res.setHeader('Cache-Control', 'no-store');
        return res.status(429).json({ error: 'Muitos envios seguidos. Tente de novo em alguns minutos.' });
      }

      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const texto = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

      const tipo = texto(corpo.tipo, 20);
      if (!TIPOS_DE_PEDIDO.includes(tipo)) {
        return res.status(400).json({ error: 'Escolha o tipo do pedido.' });
      }
      const assunto = texto(corpo.assunto, 120);
      if (assunto.length < 3) return res.status(400).json({ error: 'Escreva um assunto.' });
      const mensagem = texto(corpo.mensagem, 4000);
      if (mensagem.length < 5) return res.status(400).json({ error: 'Conte o que você precisa.' });
      const nome = texto(corpo.nome, 80);
      if (nome.length < 2) return res.status(400).json({ error: 'Diga o seu nome.' });
      const email = texto(corpo.email, 120);
      // E-mail é opcional - o cliente pode preferir falar pelo canal de sempre -,
      // mas escrito torto é recusado: sem ele não há como responder, e um
      // endereço quebrado dá a impressão de que há.
      if (email && !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) {
        return res.status(400).json({ error: 'Confira o e-mail.' });
      }

      // `anexo` no singular continua aceito: é o formato que a página mandava
      // antes de aceitar vários, e uma aba aberta desde então não pode quebrar.
      const crus = Array.isArray(corpo.anexos) ? corpo.anexos
        : (corpo.anexo ? [corpo.anexo] : []);
      if (crus.length > MAX_ANEXOS) {
        return res.status(400).json({ error: `São no máximo ${MAX_ANEXOS} anexos.` });
      }
      const arquivos: { nome: string; tipo: string; base64: string }[] = [];
      for (const cru of crus) {
        const item = cru as { nome?: string; tipo?: string; base64?: string };
        if (!item?.base64) continue;
        const nomeDoArquivo = texto(item.nome ?? 'anexo', 80);
        const tipoDoArquivo = String(item.tipo ?? '');
        if (!TIPOS_DE_ANEXO.includes(tipoDoArquivo)) {
          return res.status(400).json({ error: `"${nomeDoArquivo}" precisa ser uma imagem ou um PDF.` });
        }
        const dados = String(item.base64).split(',').pop() ?? '';
        // Cada 4 letras de base64 são 3 bytes: dá para conferir o tamanho sem
        // decodificar o arquivo inteiro na memória da função.
        if (dados.length * 0.75 > LIMITE_ANEXO) {
          return res.status(400).json({ error: `"${nomeDoArquivo}" passa de 5 MB.` });
        }
        if (dados) arquivos.push({ nome: nomeDoArquivo, tipo: tipoDoArquivo, base64: dados });
      }

      const agora = new Date().toISOString();

      // A etapa de entrada do quadro de tarefas - a que a casa configurou como
      // porta - e o gestor do projeto, que e quem analisa antes de passar
      // adiante. Nenhuma das duas coisas vem do cliente: ele diz o que precisa,
      // e onde isso entra e de quem e a primeira leitura sao decisao da casa.
      const [entrada, gestor, posicao] = await Promise.all([
        db.execute(`SELECT nome FROM tarefa_status_configs
                    WHERE ativo = 1 AND is_entrada = 1
                    ORDER BY ordem, id LIMIT 1`),
        db.execute({
          sql: `SELECT u.id, u.nome, u.email FROM projeto_equipe e
                JOIN usuarios u ON u.id = e.usuario_id
                WHERE e.projeto_id = ? AND u.ativo = 1 AND LOWER(e.papel) = 'gestor'
                ORDER BY u.nome LIMIT 1`,
          args: [String(p.id)],
        }),
        db.execute({
          sql: 'SELECT COALESCE(MAX(ordem), -1) + 1 AS proxima FROM projeto_tarefas WHERE projeto_id = ?',
          args: [String(p.id)],
        }),
      ]);
      // Sem etapa de entrada configurada, vale o padrao da propria tabela: e
      // melhor a tarefa nascer em "A fazer" do que nao nascer.
      const etapa = entrada.rows[0]?.nome != null ? String(entrada.rows[0].nome) : 'A fazer';
      const responsavel = gestor.rows[0];

      const gravado = await db.execute({
        sql: `INSERT INTO projeto_tarefas
              (projeto_id, entrega_id, titulo, descricao, status, prioridade, responsavel_id,
               prazo, etiquetas, ordem, concluida_em, criado_em, criado_por_id, criado_por_nome)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          String(p.id), null, assunto,
          // Quem pediu vai no corpo da tarefa, e nao so no autor: o autor e um
          // nome, e quem le a tarefa daqui a duas semanas precisa do contato.
          `${mensagem}\n\n---\nPedido de ${nome}${email ? ` (${email})` : ''} pela pagina do projeto.`,
          etapa,
          // A prioridade e da casa, e quem a define e a casa: cliente nenhum
          // escolhe a propria posicao na fila.
          'Média',
          responsavel?.id != null ? String(responsavel.id) : null,
          null,
          JSON.stringify(['Cliente', ROTULO_DO_TIPO[tipo] ?? tipo]),
          Number(posicao.rows[0]?.proxima ?? 0),
          null,
          agora,
          null,
          `${nome} (cliente)`,
        ],
      });
      const numero = Number(gravado.lastInsertRowid ?? 0);

      // Os anexos entram como o primeiro comentario da tarefa: e onde os
      // arquivos de uma tarefa moram, e assim eles ficam no mesmo lugar que os
      // que o time anexar depois.
      if (arquivos.length) {
        const comentario = await db.execute({
          sql: `INSERT INTO tarefa_comentarios (tarefa_id, pai_id, usuario_id, usuario_nome, texto, criado_em)
                VALUES (?,?,?,?,?,?)`,
          args: [numero, null, null, `${nome} (cliente)`,
            arquivos.length === 1 ? 'Anexo enviado junto do pedido.' : 'Anexos enviados junto do pedido.',
            agora],
        });
        const comentarioId = Number(comentario.lastInsertRowid ?? 0);
        // Tres anexos sao tres gravacoes ao mesmo tempo, e nao uma fila.
        await Promise.all(arquivos.map(a => db.execute({
          sql: `INSERT INTO tarefa_comentario_anexos (comentario_id, nome, tipo, tamanho, base64, criado_em)
                VALUES (?,?,?,?,?,?)`,
          args: [comentarioId, a.nome, a.tipo, Math.round(a.base64.length * 0.75), a.base64, agora],
        })));
      }

      // O aviso vai DEPOIS da gravação, e o que ele responder não muda o que o
      // cliente vê: a tarefa já está no quadro. Se o e-mail falhar, o time perde
      // o toque no ombro, não o pedido - e a falha fica registrada em
      // `emails_enviados`, que é onde se procura por ela.
      //
      // Vai para o gestor do projeto, que é quem a tarefa espera; sem gestor na
      // equipe, vai para quem cuida do portal, para o pedido não ficar sem dono
      // nem sem aviso.
      const paraQuem = responsavel?.email != null ? String(responsavel.email) : emailAdmin();
      if (paraQuem) {
        await notifyEmail(
          db, paraQuem,
          // O projeto vai no assunto: quem recebe triagem pela caixa de entrada,
          // e "um cliente pediu alguma coisa" não diz de qual conversa se trata.
          `Portal: ${nome} mandou um pedido em ${String(p.nome)}`,
          fichaEmail([
            ['Projeto', String(p.nome)],
            ['Quem', email ? `${nome} (${email})` : nome],
            ['Tipo', ROTULO_DO_TIPO[tipo] ?? tipo],
            ['Tarefa', `#${numero} - ${assunto}`],
            ['Etapa', etapa],
            ['Responsável', responsavel?.nome != null ? String(responsavel.nome) : 'sem gestor na equipe'],
          ])
          + citacaoEmail(mensagem)
          + (arquivos.length ? notaEmail(arquivos.length === 1
            ? 'Um anexo veio junto, e está no primeiro comentário da tarefa.'
            : `${arquivos.length} anexos vieram juntos, e estão no primeiro comentário da tarefa.`) : ''),
          'pedido-cliente',
          {
            previa: assunto,
            rodape: responsavel?.email != null
              ? 'Você recebe este aviso porque é o gestor deste projeto.'
              : 'Você recebe este aviso porque é quem cuida do portal.',
          },
        ).catch(() => { /* o aviso e apoio: a tarefa ja esta gravada */ });
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.status(201).json({ ok: true, numero });
    }

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

    // Cinco segundos na borda, e nada de `stale-while-revalidate`.
    //
    // Eram cinco minutos mais uma hora de revalidação preguiçosa, e o efeito era
    // o oposto do que a página promete: mexer no projeto e o cliente continuar
    // vendo o estado antigo, porque até a visita que dispara a revalidação
    // recebe a cópia velha. Tirar o cache por completo resolvia isso e trocava
    // por outro problema - sem limite de taxa neste endereço, uma enxurrada de
    // requisições no mesmo link passa a bater direto no banco.
    //
    // Cinco segundos são invisíveis para quem acompanha e devolvem à borda o
    // trabalho de absorver repetição. E limitam o que mais importa: despublicar
    // o projeto tira a página do ar em cinco segundos, e não em uma hora.
    //
    // `max-age=0` mantém o navegador fora dessa conta: ele revalida sempre, e
    // quem guarda é a borda, que é onde a repetição acontece. A chave do cache
    // inclui o token, então uma cópia nunca atende outro projeto.
    res.setHeader('Cache-Control', 'max-age=0, s-maxage=5');
    // A página não é para buscador: link encaminhado adiante não deveria virar
    // resultado de pesquisa.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');

    return res.status(200).json({
      projeto: {
        nome: p.nome,
        descricao: p.descricao,
        status: p.status,
        previsao_entrega: p.previsao_entrega,
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
        const status = ['Planejada', 'Triagem', 'Entregue', 'Validada', 'Cancelada'].includes(String(e.status))
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
          // Validada vale 100 mesmo com tarefa em aberto - o aceite do cliente
          // é o que encerra a entrega.
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
        };
      }),
      ordem_status: ORDEM_STATUS,
    });
  } catch {
    return res.status(500).json({ error: 'Não foi possível carregar a página.' });
  }
}
