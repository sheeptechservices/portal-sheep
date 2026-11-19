// ─────────────────────────────────────────────────────────────────────────────
//  As ferramentas do MCP das tarefas.
//
//  Cada uma é um adaptador fino sobre as ações que a tela já usa: chama o
//  `handleAdminData` com o usuário do token, e com isso herda o porteiro da
//  matriz, o corte por equipe, as regras de etiqueta, os avisos e a auditoria.
//  Nenhuma regra de negócio mora aqui. O que mora aqui é tradução: nome de
//  etapa e de etiqueta para o nome exato, e-mail para id, patch parcial para o
//  objeto inteiro que `salvar_tarefa` espera.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import {
  handleAdminData, tarefaVisivel, donosDaTarefa, projetosDaTarefa, type UsuarioAdmin,
} from '../_admin-handler.js';
import { podeAcao, type Permissoes } from '../_permissoes.js';
import { ErroFerramenta, type Ferramenta, type Servidor } from './protocolo.js';
import { enderecoDoPortal } from '../_email.js';

/** O endereço da tarefa no portal: a rota que abre a gaveta dela. */
const linkDaTarefa = (id: unknown) => `${enderecoDoPortal()}/tarefas/${Number(id)}`;
// A mesma lista de logos da tela (carrossel da entrada, seletores de cliente):
// fonte única, para o bot do WhatsApp pôr a logo do cliente no gráfico.
import { marcaDoCliente } from '../../src/lib/marcas.js';

export interface Ctx {
  db: Client;
  usuario: UsuarioAdmin;
  permissoes: Permissoes;
  /** Leituras de catálogo desta chamada, para não buscar duas vezes. */
  cache: Map<string, Promise<any>>;
}

const PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'];
/** Quanto trabalho a tarefa dá. Vazio é resposta: "ainda não dimensionada". */
const COMPLEXIDADES = ['Difícil', 'Moderada', 'Simples'];
/** Marca de menção gravada no texto do comentário: `@[Nome](id)`. */
const MARCA = /@\[([^\]]+)\]\(([^)]+)\)/g;

// ── Acesso ao portal ────────────────────────────────────────────────────────

