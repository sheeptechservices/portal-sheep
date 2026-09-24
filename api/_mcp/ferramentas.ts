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
  handleAdminData, tarefaVisivel, donosDaTarefa, type UsuarioAdmin,
} from '../_admin-handler.js';
import { podeAcao, type Permissoes } from '../_permissoes.js';
import { ErroFerramenta, type Ferramenta, type Servidor } from './protocolo.js';

export interface Ctx {
  db: Client;
  usuario: UsuarioAdmin;
  permissoes: Permissoes;
  /** Leituras de catálogo desta chamada, para não buscar duas vezes. */
  cache: Map<string, Promise<any>>;
}

const PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'];
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
      + 'caracteres; use ver_tarefa para o detalhe. Pagine com cursor enquanto "proximo" vier preenchido.',
    inputSchema: {
      type: 'object',
      properties: {
        projeto: umOuVarios('Id do projeto (de listar_projetos).'),
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
      return chamar(ctx, 'GET', 'tarefas_filtradas', {
        projeto: listaDe(a.projeto), status, responsavel: listaDe(a.responsavel), prioridade,
        etiqueta: etiquetas, entrega: listaDe(a.entrega),
        prazo_de: a.prazo_de ? data(a.prazo_de, 'prazo_de') : undefined,
        prazo_ate: a.prazo_ate ? data(a.prazo_ate, 'prazo_ate') : undefined,
        texto: a.texto, incluir_concluidas: a.incluir_concluidas ? '1' : undefined,
        limite: a.limite, cursor: a.cursor,
      });
    },
  },
  {
    name: 'ver_tarefa',
    title: 'Ver tarefa',
    description: 'Tudo de uma tarefa: campos, descrição inteira, subtarefas, a conversa com respostas, '
      + 'menções, joinhas e anexos (só os dados do arquivo; o conteúdo vem por baixar_anexo), e o '
      + 'histórico de alterações mais recente.',
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
        titulo: t.titulo,
        descricao: t.descricao ?? '',
        projeto: { id: t.projeto_id, nome: t.projeto_nome },
        entrega: t.entrega_id ? { id: Number(t.entrega_id), titulo: t.entrega_titulo } : null,
        status: t.status,
        prioridade: t.prioridade,
        responsaveis: await comNomes(ctx, donosDaTarefa(t)),
        prazo: t.prazo ?? null,
        etiquetas: etiquetasDaLinha(t),
        concluida_em: t.concluida_em ?? null,
        criado_em: t.criado_em,
        criado_por: t.criado_por_nome ?? null,
        subtarefas: (sub.subtarefas ?? []).map((s: any) => ({ id: Number(s.id), titulo: s.titulo, feita: Number(s.feita) === 1 })),
        comentarios: comentarios.filter(c => c.pai_id == null).map(c => ({
          ...linha(c),
          respostas: comentarios.filter(r => Number(r.pai_id) === Number(c.id)).map(linha),
        })),
        historico: (atividade.eventos ?? []).slice(0, historico).map((e: any) => ({
          quem: e.usuario_nome, acao: e.acao, campo: e.campo, de: e.de, para: e.para, quando: e.criado_em,
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
        projeto_id: { type: 'string', description: 'Id do projeto (de listar_projetos).' },
        titulo: { type: 'string' },
        descricao: { type: 'string' },
        status: { type: 'string', description: 'Nome da etapa.' },
        prioridade: { type: 'string', description: 'Urgente, Alta, Média ou Baixa. Padrão Média.' },
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
        titulo: String(a.titulo),
        descricao: a.descricao != null ? String(a.descricao) : null,
        status: a.status ? await nomeDaEtapa(ctx, String(a.status)) : undefined,
        prioridade: a.prioridade ? nomeDaPrioridade(String(a.prioridade)) : 'Média',
        responsaveis: await idsDasPessoas(ctx, listaDe(a.responsaveis)),
        prazo: a.prazo ? data(a.prazo, 'prazo') : null,
        etiquetas: await nomesDasEtiquetas(ctx, listaDe(a.etiquetas)),
        entrega_id: a.entrega_id ?? null,
        subtarefas: listaDe(a.subtarefas).map(titulo => ({ titulo })),
        comentario_etiqueta: a.comentario_etiqueta,
      };
      const r = await chamar(ctx, 'POST', 'salvar_tarefa', corpo);
      return { id: Number(r.id), status: r.status, responsaveis: await comNomes(ctx, r.responsaveis ?? []) };
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
        responsaveis: { type: 'array', items: { type: 'string' } },
        adicionar_responsaveis: { type: 'array', items: { type: 'string' } },
        remover_responsaveis: { type: 'array', items: { type: 'string' } },
        prazo: { type: ['string', 'null'], description: 'AAAA-MM-DD, ou null para apagar.' },
        etiquetas: { type: 'array', items: { type: 'string' } },
        adicionar_etiquetas: { type: 'array', items: { type: 'string' } },
        remover_etiquetas: { type: 'array', items: { type: 'string' } },
        projeto_id: { type: 'string', description: 'Muda a tarefa de projeto.' },
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

      const corpo = {
        id: Number(t.id),
        projeto_id: a.projeto_id !== undefined ? String(a.projeto_id) : t.projeto_id,
        entrega_id: a.entrega_id !== undefined ? a.entrega_id : t.entrega_id,
        titulo: a.titulo !== undefined ? String(a.titulo) : t.titulo,
        descricao: a.descricao !== undefined ? String(a.descricao) : t.descricao,
        status: a.status !== undefined ? await nomeDaEtapa(ctx, String(a.status)) : t.status,
        prioridade: a.prioridade !== undefined ? nomeDaPrioridade(String(a.prioridade)) : t.prioridade,
        responsaveis: donos,
        prazo: a.prazo !== undefined ? data(a.prazo, 'prazo') : t.prazo,
        etiquetas,
        comentario_etiqueta: a.comentario_etiqueta,
      };
      const r = await chamar(ctx, 'POST', 'salvar_tarefa', corpo);
      return {
        id: Number(t.id), status: r.status, concluida_em: r.concluida_em ?? null,
        responsaveis: await comNomes(ctx, r.responsaveis ?? []), etiquetas,
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
    name: 'listar_projetos',
    title: 'Listar projetos',
    description: 'Os projetos em que a pessoa conectada pode ter tarefas, com as entregas e a equipe de cada um. '
      + 'O projeto "geral" guarda as demandas que não são de projeto nenhum.',
    inputSchema: { type: 'object', properties: {} },
    annotations: LEITURA,
    acoes: ['tarefas_projetos'],
    async executar(_a, ctx) {
      return chamar(ctx, 'GET', 'tarefas_projetos');
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
    description: 'Quem pode ser responsável ou mencionado, com id e e-mail.',
    inputSchema: { type: 'object', properties: {} },
    annotations: LEITURA,
    acoes: ['usuarios_notificaveis'],
    async executar(_a, ctx) {
      const r = await chamar(ctx, 'GET', 'usuarios_notificaveis');
      return (r.usuarios ?? []).map((u: any) => ({ id: String(u.id), nome: u.nome, email: u.email }));
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
  'Excluir tarefa não tem volta: confirme com a pessoa antes.',
].join('\n\n');

export const SERVIDOR: Servidor<Ctx> = {
  nome: 'portal-sheep-tarefas',
  versao: '1.0.0',
  instrucoes: INSTRUCOES,
  visiveis: ctx => FERRAMENTAS.filter(f => f.acoes.every(acao => podeAcao(ctx.permissoes, acao))),
};