async function chamar(ctx: Ctx, metodo: 'GET' | 'POST', acao: string, dados: Record<string, unknown> = {}) {
  let query = new URLSearchParams();
  let body: Record<string, unknown> = {};
  if (metodo === 'GET') {
    query = new URLSearchParams({ action: acao });
    for (const [k, v] of Object.entries(dados)) {
      if (v === undefined || v === null || v === '') continue;
      query.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
  } else {
    body = { ...dados, action: acao };
  }
  const r = await handleAdminData(metodo, query, body, ctx.db, ctx.usuario);
  if (r.status >= 400) throw new ErroFerramenta(String(r.body?.error ?? `O portal recusou (${r.status}).`));
  return r.body;
}

function lembrar<T>(ctx: Ctx, chave: string, buscar: () => Promise<T>): Promise<T> {
  if (!ctx.cache.has(chave)) ctx.cache.set(chave, buscar());
  return ctx.cache.get(chave)!;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const listaDe = (v: unknown): string[] =>
  (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(x => String(x).trim()).filter(Boolean);

// ── Tradução de nomes ───────────────────────────────────────────────────────

async function etapas(ctx: Ctx): Promise<any[]> {
  return lembrar(ctx, 'etapas', async () => (await chamar(ctx, 'GET', 'tarefa_status_configs')).statuses ?? []);
}

async function etiquetasDoPortal(ctx: Ctx): Promise<any[]> {
  return lembrar(ctx, 'etiquetas', async () => (await chamar(ctx, 'GET', 'tarefa_etiquetas')).etiquetas ?? []);
}

async function pessoas(ctx: Ctx): Promise<{ id: string; nome: string; email: string }[]> {
  return lembrar(ctx, 'pessoas', async () => {
    const r = await ctx.db.execute('SELECT id, nome, email FROM usuarios');
    return r.rows.map(u => ({ id: String(u.id), nome: String(u.nome), email: String(u.email).toLowerCase() }));
  });
}

async function nomeDaEtapa(ctx: Ctx, pedido: string): Promise<string> {
  const lista = (await etapas(ctx)).map(e => String(e.nome));
  const achada = lista.find(n => semAcento(n) === semAcento(pedido));
  if (!achada) throw new ErroFerramenta(`Etapa "${pedido}" não existe. Etapas: ${lista.join(', ')}.`);
  return achada;
}

async function nomesDasEtiquetas(ctx: Ctx, pedidas: string[]): Promise<string[]> {
  const lista = (await etiquetasDoPortal(ctx)).map(e => String(e.nome));
  return pedidas.map(p => {
    const achada = lista.find(n => semAcento(n) === semAcento(p));
    if (!achada) throw new ErroFerramenta(`Etiqueta "${p}" não existe. Etiquetas: ${lista.join(', ')}.`);
    return achada;
  });
}

function nomeDaPrioridade(pedida: string): string {
  const achada = PRIORIDADES.find(p => semAcento(p) === semAcento(pedida));
  if (!achada) throw new ErroFerramenta(`Prioridade "${pedida}" não existe. Use ${PRIORIDADES.join(', ')}.`);
  return achada;
}

/** Texto vazio tira a marca, e é diferente de não mandar o campo. */
function nomeDaComplexidade(pedida: string): string {
  if (!pedida.trim()) return '';
  const achada = COMPLEXIDADES.find(c => semAcento(c) === semAcento(pedida));
  if (!achada) {
    throw new ErroFerramenta(`Complexidade "${pedida}" não existe. Use ${COMPLEXIDADES.join(', ')}.`);
  }
  return achada;
}

/** Id, e-mail ou `eu` para o id da pessoa. */
async function idsDasPessoas(ctx: Ctx, pedidas: string[]): Promise<string[]> {
  const todas = await pessoas(ctx);
  return pedidas.map(p => {
    if (p === 'eu') return ctx.usuario.id;
    const achada = todas.find(u => u.id === p || u.email === p.toLowerCase());
    if (!achada) throw new ErroFerramenta(`Pessoa "${p}" não encontrada. Use o id ou o e-mail de listar_pessoas.`);
    return achada.id;
  });
}

async function comNomes(ctx: Ctx, ids: string[]) {
  const todas = await pessoas(ctx);
  return ids.map(id => {
    const u = todas.find(x => x.id === id);
    return { id, nome: u?.nome ?? null, email: u?.email ?? null };
  });
}

function data(v: unknown, campo: string): string | null {
  if (v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErroFerramenta(`${campo} precisa estar no formato AAAA-MM-DD.`);
  return s;
}

function etiquetasDaLinha(l: Record<string, any>): string[] {
  try { const v = JSON.parse(String(l.etiquetas ?? '[]')); return Array.isArray(v) ? v.map(String) : []; }
  catch { return []; }
}

async function tarefaOuErro(ctx: Ctx, id: unknown) {
  const t = await tarefaVisivel(ctx.db, ctx.usuario, Number(id));
  if (!t) throw new ErroFerramenta(`Tarefa ${id} não encontrada.`);
  return t;
}

// ── Esquemas reaproveitados ─────────────────────────────────────────────────

const umOuVarios = (descricao: string) => ({
  anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  description: descricao,
});
const idNumero = (descricao: string) => ({ type: 'integer', description: descricao });

const LEITURA = { readOnlyHint: true, openWorldHint: false };
const ESCRITA = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
const APAGA = { readOnlyHint: false, destructiveHint: true, openWorldHint: false };

// ── As ferramentas ──────────────────────────────────────────────────────────

const FERRAMENTAS: Ferramenta<Ctx>[] = [
  {
    name: 'listar_tarefas',
    title: 'Listar tarefas',
    description: 'Lista tarefas com filtro, das mais novas para as mais antigas. Sem filtro de status, '
      + 'traz só as abertas (sem as concluídas e as desconsideradas). A descrição vem cortada em 300 '
      + 'caracteres; use ver_tarefa para o detalhe. Cada tarefa traz o link dela no portal. '
      + 'Pagine com cursor enquanto "proximo" vier preenchido.',
    inputSchema: {
      type: 'object',
      properties: {
        projeto: umOuVarios('Id do projeto (de listar_projetos). Acha também a tarefa que tem esse projeto entre os seus.'),
        status: umOuVarios('Nome da etapa, como em listar_status.'),
        responsavel: umOuVarios('Id, e-mail ou "eu".'),
        prioridade: umOuVarios('Urgente, Alta, Média ou Baixa.'),
        etiqueta: umOuVarios('Nome da etiqueta, como em listar_etiquetas.'),
        entrega: umOuVarios('Id da entrega.'),
        prazo_de: { type: 'string', description: 'Prazo a partir de (AAAA-MM-DD).' },
        prazo_ate: { type: 'string', description: 'Prazo até (AAAA-MM-DD).' },
        texto: { type: 'string', description: 'Busca no título e na descrição. "#123" acha pelo número.' },
        incluir_concluidas: { type: 'boolean', description: 'Traz também as concluídas e desconsideradas.' },
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Padrão 50.' },
        cursor: { type: 'string', description: 'O "proximo" da página anterior.' },
      },
    },
    annotations: LEITURA,
    acoes: ['tarefas_filtradas'],
    async executar(a, ctx) {
      const status = await Promise.all(listaDe(a.status).map(s => nomeDaEtapa(ctx, s)));
      const etiquetas = await nomesDasEtiquetas(ctx, listaDe(a.etiqueta));
      const prioridade = listaDe(a.prioridade).map(nomeDaPrioridade);
      const r = await chamar(ctx, 'GET', 'tarefas_filtradas', {
        projeto: listaDe(a.projeto), status, responsavel: listaDe(a.responsavel), prioridade,
        etiqueta: etiquetas, entrega: listaDe(a.entrega),
        prazo_de: a.prazo_de ? data(a.prazo_de, 'prazo_de') : undefined,
        prazo_ate: a.prazo_ate ? data(a.prazo_ate, 'prazo_ate') : undefined,
        texto: a.texto, incluir_concluidas: a.incluir_concluidas ? '1' : undefined,
        limite: a.limite, cursor: a.cursor,
      });
      return { ...r, tarefas: (r?.tarefas ?? []).map((t: any) => ({ ...t, link: linkDaTarefa(t.id) })) };
    },
  },
  {
    name: 'ver_tarefa',
    title: 'Ver tarefa',
    description: 'Tudo de uma tarefa: campos, descrição inteira, subtarefas, a conversa com respostas, '
      + 'menções, joinhas e anexos (só os dados do arquivo; o conteúdo vem por baixar_anexo), o '
      + 'histórico de alterações mais recente, o link no portal e quem já abriu a tarefa (vistos: '
      + 'quem, quantas vezes, a primeira e a última).',
    inputSchema: {
      type: 'object',
      properties: {
        id: idNumero('Número da tarefa.'),
        historico: { type: 'integer', minimum: 0, maximum: 200, description: 'Quantos eventos do histórico trazer. Padrão 30.' },
      },
      required: ['id'],
    },
    annotations: LEITURA,
    acoes: ['tarefa_atividade', 'tarefa_subtarefas'],
    async executar(a, ctx) {
      const t = await tarefaOuErro(ctx, a.id);
      const [atividade, sub] = await Promise.all([
        chamar(ctx, 'GET', 'tarefa_atividade', { id: t.id }),
        chamar(ctx, 'GET', 'tarefa_subtarefas', { id: t.id }),
      ]);
      const comentarios: any[] = atividade.comentarios ?? [];
      const linha = (c: any) => ({
        id: Number(c.id), autor: c.usuario_nome, autor_id: c.usuario_id, texto: c.texto,
        criado_em: c.criado_em, editado_em: c.editado_em ?? null,
        mencoes: c.mencoes, joinhas: c.joinhas,
        anexos: (c.anexos ?? []).map((x: any) => ({ id: Number(x.id), nome: x.nome, tipo: x.tipo, tamanho: Number(x.tamanho) })),
      });
      const historico = Number.isFinite(Number(a.historico)) ? Number(a.historico) : 30;
      return {
        id: Number(t.id),
        link: linkDaTarefa(t.id),
        titulo: t.titulo,
        descricao: t.descricao ?? '',
        projeto: { id: t.projeto_id, nome: t.projeto_nome },
        // A tarefa pode valer para mais de um projeto. O primeiro e o principal,
        // que e de quem sao a entrega e a ordem no quadro.
        projetos: projetosDaTarefa(t),
        entrega: t.entrega_id ? { id: Number(t.entrega_id), titulo: t.entrega_titulo } : null,
        status: t.status,
        prioridade: t.prioridade,
        complexidade: t.complexidade ?? null,
        responsaveis: await comNomes(ctx, donosDaTarefa(t)),
        prazo: t.prazo ?? null,
        etiquetas: etiquetasDaLinha(t),
        concluida_em: t.concluida_em ?? null,
        criado_em: t.criado_em,
        criado_por: t.criado_por_nome ?? null,
        subtarefas: (sub.subtarefas ?? []).map((s: any) => ({
          id: Number(s.id), titulo: s.titulo, feita: Number(s.feita) === 1,
          // O passo de cima, quando este é subitem dele. Nulo no primeiro nível.
          pai_id: s.pai_id == null ? null : Number(s.pai_id),
        })),
        comentarios: comentarios.filter(c => c.pai_id == null).map(c => ({
          ...linha(c),
          respostas: comentarios.filter(r => Number(r.pai_id) === Number(c.id)).map(linha),
        })),
        historico: (atividade.eventos ?? []).slice(0, historico).map((e: any) => ({
          quem: e.usuario_nome, acao: e.acao, campo: e.campo, de: e.de, para: e.para, quando: e.criado_em,
        })),
        // Quem abriu a tarefa no portal. Visitas a menos de dez minutos uma da
        // outra contam como uma só.
        vistos: (atividade.vistos ?? []).map((v: any) => ({
          quem: v.nome ?? 'alguém que saiu do portal', quem_id: v.usuario_id, vezes: Number(v.vezes) || 1,
          primeira: v.primeira_em, ultima: v.ultima_em,
        })),
      };
    },
  },
  {
    name: 'criar_tarefa',
    title: 'Criar tarefa',
    description: 'Cria uma tarefa num projeto. Sem status, ela nasce na etapa de entrada. A descrição '
      + 'aceita a marcação leve do portal (**negrito**, *itálico*, __sublinhado__, "- item"). Se uma '
      + 'etiqueta exigir comentário, informe comentario_etiqueta.',
    inputSchema: {
      type: 'object',
      properties: {
        projeto_id: { type: 'string', description: 'Id do projeto principal (de listar_projetos).' },
        projetos: {
          type: 'array', items: { type: 'string' },
          description: 'Outros projetos a que a tarefa também pertence. O principal entra sozinho.',
        },
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        status: { type: 'string', description: 'Nome da etapa.' },
        prioridade: { type: 'string', description: 'Urgente, Alta, Média ou Baixa. Padrão Média.' },
        complexidade: {
          type: 'string',
          description: 'Difícil, Moderada ou Simples. Sem ela, a tarefa fica sem complexidade.',
        },
        responsaveis: { type: 'array', items: { type: 'string' }, description: 'Ids, e-mails ou "eu".' },
        prazo: { type: 'string', description: 'AAAA-MM-DD.' },
        etiquetas: { type: 'array', items: { type: 'string' } },
        entrega_id: { type: 'integer', description: 'Entrega do projeto a que a tarefa pertence.' },
        subtarefas: { type: 'array', items: { type: 'string' }, description: 'Passos, na ordem.' },
        comentario_etiqueta: { type: 'string', description: 'O porquê, quando a etiqueta pede.' },
      },
      required: ['projeto_id', 'titulo'],
    },
    annotations: ESCRITA,
    acoes: ['salvar_tarefa', 'tarefa_status_configs', 'tarefa_etiquetas'],
    async executar(a, ctx) {
      const corpo = {
        projeto_id: String(a.projeto_id),
        projetos: [String(a.projeto_id), ...listaDe(a.projetos)],
        titulo: String(a.titulo),
        descricao: a.descricao != null ? String(a.descricao) : null,
        status: a.status ? await nomeDaEtapa(ctx, String(a.status)) : undefined,
        prioridade: a.prioridade ? nomeDaPrioridade(String(a.prioridade)) : 'Média',
        complexidade: a.complexidade !== undefined ? nomeDaComplexidade(String(a.complexidade)) : '',
        responsaveis: await idsDasPessoas(ctx, listaDe(a.responsaveis)),
        prazo: a.prazo ? data(a.prazo, 'prazo') : null,
        etiquetas: await nomesDasEtiquetas(ctx, listaDe(a.etiquetas)),
        entrega_id: a.entrega_id ?? null,
        subtarefas: listaDe(a.subtarefas).map(titulo => ({ titulo })),
        comentario_etiqueta: a.comentario_etiqueta,
      };
      const r = await chamar(ctx, 'POST', 'salvar_tarefa', corpo);
      return {
        id: Number(r.id), link: linkDaTarefa(r.id), status: r.status,
        responsaveis: await comNomes(ctx, r.responsaveis ?? []), projetos: r.projetos ?? [],
      };
    },
  },
  {
    name: 'editar_tarefa',
    title: 'Editar tarefa',
    description: 'Altera só os campos informados; o resto fica como está. Mover de etapa é trocar o '
      + 'status. Responsáveis e etiquetas podem ser trocados inteiros (responsaveis, etiquetas) ou '
      + 'somados e tirados (adicionar_*, remover_*). prazo: null apaga o prazo.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idNumero('Número da tarefa.'),
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        status: { type: 'string', description: 'Nome da etapa.' },
        prioridade: { type: 'string' },
        complexidade: {
          type: 'string',
          description: 'Difícil, Moderada, Simples - ou "" para tirar a marca.',
        },
        responsaveis: { type: 'array', items: { type: 'string' } },
        adicionar_responsaveis: { type: 'array', items: { type: 'string' } },
        remover_responsaveis: { type: 'array', items: { type: 'string' } },
        prazo: { type: ['string', 'null'], description: 'AAAA-MM-DD, ou null para apagar.' },
        etiquetas: { type: 'array', items: { type: 'string' } },
        adicionar_etiquetas: { type: 'array', items: { type: 'string' } },
        remover_etiquetas: { type: 'array', items: { type: 'string' } },
        projeto_id: { type: 'string', description: 'Muda o projeto principal da tarefa.' },
        projetos: {
          type: 'array', items: { type: 'string' },
          description: 'Troca a lista inteira de projetos. Sem ela, a de antes fica como está.',
        },
        entrega_id: { type: ['integer', 'null'] },
        comentario_etiqueta: { type: 'string', description: 'O porquê, quando a etiqueta pede.' },
      },
      required: ['id'],
    },
    annotations: ESCRITA,
    acoes: ['salvar_tarefa', 'tarefa_status_configs', 'tarefa_etiquetas'],
    async executar(a, ctx) {
      const t = await tarefaOuErro(ctx, a.id);

      let donos = donosDaTarefa(t);
      if (a.responsaveis !== undefined) donos = await idsDasPessoas(ctx, listaDe(a.responsaveis));
      const somar = await idsDasPessoas(ctx, listaDe(a.adicionar_responsaveis));
      const tirar = await idsDasPessoas(ctx, listaDe(a.remover_responsaveis));
      donos = [...new Set([...donos, ...somar])].filter(id => !tirar.includes(id));

      let etiquetas = etiquetasDaLinha(t);
      if (a.etiquetas !== undefined) etiquetas = await nomesDasEtiquetas(ctx, listaDe(a.etiquetas));
      const postas = await nomesDasEtiquetas(ctx, listaDe(a.adicionar_etiquetas));
      // Tirar compara sem acento, e não pelo catálogo: uma etiqueta que saiu
      // de Configurações ainda precisa poder ser tirada da tarefa.
      const tirarEtq = listaDe(a.remover_etiquetas).map(semAcento);
      etiquetas = [...new Set([...etiquetas, ...postas])].filter(e => !tirarEtq.includes(semAcento(e)));

      const principal = a.projeto_id !== undefined ? String(a.projeto_id) : String(t.projeto_id);
      const corpo = {
        id: Number(t.id),
        projeto_id: principal,
        projetos: a.projetos !== undefined
          ? [principal, ...listaDe(a.projetos)]
          : [principal, ...projetosDaTarefa(t).filter(p => p !== principal)],
        entrega_id: a.entrega_id !== undefined ? a.entrega_id : t.entrega_id,
        titulo: a.titulo !== undefined ? String(a.titulo) : t.titulo,
        descricao: a.descricao !== undefined ? String(a.descricao) : t.descricao,
        status: a.status !== undefined ? await nomeDaEtapa(ctx, String(a.status)) : t.status,
        prioridade: a.prioridade !== undefined ? nomeDaPrioridade(String(a.prioridade)) : t.prioridade,
        // Não mandar o campo deixa como está; mandar vazio tira a marca.
        complexidade: a.complexidade !== undefined
          ? nomeDaComplexidade(String(a.complexidade))
          : (t.complexidade ?? ''),
        responsaveis: donos,
        prazo: a.prazo !== undefined ? data(a.prazo, 'prazo') : t.prazo,
        etiquetas,
        comentario_etiqueta: a.comentario_etiqueta,
      };
      const r = await chamar(ctx, 'POST', 'salvar_tarefa', corpo);
      return {
        id: Number(t.id), status: r.status, concluida_em: r.concluida_em ?? null,
        responsaveis: await comNomes(ctx, r.responsaveis ?? []), etiquetas,
        projetos: r.projetos ?? [],
      };
    },
  },
  {
    name: 'abrir_chamado',
    title: 'Abrir chamado do cliente',
    description: 'Abre um chamado no painel de chamados do cliente, em nome dele, como se ele tivesse '
      + 'aberto pelo painel: o cliente acompanha por lá, e a tarefa do time nasce sozinha na etapa de '
      + 'entrada, com o gestor do projeto, as etiquetas Cliente e Chamado (mais Bug ou Melhoria) e o '
      + 'prazo de dois dias úteis. Não crie a tarefa à parte. Use só quando pedirem um chamado; para '
      + 'trabalho interno, criar_tarefa.',
    inputSchema: {
      type: 'object',
      properties: {
        projeto_id: { type: 'string', description: 'Id do projeto do cliente (de listar_projetos).' },
        titulo: { type: 'string', description: 'De 3 a 140 caracteres.' },
        descricao: { type: 'string', description: 'O que está acontecendo ou o que se pede. Pelo menos 5 caracteres.' },
        solicitante: { type: 'string', description: 'Quem do cliente está pedindo (nome).' },
        tipo: { type: 'string', enum: ['bug', 'melhoria'], description: 'bug: algo quebrou; melhoria: algo novo ou diferente.' },
        urgencia: { type: 'string', description: 'Urgente, Alta, Média ou Baixa.' },
        links: { type: 'array', items: { type: 'string' }, description: 'Até 5 endereços http ou https.' },
        anexos: {
          type: 'array',
          description: 'Imagem ou PDF, até 5 e 4 MB somados, em base64.',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string' },
              tipo: { type: 'string', description: 'image/png, image/jpeg, image/gif, image/webp ou application/pdf.' },
              base64: { type: 'string', description: 'Conteúdo em base64, sem o prefixo data:.' },
            },
            required: ['nome', 'tipo', 'base64'],
          },
        },
      },
      required: ['projeto_id', 'titulo', 'descricao', 'solicitante', 'tipo', 'urgencia'],
    },
    annotations: ESCRITA,
    acoes: ['abrir_chamado_cliente'],
    async executar(a, ctx) {
      const tipo = semAcento(String(a.tipo ?? ''));
      if (tipo !== 'bug' && tipo !== 'melhoria') throw new ErroFerramenta('tipo precisa ser bug ou melhoria.');
      const r = await chamar(ctx, 'POST', 'abrir_chamado_cliente', {
        projeto_id: String(a.projeto_id),
        titulo: String(a.titulo ?? ''),
        descricao: String(a.descricao ?? ''),
        solicitante: String(a.solicitante ?? ''),
        tipo,
        urgencia: nomeDaPrioridade(String(a.urgencia ?? '')),
        links: listaDe(a.links),
        anexos: Array.isArray(a.anexos) ? a.anexos : [],
      });
      return {
        chamado: r.numero, tarefa_id: r.tarefa_id, etapa: r.status, previsao: r.previsao,
        responsavel: r.responsavel, anexos: r.anexos, painel: r.painel,
      };
    },
  },
  {
    name: 'excluir_tarefa',
    title: 'Excluir tarefa',
    description: 'Apaga a tarefa de vez, com subtarefas, conversa, anexos e histórico. Não há como desfazer.',
    inputSchema: { type: 'object', properties: { id: idNumero('Número da tarefa.') }, required: ['id'] },
    annotations: APAGA,
    acoes: ['excluir_tarefa'],
    async executar(a, ctx) {
      const t = await tarefaOuErro(ctx, a.id);
      await chamar(ctx, 'POST', 'excluir_tarefa', { id: Number(t.id) });
      return { ok: true, id: Number(t.id), titulo: t.titulo };
    },
  },
  {
    name: 'adicionar_subtarefa',
    title: 'Adicionar subtarefa',
    description: 'Acrescenta um passo no fim da lista de subtarefas.',
    inputSchema: {
      type: 'object',
      properties: { tarefa_id: idNumero('Número da tarefa.'), titulo: { type: 'string' } },
      required: ['tarefa_id', 'titulo'],
    },
    annotations: ESCRITA,
    acoes: ['add_tarefa_subtarefa'],
    async executar(a, ctx) {
      const r = await chamar(ctx, 'POST', 'add_tarefa_subtarefa', { tarefa_id: Number(a.tarefa_id), titulo: a.titulo });
      return r.subtarefa;
    },
  },
  {
    name: 'editar_subtarefa',
    title: 'Editar subtarefa',
    description: 'Renomeia a subtarefa ou marca como feita e não feita.',
    inputSchema: {
      type: 'object',
      properties: {
        id: idNumero('Id da subtarefa (de ver_tarefa).'),
        titulo: { type: 'string' },
        feita: { type: 'boolean' },
      },
      required: ['id'],
    },
    annotations: ESCRITA,
    acoes: ['atualizar_tarefa_subtarefa'],
    async executar(a, ctx) {
      if (a.titulo === undefined && a.feita === undefined) throw new ErroFerramenta('Informe titulo ou feita.');
      await chamar(ctx, 'POST', 'atualizar_tarefa_subtarefa', { id: Number(a.id), titulo: a.titulo, feita: a.feita });
      return { ok: true };
    },
  },
  {
    name: 'excluir_subtarefa',
    title: 'Excluir subtarefa',
    description: 'Apaga um passo da lista de subtarefas.',
    inputSchema: { type: 'object', properties: { id: idNumero('Id da subtarefa.') }, required: ['id'] },
    annotations: APAGA,
    acoes: ['excluir_tarefa_subtarefa'],
    async executar(a, ctx) {
      await chamar(ctx, 'POST', 'excluir_tarefa_subtarefa', { id: Number(a.id) });
      return { ok: true };
    },
  },
  {
    name: 'comentar',
    title: 'Comentar na tarefa',
    description: 'Escreve na conversa da tarefa, como a pessoa conectada. responder_a põe o comentário '
      + 'na conversa de outro (resposta desce um nível só). mencionar marca pessoas (id ou e-mail): a '
      + 'marca entra no começo do texto se ainda não estiver nele. Anexos vão em base64, até 8 MB cada.',
    inputSchema: {
      type: 'object',
      properties: {
        tarefa_id: idNumero('Número da tarefa.'),
        texto: { type: 'string', description: 'Aceita a marcação leve do portal.' },
        responder_a: idNumero('Id do comentário a responder.'),
        mencionar: { type: 'array', items: { type: 'string' } },
        anexos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nome: { type: 'string', description: 'Nome do arquivo, com extensão.' },
              tipo: { type: 'string', description: 'MIME, como image/png. Padrão application/octet-stream.' },
              base64: { type: 'string', description: 'Conteúdo em base64, sem o prefixo data:.' },
            },
            required: ['nome', 'base64'],
          },
        },
      },
      required: ['tarefa_id'],
    },
    annotations: ESCRITA,
    acoes: ['add_tarefa_comentario'],
    async executar(a, ctx) {
      let texto = String(a.texto ?? '').trim();
      const marcados = new Set([...texto.matchAll(MARCA)].map(m => m[2]));
      const pedidos = await comNomes(ctx, await idsDasPessoas(ctx, listaDe(a.mencionar)));
      const faltam = pedidos.filter(p => !marcados.has(p.id));
      if (faltam.length) texto = `${faltam.map(p => `@[${p.nome}](${p.id})`).join(' ')} ${texto}`.trim();
      const mencoes = [...new Set([...texto.matchAll(MARCA)].map(m => m[2]))];

      const anexos = (Array.isArray(a.anexos) ? a.anexos : []).map((x: any) => {
        const base64 = String(x?.base64 ?? '').replace(/^data:[^,]*,/, '');
        return {
          nome: String(x?.nome ?? ''), tipo: String(x?.tipo ?? 'application/octet-stream'),
          base64, tamanho: Buffer.from(base64, 'base64').length,
        };
      });
      const r = await chamar(ctx, 'POST', 'add_tarefa_comentario', {
        tarefa_id: Number(a.tarefa_id), texto, pai_id: a.responder_a ?? null, mencoes, anexos,
      });
      return { id: Number(r.id), criado_em: r.criado_em };
    },
  },
  {
    name: 'excluir_comentario',
    title: 'Excluir comentário',
    description: 'Apaga um comentário da pessoa conectada, com as respostas dele. Comentário de outra pessoa não pode ser apagado.',
    inputSchema: { type: 'object', properties: { id: idNumero('Id do comentário.') }, required: ['id'] },
    annotations: APAGA,
    acoes: ['excluir_tarefa_comentario'],
    async executar(a, ctx) {
      await chamar(ctx, 'POST', 'excluir_tarefa_comentario', { id: Number(a.id) });
      return { ok: true };
    },
  },
  {
    name: 'joinha_comentario',
    title: 'Joinha no comentário',
    description: 'Dá (ou tira, com ligar: false) o joinha da pessoa conectada num comentário.',
    inputSchema: {
      type: 'object',
      properties: { id: idNumero('Id do comentário.'), ligar: { type: 'boolean', description: 'Padrão true.' } },
      required: ['id'],
    },
    annotations: { ...ESCRITA, idempotentHint: true },
    acoes: ['joinha_tarefa_comentario'],
    async executar(a, ctx) {
      await chamar(ctx, 'POST', 'joinha_tarefa_comentario', { id: Number(a.id), ligar: a.ligar !== false });
      return { ok: true };
    },
  },
  {
    name: 'baixar_anexo',
    title: 'Baixar anexo',
    description: 'O conteúdo de um anexo de comentário (id de ver_tarefa). Imagem volta como imagem; '
      + 'texto volta como texto; o resto volta como arquivo em base64.',
    inputSchema: { type: 'object', properties: { id: idNumero('Id do anexo.') }, required: ['id'] },
    annotations: LEITURA,
    acoes: ['tarefa_comentario_anexo_base64'],
    async executar(a, ctx) {
      const r = await chamar(ctx, 'GET', 'tarefa_comentario_anexo_base64', { id: Number(a.id) });
      const tipo = String(r?.tipo ?? 'application/octet-stream');
      const nome = String(r?.nome ?? `anexo-${a.id}`);
      const base64 = String(r?.base64 ?? '').replace(/^data:[^,]*,/, '');
      const uri = `portal-sheep://anexo/${Number(a.id)}/${encodeURIComponent(nome)}`;
      if (tipo.startsWith('image/')) {
        return { content: [{ type: 'text', text: nome }, { type: 'image', data: base64, mimeType: tipo }] };
      }
      if (tipo.startsWith('text/') || /json|xml|csv|markdown|yaml/.test(tipo)) {
        const texto = Buffer.from(base64, 'base64').toString('utf8');
        return { content: [{ type: 'resource', resource: { uri, mimeType: tipo, text: texto } }] };
      }
      return { content: [{ type: 'resource', resource: { uri, mimeType: tipo, blob: base64 } }] };
    },
  },
  {
    name: 'listar_reunioes',
    title: 'Listar reuniões',
    description: 'As reuniões registradas nos projetos e nas oportunidades, da mais recente para a mais antiga: '
      + 'de quem é, quando, assunto, o resumo (as notas), quem participou e se há transcrição do Fireflies '
      + '(tem_transcricao). A transcrição inteira vem por transcricao_da_reuniao.',
    inputSchema: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'Id do projeto (de listar_projetos).' },
        oportunidade: { type: 'string', description: 'Id da oportunidade.' },
        de: { type: 'string', description: 'A partir de (AAAA-MM-DD).' },
        ate: { type: 'string', description: 'Até (AAAA-MM-DD).' },
        texto: { type: 'string', description: 'Busca no assunto e no resumo.' },
        limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Padrão 20.' },
      },
    },
    annotations: LEITURA,
    acoes: ['reunioes_lista'],
    async executar(a, ctx) {
      return chamar(ctx, 'GET', 'reunioes_lista', {
        projeto_id: a.projeto, oportunidade_id: a.oportunidade,
        de: a.de ? data(a.de, 'de') : undefined, ate: a.ate ? data(a.ate, 'ate') : undefined,
        texto: a.texto, limite: a.limite,
      });
    },
  },
  {
    name: 'buscar_no_fireflies',
    title: 'Buscar no Fireflies',
    description: 'As reuniões da conta do Fireflies, anexadas a um projeto do portal ou não, da mais recente para a mais '
      + 'antiga: id do Fireflies (fireflies_id), título, data, duração, participantes e link. Busca no título e nos '
      + 'participantes (texto) e filtra pelo dia (de, ate). Sem filtro, as mais recentes. O resumo vem por '
      + 'resumo_do_fireflies e a conversa por transcricao_da_reuniao, com o fireflies_id.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Parte do título ou nome/e-mail de quem participou. Uma palavra acha mais que uma frase.' },
        de: { type: 'string', description: 'A partir do dia (AAAA-MM-DD).' },
        ate: { type: 'string', description: 'Até o dia (AAAA-MM-DD).' },
        limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Padrão 30.' },
      },
    },
    annotations: LEITURA,
    acoes: ['fireflies_reunioes'],
    async executar(a, ctx) {
      const r = await chamar(ctx, 'GET', 'fireflies_reunioes', {
        busca: a.texto, de: a.de ? data(a.de, 'de') : undefined, ate: a.ate ? data(a.ate, 'ate') : undefined,
        limite: a.limite ?? 30,
      });
      return {
        reunioes: (r?.reunioes ?? []).map((m: any) => ({
          fireflies_id: m.id, titulo: m.titulo, data: m.data, duracao_minutos: m.duracao, participantes: m.participantes, link: m.url,
        })),
      };
    },
  },
  {
    name: 'resumo_do_fireflies',
    title: 'Resumo do Fireflies',
    description: 'O resumo que o Fireflies fez de uma reunião: visão geral, tópicos, palavras-chave e itens de ação, '
      + 'pelo fireflies_id (de buscar_no_fireflies ou de listar_reunioes).',
    inputSchema: {
      type: 'object',
      properties: { fireflies_id: { type: 'string', description: 'O id da reunião no Fireflies.' } },
      required: ['fireflies_id'],
    },
    annotations: LEITURA,
    acoes: ['fireflies_reuniao'],
    async executar(a, ctx) {
      const r = await chamar(ctx, 'GET', 'fireflies_reuniao', { id: String(a.fireflies_id) });
      const m = r?.reuniao ?? {};
      return {
        fireflies_id: m.id, titulo: m.titulo, data: m.data, duracao_minutos: m.duracao, participantes: m.participantes, link: m.url,
        resumo: m.resumo ?? null, topicos: m.detalhe?.topicos ?? null, itens_de_acao: m.detalhe?.acoes ?? null,
        palavras_chave: m.detalhe?.palavras ?? [],
      };
    },
  },
  {
    name: 'transcricao_da_reuniao',
    title: 'Transcrição da reunião',
    description: 'A transcrição inteira de uma reunião do Fireflies, fala por fala, numerada (n), com o minuto em que '
      + 'começou (inicio) e quem falou: pelo id da reunião no portal (reuniao) ou direto pelo id do Fireflies '
      + '(fireflies_id), para a que não foi anexada a projeto nenhum. Use a_partir e limite para ler aos pedaços.',
    inputSchema: {
      type: 'object',
      properties: {
        reuniao: { type: 'integer', description: 'Id da reunião no portal (de listar_reunioes).' },
        fireflies_id: { type: 'string', description: 'Id da reunião no Fireflies (de buscar_no_fireflies), no lugar de reuniao.' },
        a_partir: { type: 'integer', minimum: 1, description: 'Primeira fala a trazer (n). Padrão 1.' },
        limite: { type: 'integer', minimum: 1, maximum: 5000, description: 'Quantas falas. Padrão 400.' },
      },
    },
    annotations: LEITURA,
    acoes: ['reunioes_lista', 'fireflies_transcricao'],
    async executar(a, ctx) {
      let r: any;
      if (a.reuniao != null && a.reuniao !== '') {
        const lista = await chamar(ctx, 'GET', 'reunioes_lista', { id: a.reuniao, limite: 1 });
        r = lista?.reunioes?.[0];
        if (!r) throw new Error(`Reunião ${a.reuniao} não encontrada, ou fora do que esta pessoa vê.`);
        if (!r.fireflies_id) throw new Error('Esta reunião não veio do Fireflies e não tem transcrição; o resumo dela está em listar_reunioes.');
      } else if (a.fireflies_id) {
        // Direto do Fireflies: a reunião pode não estar em projeto nenhum.
        r = { id: null, fireflies_id: String(a.fireflies_id), assunto: null, data: null, projeto: null, oportunidade: null, participantes: [] };
      } else {
        throw new Error('Diga a reunião: reuniao (id no portal) ou fireflies_id.');
      }
      const t = await chamar(ctx, 'GET', 'fireflies_transcricao', { id: r.fireflies_id });
      const minuto = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      const falas = (t?.frases ?? []).map((f: any, i: number) => ({ n: i + 1, inicio: minuto(Number(f.inicio) || 0), quem: f.quem, texto: f.texto }));
      const desde = Math.max(1, Number(a.a_partir) || 1);
      const quantas = Math.min(Math.max(Number(a.limite) || 400, 1), 5000);
      const trecho = falas.slice(desde - 1, desde - 1 + quantas);
      const ultima = desde - 1 + trecho.length;
      return {
        reuniao: { id: r.id, fireflies_id: r.fireflies_id, assunto: r.assunto ?? t?.titulo ?? null, data: r.data ?? t?.data ?? null, projeto: r.projeto, oportunidade: r.oportunidade },
        titulo: t?.titulo ?? r.assunto, data: t?.data ?? r.data, duracao_minutos: t?.duracao ?? null,
        participantes: t?.participantes ?? r.participantes,
        total_de_falas: falas.length,
        falas: trecho,
        proxima: ultima < falas.length ? ultima + 1 : null,
      };
    },
  },
  {
    name: 'listar_projetos',
    title: 'Listar projetos',
    description: 'Os projetos em que a pessoa conectada pode ter tarefas, com os links, a equipe e as entregas de cada um, '
      + 'o grupo do WhatsApp do cliente vinculado ao projeto (whatsapp), quando houver, e a logo do cliente '
      + '(logo: url e detalhe, quando a logo tem desenho interno que não pode virar silhueta) '
      + 'e os links do projeto (links): portal, a ficha do projeto, para o time; chamados, o painel '
      + 'em que o cliente abre e acompanha os chamados, sem login; acompanhamento, a página de '
      + 'andamento do cliente, só quando publicada; sistema, o endereço do que foi entregue, quando há. '
      + 'O projeto "geral" guarda as demandas que não são de projeto nenhum.',
    inputSchema: {
      type: 'object',
      properties: {
        busca: { type: 'string', description: 'Só os projetos cujo nome, cliente ou código contém este texto.' },
      },
    },
    annotations: LEITURA,
    acoes: ['tarefas_projetos'],
    async executar(a, ctx) {
      const r = await chamar(ctx, 'GET', 'tarefas_projetos');
      const base = enderecoDoPortal();
      const busca = semAcento(String(a.busca ?? ''));
      const projetos = (r.projetos ?? [])
        .filter((p: any) => !busca || [p.nome, p.cliente, p.codigo, p.id].some(x => x != null && semAcento(String(x)).includes(busca)))
        .map(({ chamados_token, publico_token, link_portal, entregas, equipe, ...p }: any) => {
          const m = marcaDoCliente(p.cliente);
          // O projeto geral não é de cliente: não tem painel nem página para mandar.
          const deCliente = String(p.id) !== 'geral';
          // Os links logo depois do nome: se a resposta vier cortada, o que
          // mais se pede não é o que fica de fora.
          return {
            ...p,
            links: {
              portal: deCliente ? `${base}/projetos/${encodeURIComponent(String(p.id))}` : null,
              chamados: deCliente && chamados_token ? `${base}/chamados/${String(chamados_token)}` : null,
              acompanhamento: deCliente && publico_token ? `${base}/p/${String(publico_token)}` : null,
              sistema: String(link_portal ?? '').trim() || null,
            },
            logo: m ? { url: `${base}${m.src}`, detalhe: !!m.detalhe } : null,
            equipe: equipe ?? [],
            entregas: entregas ?? [],
          };
        });
      // Teto da resposta: o cliente do MCP corta o que passa. Com muitos
      // projetos e entregas, as entregas viram contagem (o detalhe está em
      // ver_projeto) e a equipe perde o e-mail, nessa ordem.
      const caber = (lista: any[]) => JSON.stringify(lista).length <= 24_000;
      if (caber(projetos)) return { ...r, projetos };
      const semEntregas = projetos.map((p: any) => ({ ...p, entregas: undefined, entregas_total: p.entregas.length }));
      const aviso = 'Lista grande: as entregas vieram só como contagem. Use ver_projeto com secao entregas para a lista.';
      if (caber(semEntregas)) return { ...r, projetos: semEntregas, aviso };
      return {
        ...r, aviso,
        projetos: semEntregas.map((p: any) => ({ ...p, equipe: p.equipe.map((m: any) => ({ id: m.id, nome: m.nome, papel: m.papel })) })),
      };
    },
  },
  {
    name: 'ver_projeto',
    title: 'Ver projeto',
    description: 'A ficha de um projeto, como a tela mostra. O resumo (padrão) traz descrição, cliente, tipo, '
      + 'status, prioridade, datas, progresso, observações, links (ficha, painel de chamados, '
      + 'acompanhamento, sistema entregue), repositórios do GitHub, pastas do Drive, acessos da equipe '
      + '(rótulo, usuário e endereço; a senha não vem, fica no portal), equipe com papel, a lista curta das '
      + 'entregas, a contagem das tarefas por etapa com as próximas abertas, as últimas reuniões e os '
      + 'arquivos. O detalhe de uma parte vem com secao (entregas, tarefas, reunioes ou arquivos), em '
      + 'páginas. Use para qualquer pergunta sobre um projeto ("qual o repositório do backend da 3SA", '
      + '"quem está no projeto da Click", "qual o link do sistema da Orteconte").',
    inputSchema: {
      type: 'object',
      properties: {
        projeto: { type: 'string', description: 'Id, código (PRJ-26-011), nome do projeto ou nome do cliente.' },
        secao: {
          type: 'string', enum: ['resumo', 'entregas', 'tarefas', 'reunioes', 'arquivos'],
          description: 'resumo (padrão): a ficha com as listas curtas. As outras: o detalhe daquela parte, '
            + 'em páginas (entregas com descrição e responsáveis; tarefas abertas; reuniões com as notas).',
        },
        pagina: { type: 'integer', minimum: 1, description: 'A página do detalhe, a partir de 1.' },
      },
      required: ['projeto'],
    },
    annotations: LEITURA,
    acoes: ['projetos'],
    async executar(a, ctx) {
      const pedido = String(a.projeto ?? '').trim();
      if (!pedido) throw new ErroFerramenta('Diga qual projeto: id, código, nome ou cliente.');
      const secao = String(a.secao ?? 'resumo');
      if (!['resumo', 'entregas', 'tarefas', 'reunioes', 'arquivos'].includes(secao)) {
        throw new ErroFerramenta('secao precisa ser resumo, entregas, tarefas, reunioes ou arquivos.');
      }
      const r = await chamar(ctx, 'GET', 'projetos');
      const todos: any[] = (r.projetos ?? []).filter((p: any) => String(p.id) !== 'geral' || semAcento(pedido) === 'geral');
      const alvo = semAcento(pedido);
      const exatos = todos.filter(p => [p.id, p.codigo, p.nome].some(x => x != null && semAcento(String(x)) === alvo));
      const parciais = exatos.length ? exatos : todos.filter(p =>
        [p.id, p.codigo, p.nome, p.cliente_nome].some(x => x != null && semAcento(String(x)).includes(alvo)));
      if (parciais.length === 0) {
        throw new ErroFerramenta(`Nenhum projeto bate com "${pedido}". Veja os nomes e códigos em listar_projetos.`);
      }
      // Cliente com mais de um projeto: devolve a lista para escolher, em vez
      // de adivinhar qual deles a pessoa quis dizer.
      if (parciais.length > 1) {
        return {
          varios: true,
          aviso: `Mais de um projeto bate com "${pedido}": chame de novo com o id ou o código.`,
          projetos: parciais.map(p => ({ id: String(p.id), codigo: p.codigo ?? null, nome: p.nome, cliente: p.cliente_nome ?? null, status: p.status })),
        };
      }
      const p = parciais[0];
      const base = enderecoDoPortal();
      const deCliente = String(p.id) !== 'geral';
      const [lista, todasPessoas] = await Promise.all([etapas(ctx), pessoas(ctx)]);
      const fechadas = new Set(lista.filter(e => Number(e.is_conclusao) === 1 || Number(e.is_excluded) === 1).map(e => String(e.nome)));
      const nomeDe = (id: unknown) => todasPessoas.find(u => u.id === String(id))?.nome ?? String(id);
      const curto = (s: unknown, n: number) => {
        const t = String(s ?? '').trim();
        return !t ? null : t.length > n ? `${t.slice(0, n)}...` : t;
      };
      const tarefas: any[] = p.tarefas ?? [];
      const abertas = tarefas.filter(t => !fechadas.has(String(t.status)));
      const entregas: any[] = p.entregas ?? [];
      const reunioes: any[] = p.reunioes ?? [];
      const arquivos: any[] = p.arquivos ?? [];
      const tarefaCurta = (t: any) => ({
        id: Number(t.id), titulo: t.titulo, etapa: t.status, prazo: t.prazo ?? null, link: linkDaTarefa(t.id),
      });

      // O detalhe de uma parte, em páginas: projeto com dezenas de entregas
      // não cabe numa resposta só, e o que passa do limite chega cortado.
      if (secao !== 'resumo') {
        const porPagina = secao === 'reunioes' ? 10 : secao === 'arquivos' ? 100 : 25;
        const itens: any[] = secao === 'entregas'
          ? entregas.map(e => ({
            id: Number(e.id), titulo: e.titulo, status: e.status, prazo: e.prazo ?? null,
            prioridade: e.prioridade ?? null, descricao: curto(e.descricao, 600),
            responsaveis: (e.responsaveis ?? []).map(nomeDe), progresso: e.progresso ?? null,
            tarefas_feitas: e.tarefas_feitas ?? 0, tarefas_total: e.tarefas_total ?? 0,
            links: e.links ?? [], arquivos: (e.arquivos ?? []).map((f: any) => f.nome),
          }))
          : secao === 'tarefas'
            ? abertas.map(t => ({ ...tarefaCurta(t), prioridade: t.prioridade ?? null, responsaveis: (t.responsaveis ?? []).map(nomeDe) }))
            : secao === 'reunioes'
              ? reunioes.map(m => ({
                id: Number(m.id), data: m.data, assunto: m.assunto, participantes: m.participantes ?? [],
                notas: curto(m.notas, 800), fireflies_id: m.fireflies_id ?? null,
              }))
              : arquivos.map(f => ({ nome: f.nome, etiqueta: f.etiqueta ?? null, tipo: f.tipo ?? null }));
        const paginas = Math.max(1, Math.ceil(itens.length / porPagina));
        const pagina = Math.min(Math.max(1, Number(a.pagina ?? 1) || 1), paginas);
        return {
          projeto: { id: String(p.id), codigo: p.codigo ?? null, nome: p.nome, cliente: p.cliente_nome ?? null },
          secao, pagina, paginas, total: itens.length,
          itens: itens.slice((pagina - 1) * porPagina, pagina * porPagina),
          ...(pagina < paginas ? { proxima: pagina + 1 } : {}),
        };
      }

      const porEtapa: Record<string, number> = {};
      for (const t of tarefas) porEtapa[String(t.status)] = (porEtapa[String(t.status)] ?? 0) + 1;
      const porStatus: Record<string, number> = {};
      for (const e of entregas) porStatus[String(e.status)] = (porStatus[String(e.status)] ?? 0) + 1;
      const montar = (teto: { texto: number; entregas: number; tarefas: number }) => ({
        id: String(p.id), codigo: p.codigo ?? null, nome: p.nome, cliente: p.cliente_nome ?? null,
        tipo: p.tipo ?? null, status: p.status, prioridade: p.prioridade,
        data_inicio: p.data_inicio ?? null, previsao_entrega: p.previsao_entrega ?? null,
        progresso: Number(p.progresso ?? 0), criado_em: p.criado_em ?? null,
        // Os links primeiro: são o que mais se pede, e o que nunca pode faltar.
        links: {
          portal: deCliente ? `${base}/projetos/${encodeURIComponent(String(p.id))}` : null,
          chamados: deCliente && p.chamados_token ? `${base}/chamados/${String(p.chamados_token)}` : null,
          acompanhamento: deCliente && p.publico_token ? `${base}/p/${String(p.publico_token)}` : null,
          sistema: String(p.link_portal ?? '').trim() || null,
        },
        repositorios: p.repositorios ?? [],
        drives: p.drives ?? [],
        acessos: (p.acessos ?? []).map((x: any) => ({
          rotulo: x.rotulo, usuario: x.usuario ?? null, url: x.url ?? null, tem_senha: !!x.tem_senha,
        })),
        equipe: (p.equipe ?? []).map((m: any) => ({ nome: m.nome, email: m.email, papel: m.papel ?? null })),
        descricao: curto(p.descricao, teto.texto), objetivo: curto(p.objetivo, teto.texto),
        observacoes: curto(p.observacoes, teto.texto),
        entregas: {
          total: entregas.length, por_status: porStatus,
          lista: entregas.slice(0, teto.entregas).map(e => ({ id: Number(e.id), titulo: e.titulo, status: e.status, prazo: e.prazo ?? null })),
          omitidas: Math.max(0, entregas.length - teto.entregas),
        },
        tarefas: {
          total: tarefas.length, abertas: abertas.length, por_etapa: porEtapa,
          proximas: [...abertas].sort((x, y) => String(x.prazo || '9999').localeCompare(String(y.prazo || '9999')))
            .slice(0, teto.tarefas).map(tarefaCurta),
        },
        reunioes: {
          total: reunioes.length,
          ultimas: reunioes.slice(0, 5).map(m => ({ id: Number(m.id), data: m.data, assunto: m.assunto })),
        },
        arquivos: { total: arquivos.length, nomes: arquivos.slice(0, 20).map(f => f.nome) },
        detalhe: 'Para o detalhe, chame de novo com secao: entregas, tarefas, reunioes ou arquivos.',
      });
      // A resposta tem teto: o cliente do MCP corta o que passa, e o corte
      // levaria junto o que vem depois. Projeto grande encolhe as listas e os
      // textos até caber, e avisa que encolheu.
      for (const teto of [{ texto: 3000, entregas: 80, tarefas: 10 }, { texto: 1500, entregas: 40, tarefas: 5 }, { texto: 600, entregas: 15, tarefas: 3 }]) {
        const ficha = montar(teto);
        if (JSON.stringify(ficha).length <= 24_000) return ficha;
      }
      return { ...montar({ texto: 300, entregas: 0, tarefas: 0 }), aviso: 'Ficha grande: listas e textos encurtados. Use secao para o detalhe.' };
    },
  },
  {
    name: 'listar_status',
    title: 'Listar etapas',
    description: 'As etapas do quadro de tarefas, na ordem. entrada: onde a tarefa nova nasce; '
      + 'conclusao: fecha a tarefa; desconsiderada: fora das contas.',
    inputSchema: { type: 'object', properties: {} },
    annotations: LEITURA,
    acoes: ['tarefa_status_configs'],
    async executar(_a, ctx) {
      return (await etapas(ctx)).map(e => ({
        nome: e.nome,
        entrada: Number(e.is_entrada) === 1,
        conclusao: Number(e.is_conclusao) === 1,
        desconsiderada: Number(e.is_excluded) === 1,
      }));
    },
  },
  {
    name: 'listar_etiquetas',
    title: 'Listar etiquetas',
    description: 'As etiquetas de tarefa e a regra de cada uma: exige_comentario pede comentario_etiqueta '
      + 'ao pôr; mover_para e atribuir_para agem sozinhas ao pôr; bloqueia marca a entrega como bloqueada.',
    inputSchema: { type: 'object', properties: {} },
    annotations: LEITURA,
    acoes: ['tarefa_etiquetas'],
    async executar(_a, ctx) {
      return (await etiquetasDoPortal(ctx)).map(e => ({
        nome: e.nome,
        exige_comentario: Number(e.exige_comentario) === 1,
        mover_para: e.mover_para ?? null,
        atribuir_para: e.atribuir_para ?? null,
        bloqueia: Number(e.bloqueia) === 1,
      }));
    },
  },
  {
    name: 'listar_pessoas',
    title: 'Listar pessoas',
    description: 'Quem pode ser responsável ou mencionado, com id, e-mail e foto (URL da foto do perfil, quando há).',
    inputSchema: { type: 'object', properties: {} },
    annotations: LEITURA,
    acoes: ['usuarios_notificaveis'],
    async executar(_a, ctx) {
      const r = await chamar(ctx, 'GET', 'usuarios_notificaveis');
      return (r.usuarios ?? []).map((u: any) => ({ id: String(u.id), nome: u.nome, email: u.email, foto: u.foto_url ?? null }));
    },
  },
];

const INSTRUCOES = [
  'Servidor das tarefas do Portal Sheep. Tudo o que você grava sai assinado pela pessoa conectada, '
    + 'com as permissões dela: o que ela não pode fazer na tela, você também não pode.',
  'Vocabulário: projeto é o cliente ou a frente de trabalho; entrega é um marco do projeto; tarefa '
    + 'é o trabalho do dia a dia, e mora num projeto e opcionalmente numa entrega; etapa (status) é a '
    + 'coluna do quadro; etiqueta é uma marca, e algumas têm regra (ver listar_etiquetas).',
  'Antes de criar ou filtrar, use listar_projetos, listar_status, listar_etiquetas e listar_pessoas '
    + 'para os nomes e ids exatos. Pessoas podem ser informadas por e-mail.',
  'Texto de descrição e de comentário aceita a marcação leve: **negrito**, *itálico*, __sublinhado__ '
    + 'e linhas começando com "- " para lista. Menção é @[Nome](id).',
  'Escreva em português. Nunca use travessão longo nem travessão médio: para aposto ou pausa use hífen '
    + 'cercado de espaços ( - ), e para intervalo escreva "de 10 a 20".',
  'Chamado e tarefa: chamado é o pedido do cliente, que ele acompanha no painel de chamados do '
    + 'projeto; abrir_chamado o registra em nome dele e a tarefa do time nasce sozinha. Use só quando '
    + 'pedirem um chamado. Trabalho interno é criar_tarefa.',
  'Projeto: listar_projetos para achar o id e os links; ver_projeto para a ficha inteira (descrição, '
    + 'repositórios, Drive, acessos sem senha, equipe, entregas, reuniões e tarefas).',
  'Excluir tarefa não tem volta: confirme com a pessoa antes.',
].join('\n\n');

export const SERVIDOR: Servidor<Ctx> = {
  nome: 'portal-sheep-tarefas',
  versao: '1.0.0',
  instrucoes: INSTRUCOES,
  visiveis: ctx => FERRAMENTAS.filter(f => f.acoes.every(acao => podeAcao(ctx.permissoes, acao))),
};
