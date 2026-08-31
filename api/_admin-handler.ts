import type { Client } from '@libsql/client';
import { randomUUID, randomBytes } from 'crypto';
import {
  ANTHROPIC_KEY, DEFAULT_ANTHROPIC_MODEL,
  getIntegrationCredential, saveIntegrationCredential,
  updateIntegrationMeta, removeIntegrationCredential, validateAnthropicKey,
} from './_credentials.js';
import { obterDdl } from './_schema.js';
import {
  emailAdmin, ehEmailAdmin, ordemPapel, papelEfetivo, podeGerenciarUsuarios,
  PAPEIS_ATRIBUIVEIS, type Papel,
} from './_papeis.js';
import {
  CATALOGO, CHAVES as CHAVES_TODAS, PERMISSAO_DA_ACAO, LIVRE, SO_ADMIN, TUDO as TUDO_PERM,
  ensurePermissoesSchema, permissoesDoUsuario, podeAcao, pode,
  matrizDoPapel, salvarMatrizPapel, negado,
} from './_permissoes.js';

// Migração de schema: guardada pela promessa, não por um booleano.
//
// O booleano era erguido *antes* do trabalho começar, então quem chegasse
// durante os ~115 ALTER/CREATE sequenciais recebia "pronto" e ia consultar
// tabela que ainda não existia. Guardando a promessa, o segundo a chegar espera
// o primeiro terminar de verdade. Falha limpa o cache, para a próxima tentar de
// novo em vez de herdar um schema pela metade.
let _schemaPromessa: Promise<void> | null = null;

export function ensureAdminSchema(db: Client): Promise<void> {
  if (!_schemaPromessa) {
    _schemaPromessa = migrarSchema(db).catch(err => {
      _schemaPromessa = null;
      throw err;
    });
  }
  return _schemaPromessa;
}

async function migrarSchema(db: Client) {
  // DDL que só vai ao banco quando muda alguma coisa - ver `_schema.ts`.
  const ddl = await obterDdl(db);

  await ddl(`
    CREATE TABLE IF NOT EXISTS leads (
      id                  TEXT PRIMARY KEY,
      created_at          TEXT NOT NULL,
      cnpj_contratado     TEXT,
      nome_contratado     TEXT,
      situacao_contratado TEXT,
      cnpj_sacado         TEXT,
      nome_sacado         TEXT,
      situacao_sacado     TEXT,
      valor               TEXT,
      valor_numerico      REAL,
      prazo_limite        TEXT,
      decisions           TEXT,
      fim_type            INTEGER
    )
  `);
  try { await ddl(`ALTER TABLE leads ADD COLUMN parcelas TEXT`); } catch {}

  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_arquivos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      categoria      TEXT NOT NULL,
      nome           TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      tamanho        INTEGER NOT NULL,
      base64         TEXT NOT NULL
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS status_configs (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      nome  TEXT NOT NULL,
      cor   TEXT NOT NULL DEFAULT '#AAAAAA',
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS status_notificacoes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      status_id  INTEGER NOT NULL,
      usuario_id TEXT NOT NULL,
      UNIQUE(status_id, usuario_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS novo_lead_notificacoes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id TEXT NOT NULL UNIQUE
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_eventos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      status_id      INTEGER,
      descricao      TEXT,
      parent_id      INTEGER,
      criado_em      TEXT NOT NULL
    )
  `);
  // Migration: add parent_id if it doesn't exist yet
  try {
    await ddl(`ALTER TABLE lead_eventos ADD COLUMN parent_id INTEGER`);
  } catch (_) { /* already exists */ }

  await ddl(`
    CREATE TABLE IF NOT EXISTS cedentes (
      id        TEXT PRIMARY KEY,
      nome      TEXT NOT NULL,
      ativo     INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS sacados (
      id          TEXT PRIMARY KEY,
      cnpj_cpf    TEXT,
      razao_social TEXT,
      criado_em   TEXT NOT NULL
    )
  `);

  // Cedentes: migrate all new columns (safe - each is a no-op if already exists)
  const cedenteMigrations = [
    `ALTER TABLE cedentes ADD COLUMN cnpj_cpf TEXT`,
    `ALTER TABLE cedentes ADD COLUMN razao_social TEXT`,
    `ALTER TABLE cedentes ADD COLUMN status TEXT DEFAULT 'Ativo'`,
    `ALTER TABLE cedentes ADD COLUMN flags TEXT DEFAULT 'Regular'`,
    `ALTER TABLE cedentes ADD COLUMN origem TEXT`,
    `ALTER TABLE cedentes ADD COLUMN segmento TEXT`,
    `ALTER TABLE cedentes ADD COLUMN sub_segmento TEXT`,
    `ALTER TABLE cedentes ADD COLUMN origem_comercial TEXT`,
    `ALTER TABLE cedentes ADD COLUMN canal_aquisicao TEXT`,
    `ALTER TABLE cedentes ADD COLUMN parceiro INTEGER DEFAULT 0`,
    `ALTER TABLE cedentes ADD COLUMN natureza_juridica TEXT`,
    `ALTER TABLE cedentes ADD COLUMN valores_em_aberto REAL`,
    `ALTER TABLE cedentes ADD COLUMN limite_operacao REAL`,
    `ALTER TABLE cedentes ADD COLUMN rating REAL`,
    `ALTER TABLE cedentes ADD COLUMN obs TEXT`,
    `ALTER TABLE cedentes ADD COLUMN email TEXT`,
    `ALTER TABLE cedentes ADD COLUMN endereco_pj TEXT`,
    `ALTER TABLE cedentes ADD COLUMN nome_responsavel TEXT`,
    `ALTER TABLE cedentes ADD COLUMN email_responsavel TEXT`,
    `ALTER TABLE cedentes ADD COLUMN endereco_responsavel TEXT`,
    `ALTER TABLE cedentes ADD COLUMN cpf_responsavel TEXT`,
    `ALTER TABLE cedentes ADD COLUMN possui_escrow INTEGER DEFAULT 0`,
    `ALTER TABLE cedentes ADD COLUMN wpp_contato TEXT`,
    `ALTER TABLE cedentes ADD COLUMN conta_escrow TEXT`,
    `ALTER TABLE cedentes ADD COLUMN link_drive TEXT`,
    `ALTER TABLE leads ADD COLUMN cedente_id INTEGER`,
    `ALTER TABLE leads ADD COLUMN sacado_id INTEGER`,
    `ALTER TABLE sacados ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1`,
    // `cidade_estado` saiu daqui: a lista tinha o ADD e o DROP da mesma coluna,
    // então toda partida recriava e derrubava a coluna de novo, sem fim. A
    // coluna não deve existir, e não existe - nada a migrar.
    `ALTER TABLE leads ADD COLUMN liquidez TEXT`,
    // Auto-cadastro (onboarding self-service) - pipeline de aprovação.
    // ADD COLUMN com DEFAULT 'aprovado' marca todos os cedentes já existentes como aprovados.
    `ALTER TABLE cedentes ADD COLUMN aprovacao_status TEXT DEFAULT 'aprovado'`,
    `ALTER TABLE cedentes ADD COLUMN cadastro_extra TEXT`,
    `ALTER TABLE cedentes ADD COLUMN cadastro_movido_em TEXT`,
  ];
  for (const sql of cedenteMigrations) {
    try { await ddl(sql); } catch (_) {}
  }

  await ddl(`
    CREATE TABLE IF NOT EXISTS cedente_arquivos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cedente_id TEXT NOT NULL,
      nome       TEXT NOT NULL,
      tipo       TEXT NOT NULL,
      tamanho    INTEGER NOT NULL,
      base64     TEXT NOT NULL,
      criado_em  TEXT NOT NULL
    )
  `);
  // Categoria estruturada do documento do cedente (onboarding)
  try { await ddl(`ALTER TABLE cedente_arquivos ADD COLUMN categoria TEXT`); } catch {}

  // Pendências (checklist) do cadastro do cedente (onboarding)
  await ddl(`
    CREATE TABLE IF NOT EXISTS cedente_pendencias (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      cedente_id   TEXT NOT NULL,
      descricao    TEXT NOT NULL,
      categoria    TEXT,
      resolvida    INTEGER NOT NULL DEFAULT 0,
      criado_em    TEXT NOT NULL,
      resolvido_em TEXT
    )
  `);

  // Manageable option lists
  await ddl(`CREATE TABLE IF NOT EXISTS cedente_segmentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);
  await ddl(`CREATE TABLE IF NOT EXISTS cedente_sub_segmentos (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);
  await ddl(`CREATE TABLE IF NOT EXISTS cedente_origens_comerciais (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);
  await ddl(`CREATE TABLE IF NOT EXISTS cedente_canais_aquisicao (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE)`);

  // Seed option lists (no-op if already present due to UNIQUE constraint)
  const seedData: Array<[string, string[]]> = [
    ['cedente_segmentos', ['Consultoria','Eventos','Gamer','Logística','Marketing & Publicidade','Produção Audiovisual']],
    ['cedente_sub_segmentos', ['Agência','Agência de Atores','Autônomo','Consultoria Estratégica','Criador Individual','E-sports','Imprensa/PR','Infra de Eventos','Logística','Organização de Eventos','Produção Audiovisual','Produção Cultural','Produção de Eventos','Veículo de Mídia']],
    ['cedente_origens_comerciais', ['Indicação','Campanha']],
    ['cedente_canais_aquisicao', ['Instagram','WhatsApp','Site','E-mail','Parceiro']],
  ];
  // Uma consulta diz quais dessas listas ainda estão vazias; só elas são
  // semeadas. Antes eram 26 INSERT por partida, cada um contando com o UNIQUE
  // para falhar em silêncio - 26 idas ao banco para, no caso normal, não fazer
  // nada.
  const vazias = await db.execute(
    `SELECT ${seedData.map(([t]) => `(SELECT COUNT(*) FROM ${t}) AS ${t}`).join(', ')}`
  );
  for (const [table, values] of seedData) {
    if (Number((vazias.rows[0] as Record<string, any>)[table]) > 0) continue;
    for (const nome of values) {
      try { await db.execute({ sql: `INSERT INTO ${table} (nome) VALUES (?)`, args: [nome] }); } catch (_) {}
    }
  }

  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_etapa_arquivos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      status_id      INTEGER NOT NULL,
      nome           TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      tamanho        INTEGER NOT NULL,
      base64         TEXT NOT NULL,
      criado_em      TEXT NOT NULL
    )
  `);
  // Categoria do anexo (Lastro, Proposta, etc.) - em ambas as tabelas de arquivos
  try { await ddl(`ALTER TABLE lead_etapa_arquivos ADD COLUMN categoria TEXT`); } catch {}

  await ddl(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token      TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )
  `);
  // Dono da sessão. Fica nulo nas sessões abertas pela senha compartilhada, que
  // segue existindo como plano B - nesse caso a autoria é a da casa, não a de
  // uma pessoa (ver AUTOR_COMPARTILHADO).
  try { await ddl(`ALTER TABLE admin_sessions ADD COLUMN usuario_id TEXT`); } catch {}

  // Quem tem acesso ao painel. A linha nasce no primeiro login com o Google e é
  // atualizada a cada entrada; o e-mail (sempre minúsculo) é a identidade, já que
  // é ele que o ID token carrega. `papel` fica gravado desde já, mas nada ainda
  // lê dele: hoje todo mundo do domínio tem o mesmo acesso.
  await ddl(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      nome          TEXT NOT NULL,
      foto_url      TEXT,
      papel         TEXT NOT NULL DEFAULT 'membro',
      ativo         INTEGER NOT NULL DEFAULT 1,
      criado_em     TEXT NOT NULL,
      ultimo_acesso TEXT
    )
  `);

  await ensurePermissoesSchema(ddl);

  // Trilha de auditoria: uma linha por ação que grava algo, com quem fez. É o
  // registro que cobre o que não tem coluna de autoria própria (configurações,
  // notificações, anexos), então nenhuma alteração fica anônima.
  await ddl(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id    TEXT,
      usuario_nome  TEXT NOT NULL,
      usuario_email TEXT,
      acao          TEXT NOT NULL,
      alvo          TEXT,
      criado_em     TEXT NOT NULL
    )
  `);
  try { await ddl(`CREATE INDEX IF NOT EXISTS idx_auditoria_criado ON auditoria (criado_em DESC)`); } catch {}

  await ddl(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ip           TEXT NOT NULL,
      attempted_at TEXT NOT NULL
    )
  `);

  try { await ddl(`ALTER TABLE leads ADD COLUMN deleted_at TEXT`); } catch {}
  // Datas de execução, gravadas só pelo sistema e não pelo formulário:
  // `data_execucao` registra quando a operação foi de fato executada.
  try { await ddl(`ALTER TABLE leads ADD COLUMN previsao_execucao TEXT`); } catch {}
  try { await ddl(`ALTER TABLE leads ADD COLUMN data_execucao TEXT`); } catch {}



  // Migration: add is_conversion flag
  try {
    await ddl(`ALTER TABLE status_configs ADD COLUMN is_conversion INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* already exists */ }

  // Migration: add is_excluded flag
  try {
    await ddl(`ALTER TABLE status_configs ADD COLUMN is_excluded INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* already exists */ }

  // Migration: add requires_pendencia flag (etapa exige pendências ao receber um card)
  try {
    await ddl(`ALTER TABLE status_configs ADD COLUMN requires_pendencia INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* already exists */ }

  // Migration: add is_entrada flag (etapa que recebe os leads do formulário)
  try {
    await ddl(`ALTER TABLE status_configs ADD COLUMN is_entrada INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* already exists */ }

  // Última taxa mensal usada por cedente — o Gerador de Documentos pré-preenche a
  // taxa da próxima proposta do mesmo cedente. Chaveado só pelo cedente, como no
  // "DUX Gerador de Propostas" (lá era o taxa_historico.json).
  await ddl(`
    CREATE TABLE IF NOT EXISTS taxa_historico (
      cedente_cnpj  TEXT PRIMARY KEY,
      taxa_mensal   REAL NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);

  // Migration: add always_collapsed flag (etapa pontual - fica recolhida no kanban
  // mesmo tendo cards; a etapa vazia já recolhe por padrão)
  try {
    await ddl(`ALTER TABLE status_configs ADD COLUMN always_collapsed INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* already exists */ }

  // Pendências (checklist) de um lead - ex.: "Aprovado com Pendência"
  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_pendencias (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      descricao      TEXT NOT NULL,
      categoria      TEXT,
      resolvida      INTEGER NOT NULL DEFAULT 0,
      status_id      INTEGER,
      criado_em      TEXT NOT NULL,
      resolvido_em   TEXT
    )
  `);

  // Relatório DEPS (cedente/sacado) persistido por lead - gerado no módulo
  // de Análise de Crédito e acessível no balão da parte no card do lead.
  await ddl(`
    CREATE TABLE IF NOT EXISTS lead_deps (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      alvo           TEXT NOT NULL,
      nome           TEXT,
      documento      TEXT,
      norm_json      TEXT NOT NULL,
      criado_em      TEXT NOT NULL
    )
  `);
  // Payload BRUTO da consulta DEPS (~50-150 KB de JSON). O norm_json guarda só ~15
  // campos; o bruto é o que permite renderizar o relatório completo (todos os blocos)
  // e alimentar o parecer da IA sem uma nova consulta paga.
  try { await ddl(`ALTER TABLE lead_deps ADD COLUMN raw_json TEXT`); } catch {}

  // Data migration: strip hyphens from conta_escrow (idempotent)
  await db.execute(`UPDATE cedentes SET conta_escrow = REPLACE(conta_escrow, '-', '') WHERE conta_escrow IS NOT NULL AND conta_escrow LIKE '%-%'`);

  // Data migration: corrige "FIDIC" → "FIDC" na origem de liquidez (idempotente) - DUX-327
  await db.execute(`UPDATE leads SET liquidez = 'FIDC' WHERE liquidez = 'FIDIC'`);

  // Seed default statuses on first run
  const cnt = await db.execute('SELECT COUNT(*) as c FROM status_configs');
  if (Number(cnt.rows[0].c) === 0) {
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Em análise', '#FFB400', 1)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Documentação', '#0066CC', 2)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Aprovado', '#1E8A3E', 3)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Cancelado', '#D93025', 4)`);
  }

  // Notificações do pipeline de auto-cadastro de cedentes (mesma lógica dos leads).
  // Por etapa fixa (pendente/em_analise/aprovado/rejeitado):
  // No momento da submissão do formulário de cadastro:
  // Etapas configuráveis do pipeline de onboarding (auto-cadastro).
  // `chave` é o valor persistido em cedentes.aprovacao_status. As chaves
  // 'aprovado' e 'rejeitado' são âncoras semânticas protegidas (controlam o
  // acesso ao formulário público) - podem ser renomeadas/recoloridas/reordenadas,
  // mas não excluídas. Demais etapas são livres e contam como "em análise".
  // Cofre de credenciais de integração (chaves de API criptografadas em repouso).
  await ddl(`
    CREATE TABLE IF NOT EXISTS integration_credentials (
      chave      TEXT PRIMARY KEY,
      valor      TEXT NOT NULL,
      meta       TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  // Autoria nas entidades editáveis. Roda depois de todos os CREATE TABLE porque
  // é ALTER: cada uma guarda o id do usuário e uma cópia do nome. O id é a
  // referência; o nome é o que a tela mostra e continua legível mesmo que a
  // pessoa saia da empresa e o cadastro dela seja desativado. Linha gravada antes
  // do login individual fica com os dois nulos e aparece como "Sistema" na UI.
  const colunasAutoria: Array<[string, string[]]> = [
    ['lead_eventos',    ['autor_id TEXT', 'autor_nome TEXT']],
    ['leads',           ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['cedentes',               ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['sacados',                ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['lead_pendencias', ['criado_por_id TEXT', 'criado_por_nome TEXT', 'resolvido_por_id TEXT', 'resolvido_por_nome TEXT']],
  ];
  for (const [tabela, colunas] of colunasAutoria) {
    for (const coluna of colunas) {
      try { await ddl(`ALTER TABLE ${tabela} ADD COLUMN ${coluna}`); } catch {}
    }
  }

  // Projetos da casa. `responsavel_id` aponta para `usuarios`, e não guarda o
  // nome: assim renomear alguém se propaga, e desativar não deixa órfão visível.
  await ddl(`
    CREATE TABLE IF NOT EXISTS projetos (
      id                  TEXT PRIMARY KEY,
      codigo              TEXT UNIQUE,
      nome                TEXT NOT NULL,
      cliente_id          TEXT,
      tipo                TEXT,
      repositorio         TEXT,
      objetivo            TEXT,
      status              TEXT NOT NULL DEFAULT 'Em andamento',
      data_inicio         TEXT,
      previsao_entrega    TEXT,
      progresso           INTEGER NOT NULL DEFAULT 0,
      observacoes         TEXT,
      ativo               INTEGER NOT NULL DEFAULT 1,
      criado_em           TEXT NOT NULL,
      criado_por_id       TEXT,
      criado_por_nome     TEXT,
      atualizado_em       TEXT,
      atualizado_por_id   TEXT,
      atualizado_por_nome TEXT
    )
  `);

  // Colunas acrescentadas depois do primeiro desenho da tabela. O `ddl` só vai
  // ao banco quando muda algo, então repetir aqui não custa ida nenhuma.
  try { await ddl(`ALTER TABLE projetos ADD COLUMN tipo TEXT`); } catch { /* já existe */ }
  try { await ddl(`ALTER TABLE projetos ADD COLUMN repositorio TEXT`); } catch { /* já existe */ }

  // Clientes atendidos. Registro próprio, e não `cedentes`: aquele é cadastro de
  // crédito, com CNPJ e limite; aqui basta quem é o cliente do projeto.
  await ddl(`
    CREATE TABLE IF NOT EXISTS clientes (
      id        TEXT PRIMARY KEY,
      nome      TEXT NOT NULL UNIQUE,
      ativo     INTEGER NOT NULL DEFAULT 1,
      criado_em TEXT NOT NULL
    )
  `);

  // Equipe do projeto. Tabela de ligação com papel, e não colunas fixas de
  // gestor e devs: quem está no time e em que função é a mesma pergunta, e
  // separá-la em dois lugares obrigaria a mexer no schema a cada papel novo.
  // A chave é (projeto, usuário): a mesma pessoa não acumula dois papéis no
  // mesmo projeto.
  await ddl(`
    CREATE TABLE IF NOT EXISTS projeto_equipe (
      projeto_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      papel      TEXT NOT NULL DEFAULT 'Dev',
      PRIMARY KEY (projeto_id, usuario_id)
    )
  `);

  // Anexos do projeto. `etiqueta` classifica (proposta, contrato, slide...);
  // o arquivo vai em base64, igual aos anexos de cedente.
  await ddl(`
    CREATE TABLE IF NOT EXISTS projeto_arquivos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      projeto_id      TEXT NOT NULL,
      etiqueta        TEXT NOT NULL DEFAULT 'Documento',
      nome            TEXT NOT NULL,
      tipo            TEXT NOT NULL,
      tamanho         INTEGER NOT NULL,
      base64          TEXT NOT NULL,
      criado_em       TEXT NOT NULL,
      criado_por_nome TEXT
    )
  `);

  // Semente dos clientes: os mesmos que aparecem no carrossel da entrada.
  const cliCnt = await db.execute('SELECT COUNT(*) c FROM clientes');
  if (Number(cliCnt.rows[0].c) === 0) {
    const agora = new Date().toISOString();
    for (const nome of [
      '300 Franchising', 'Bitka Analytics', 'bip.', 'Cheirin Bão', 'Click!',
      'Consigo Cred', 'Grupo 3SA', 'J17 Bank', 'Prontomed', 'Shell', 'Vale',
    ]) {
      await db.execute({
        sql: 'INSERT OR IGNORE INTO clientes (id, nome, ativo, criado_em) VALUES (?,?,1,?)',
        args: [randomUUID(), nome, agora],
      });
    }
  }

  // Índices nas chaves estrangeiras. Sem eles, cada busca por `lead_id`
  // (etc.) vira full table scan: o board roda subqueries correlacionadas por
  // linha e cada abertura de detalhe varre as tabelas filhas inteiras, o que
  // dispara o "rows read" do Turso. Os índices transformam isso em busca direta.
  const indices = [
    // Cobre comentario_count, o MAX(id) de status_change do board e o detalhe.
    `CREATE INDEX IF NOT EXISTS idx_eventos_sol ON lead_eventos (lead_id, tipo, id)`,
    `CREATE INDEX IF NOT EXISTS idx_eventos_parent ON lead_eventos (parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_etapa_arq_sol ON lead_etapa_arquivos (lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sol_arq_sol ON lead_arquivos (lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pend_sol ON lead_pendencias (lead_id, resolvida)`,
    `CREATE INDEX IF NOT EXISTS idx_deps_sol ON lead_deps (lead_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_arq_ced ON cedente_arquivos (cedente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_pend_ced ON cedente_pendencias (cedente_id)`,
    // Autoria. A tela de Perfil filtra por pessoa (`autor_id`, `criado_por_id`,
    // `usuario_id`) e nenhum dos índices acima começa por essas colunas, então
    // cada contagem varria a tabela inteira. Índice por coluna consultada, e
    // não por coluna existente: autoria que ninguém filtra não ganha índice,
    // porque índice também custa em toda gravação.
    // `(autor_id, tipo)` serve as duas contagens de eventos: a de comentários
    // usa as duas colunas, a de eventos usa só o prefixo.
    `CREATE INDEX IF NOT EXISTS idx_eventos_autor ON lead_eventos (autor_id, tipo)`,
    `CREATE INDEX IF NOT EXISTS idx_sol_autor ON leads (criado_por_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_autor ON cedentes (criado_por_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pend_autor ON lead_pendencias (criado_por_id)`,
    // `(usuario_id, id DESC)` cobre a contagem e as últimas 15 ações no mesmo
    // índice - o ORDER BY sai de graça, sem passo de ordenação.
    `CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id, id DESC)`,
  ];
  for (const sql of indices) { try { await ddl(sql); } catch { /* tabela ainda não existe em algum estado - ignora */ } }


}

// Chaves protegidas: âncoras semânticas do gating público.
const CADASTRO_LOCKED_CHAVES = ['aprovado', 'rejeitado'];

/** Recusa das rotas de gestão de usuários. Mesma resposta na leitura e na escrita. */
const NEGADO_USUARIOS = {
  status: 403,
  body: { error: 'Somente o administrador do sistema gerencia usuários e acessos.' },
} as const;

// ── Quem está no painel ──────────────────────────────────────────────────────
//  A identidade vem do login com o Google (ver _google-auth.ts) e é gravada em
//  `usuarios`. A senha compartilhada continua funcionando como plano B, e a
//  sessão dela não tem dono: o que ela gravar fica carimbado como da casa, não
//  de uma pessoa.

export interface UsuarioAdmin {
  id: string;
  email: string;
  nome: string;
  foto_url: string | null;
  /** Sempre o papel *efetivo* - ver `_papeis.ts`, nunca o cru da coluna. */
  papel: Papel;
}

/** Autoria das sessões abertas pela senha compartilhada. */
export const AUTOR_COMPARTILHADO = 'Acesso compartilhado';

export interface SessaoAdmin {
  token: string;
  usuario: UsuarioAdmin | null;
}

/** Par [id, nome] para carimbar autoria. Sem usuário, o id fica nulo. */
export function autoriaDe(usuario?: UsuarioAdmin | null): [string | null, string] {
  return usuario ? [usuario.id, usuario.nome] : [null, AUTOR_COMPARTILHADO];
}

/** Autoria das mudanças que vêm do portal público de aceite, onde quem age é o
 *  sacado e não uma pessoa do painel. */
export const AUTOR_PORTAL = 'Portal de aceite';

/** Tabelas que guardam "quem mexeu por último". União de literais de propósito:
 *  o nome da tabela entra na SQL por interpolação e nunca pode vir de fora. */
export type TabelaComEdicao = 'leads' | 'cedentes' | 'sacados';

/**
 * Carimba "quem mexeu por último". Nunca derruba a ação que a chamou - autoria
 * perdida é ruim, gravação desfeita é pior.
 *
 * `autorNome` nulo é transição sem pessoa (expiração de prazo, rotina): a UI
 * mostra "Sistema", que é o mesmo que ela já faz para linha antiga sem autoria.
 */
export async function marcarEdicao(
  db: Client, tabela: TabelaComEdicao, id: string,
  autorId: string | null, autorNome: string | null, quando: string
): Promise<void> {
  try {
    await db.execute({
      sql: `UPDATE ${tabela} SET atualizado_por_id = ?, atualizado_por_nome = ?, atualizado_em = ? WHERE id = ?`,
      args: [autorId, autorNome, quando, id],
    });
  } catch (err) {
    console.error(`[autoria/${tabela}]`, (err as Error).message);
  }
}

/**
 * Nome de exibição a partir do que o Google devolve. É comum o perfil corporativo
 * trazer um sufixo de empresa ("Fulano de Tal | DUX"), e ele estraga as iniciais e
 * o nome curto - "DUX" viraria o sobrenome. Corta no primeiro separador; hífen
 * fica de fora de propósito, porque existe sobrenome com hífen.
 */
function nomeDeExibicao(nome: string, email: string): string {
  const limpo = String(nome ?? '').split(/[|•·]/)[0].replace(/\s+/g, ' ').trim();
  return limpo || email.split('@')[0];
}

function rowToUsuario(r: Record<string, any>): UsuarioAdmin {
  const email = String(r.email);
  return {
    id: String(r.id),
    email,
    nome: String(r.nome),
    foto_url: r.foto_url != null ? String(r.foto_url) : null,
    // Único ponto onde o papel entra no sistema, e ele passa pelo `papelEfetivo`:
    // o nível de admin sai do e-mail, não da coluna. Uma linha adulterada no
    // banco não vira admin, e o dono do painel é admin mesmo que a coluna esteja
    // atrasada (é o que segura o primeiro acesso, antes do próximo login gravar).
    papel: papelEfetivo(email, r.papel),
  };
}

/**
 * Grava (ou atualiza) o usuário a partir da conta Google já verificada. O e-mail
 * é a identidade; nome e foto são relidos do Google a cada entrada. Desativar a
 * linha (`ativo = 0`) tira o acesso sem depender do Workspace.
 *
 * `accessToken` é o do escopo `profile` que veio junto da entrada. Serve para
 * buscar a foto quando o ID token não trouxe `picture`, que é o caso do
 * Workspace daqui.
 */
export async function upsertUsuarioGoogle(
  db: Client,
  conta: { email: string; nome: string; foto: string | null },
  accessToken?: string | null
): Promise<UsuarioAdmin> {
  await ensureAdminSchema(db);
  const email = conta.email.toLowerCase();
  const agora = new Date().toISOString();

  // Falhar aqui não pode derrubar a entrada: sem foto o avatar cai nas iniciais
  // e a próxima entrada tenta de novo.
  let foto = conta.foto;
  if (!foto && accessToken) {
    try {
      foto = await fotoDoPerfilGoogle(accessToken, email);
    } catch (err) {
      console.warn('[upsertUsuarioGoogle] foto do Google:', (err as Error).message);
    }
  }

  // O papel gravado é acertado a cada entrada: o e-mail do dono vira 'admin' e
  // qualquer outra linha que esteja com 'admin' desce para 'master'. Quem manda
  // continua sendo o `papelEfetivo`; isso aqui só mantém a coluna coerente com
  // ele, para a tela de gestão não mostrar um nível que não vale.
  await db.execute({
    sql: `INSERT INTO usuarios (id, email, nome, foto_url, papel, ativo, criado_em, ultimo_acesso)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            nome = excluded.nome,
            -- COALESCE, e não sobrescrita: entrada que veio sem foto (Google fora
            -- do ar, escopo negado) não pode apagar a que já estava gravada.
            foto_url = COALESCE(excluded.foto_url, usuarios.foto_url),
            papel = CASE
                      WHEN usuarios.email = ? THEN 'admin'
                      WHEN usuarios.papel = 'admin' THEN 'master'
                      ELSE usuarios.papel
                    END,
            ultimo_acesso = excluded.ultimo_acesso`,
    args: [
      randomUUID(), email, nomeDeExibicao(conta.nome, email), foto,
      papelEfetivo(email, 'membro'), agora, agora,
      emailAdmin(),
    ],
  });
  const res = await db.execute({
    sql: 'SELECT id, email, nome, foto_url, papel, ativo FROM usuarios WHERE email = ?',
    args: [email],
  });
  const row = res.rows[0] as Record<string, any> | undefined;
  if (!row) throw new Error('usuário não gravado');
  if (!Number(row.ativo)) throw new Error(`usuário desativado: ${email}`);
  return rowToUsuario(row);
}

const PEOPLE_API = 'https://people.googleapis.com/v1/people/me?personFields=photos,emailAddresses';

/**
 * Foto do perfil do próprio usuário, lida na People API com o access token da
 * entrada. Serve para o Workspace que não expõe a claim `picture` no ID token:
 * como aqui é a pessoa pedindo o dado dela mesma, a política de visibilidade do
 * diretório não se aplica.
 *
 * O access token vem do navegador, então nada dele é confiável: a resposta só
 * vale se o e-mail do dono do token bater com o da sessão (senão dava para
 * colar a foto de outra conta no seu usuário), e a URL tem que ser do domínio
 * de imagens do Google. Devolve null quando a conta só tem o monograma gerado.
 */
async function fotoDoPerfilGoogle(accessToken: string, emailSessao: string): Promise<string | null> {
  const res = await fetch(PEOPLE_API, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`People API respondeu ${res.status}`);
  const dados = await res.json() as {
    photos?: Array<{ url?: string; default?: boolean; metadata?: { primary?: boolean } }>;
    emailAddresses?: Array<{ value?: string }>;
  };

  const emails = (dados.emailAddresses ?? []).map(e => String(e.value ?? '').toLowerCase());
  if (!emails.includes(emailSessao.toLowerCase())) throw new Error('token de outra conta Google');

  // `default: true` é o monograma que o Google desenha para quem não tem foto -
  // não adianta gravar, as nossas iniciais fazem o mesmo e herdam o tema.
  const fotos = (dados.photos ?? []).filter(f => typeof f.url === 'string' && !f.default);
  const url = (fotos.find(f => f.metadata?.primary) ?? fotos[0])?.url;
  if (!url) return null;

  const host = new URL(url).hostname;
  if (!host.endsWith('.googleusercontent.com')) throw new Error(`host inesperado: ${host}`);
  // Tamanho normalizado: a People API devolve com sufixo variável (=s100).
  return `${url.replace(/=s\d+(-c)?$/, '')}=s96-c`;
}

export async function createAdminSession(db: Client, usuarioId?: string | null): Promise<string> {
  await ensureAdminSchema(db);
  const token = randomUUID();
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await db.execute({ sql: 'DELETE FROM admin_sessions WHERE expires_at <= ?', args: [now] });
  await db.execute({
    sql: 'INSERT INTO admin_sessions (token, created_at, expires_at, usuario_id) VALUES (?, ?, ?, ?)',
    args: [token, now, exp, usuarioId ?? null],
  });
  return token;
}

/**
 * Sessão viva com o dono, ou null. Usuário desativado depois de entrar perde o
 * acesso na requisição seguinte - a sessão deixa de valer, não vira anônima.
 */
export async function getAdminSession(db: Client, token: string): Promise<SessaoAdmin | null> {
  await ensureAdminSchema(db);
  const now = new Date().toISOString();
  const res = await db.execute({
    sql: `SELECT s.token, s.usuario_id, u.id, u.email, u.nome, u.foto_url, u.papel, u.ativo
          FROM admin_sessions s
          LEFT JOIN usuarios u ON u.id = s.usuario_id
          WHERE s.token = ? AND s.expires_at > ?`,
    args: [token, now],
  });
  const row = res.rows[0] as Record<string, any> | undefined;
  if (!row) return null;
  // Sessão sem dono não vale mais nada: só a senha compartilhada criava dessas,
  // e ela foi removida em 28/08/2026. As que ainda estavam abertas caem aqui, na
  // requisição seguinte, em vez de seguirem gravando anônimo até expirar. É esta
  // linha que garante que não existe escrita sem pessoa - não a ausência do
  // formulário na tela.
  if (row.usuario_id == null) return null;
  if (row.id == null || !Number(row.ativo)) return null;
  return { token, usuario: rowToUsuario(row) };
}

export async function validateAdminSession(db: Client, token: string): Promise<boolean> {
  return (await getAdminSession(db, token)) !== null;
}

/**
 * Trilha de auditoria. Nunca derruba a requisição: o registro é importante, mas
 * não ao ponto de desfazer uma ação que já deu certo por causa dele.
 */
export async function registrarAuditoria(
  db: Client,
  usuario: UsuarioAdmin | null | undefined,
  acao: string,
  alvo?: string | null
): Promise<void> {
  try {
    await db.execute({
      sql: 'INSERT INTO auditoria (usuario_id, usuario_nome, usuario_email, acao, alvo, criado_em) VALUES (?, ?, ?, ?, ?, ?)',
      args: [
        usuario?.id ?? null,
        usuario?.nome ?? AUTOR_COMPARTILHADO,
        usuario?.email ?? null,
        acao,
        alvo ?? null,
        new Date().toISOString(),
      ],
    });
  } catch (err) {
    console.error('[auditoria]', acao, (err as Error).message);
  }
}

export async function deleteAdminSession(db: Client, token: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM admin_sessions WHERE token = ?', args: [token] });
}

const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_MAX = 5;

export async function checkLoginRateLimit(db: Client, ip: string): Promise<boolean> {
  await ensureAdminSchema(db);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  // Clean up old attempts opportunistically
  await db.execute({ sql: 'DELETE FROM login_attempts WHERE attempted_at <= ?', args: [since] });
  const res = await db.execute({
    sql: 'SELECT COUNT(*) as c FROM login_attempts WHERE ip = ? AND attempted_at > ?',
    args: [ip, since],
  });
  return Number(res.rows[0].c) >= RATE_MAX;
}

export async function recordFailedLogin(db: Client, ip: string): Promise<void> {
  await db.execute({
    sql: 'INSERT INTO login_attempts (ip, attempted_at) VALUES (?, ?)',
    args: [ip, new Date().toISOString()],
  });
}

export async function clearLoginAttempts(db: Client, ip: string): Promise<void> {
  await db.execute({ sql: 'DELETE FROM login_attempts WHERE ip = ?', args: [ip] });
}

/**
 * Etapa de entrada do pipeline de leads: a marcada com `is_entrada` nas
 * Configurações → Etapas. Sem marcação (ou se a etapa marcada foi excluída),
 * cai na primeira etapa ativa por ordem - o comportamento antigo.
 */
export async function getEntryStatusId(db: Client): Promise<number | null> {
  const marked = await db.execute(
    `SELECT id FROM status_configs WHERE ativo = 1 AND is_entrada = 1 ORDER BY ordem ASC LIMIT 1`
  );
  if (marked.rows.length > 0) return Number(marked.rows[0].id);
  const first = await db.execute(
    `SELECT id FROM status_configs WHERE ativo = 1 ORDER BY ordem ASC LIMIT 1`
  );
  return first.rows.length > 0 ? Number(first.rows[0].id) : null;
}

export async function healOrphanedCards(db: Client) {
  try {
    const targetId = await getEntryStatusId(db);
    if (targetId === null) return;
    const now = new Date().toISOString();
    const orphans = await db.execute(`
      SELECT s.id
      FROM leads s
      INNER JOIN (
        SELECT e.lead_id, e.status_id
        FROM lead_eventos e
        WHERE e.tipo = 'status_change'
          AND e.id = (
            SELECT MAX(e2.id) FROM lead_eventos e2
            WHERE e2.lead_id = e.lead_id AND e2.tipo = 'status_change'
          )
      ) curr ON curr.lead_id = s.id
      LEFT JOIN status_configs sc ON sc.id = curr.status_id AND sc.ativo = 1
      WHERE sc.id IS NULL
    `);
    for (const row of orphans.rows) {
      await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em)
              VALUES (?, 'status_change', ?, 'Reagrupado após exclusão de etapa', ?)`,
        args: [row.id, targetId, now],
      });
    }
  } catch (_) { /* non-fatal */ }
}

/**
 * A inscrição recém-criada, já com nome e e-mail resolvidos.
 *
 * A tabela guarda só `usuario_id`; a UI precisa do nome para desenhar a linha
 * sem uma segunda ida ao servidor.
 */
async function inscritoCriado(db: Client, id: number, usuarioId: string) {
  const u = await db.execute({ sql: 'SELECT nome, email FROM usuarios WHERE id = ?', args: [usuarioId] });
  const row = u.rows[0];
  return {
    id,
    usuario_id: usuarioId,
    usuario_nome: String(row?.nome ?? ''),
    usuario_email: String(row?.email ?? ''),
  };
}

export async function getNovaSubmissaoRecipients(db: Client): Promise<string[]> {
  await ensureAdminSchema(db);
  return (await emailsDosInscritos(db, 'novo_lead_notificacoes')).map(u => u.email);
}


async function notifyMentions(texto: string, leadId: string, db: Client) {
  // O ponto faz parte do apelido ("guilherme.zaidan"), então [\w.]+ e não \w+.
  const apelidos = [...new Set((texto.match(/@([\w.]+)/g) ?? []).map(m => m.slice(1)))];
  if (apelidos.length === 0) return;

  const sol = await db.execute({
    sql: 'SELECT nome_contratado FROM leads WHERE id = ?',
    args: [leadId],
  });
  const nomeSol = String(sol.rows[0]?.nome_contratado ?? leadId);

  for (const apelido of apelidos) {
    // O apelido casa com a parte local do e-mail: @guilherme.zaidan encontra
    // guilherme.zaidan@dominio. É o mesmo critério que a UI usa para sugerir.
    const u = await db.execute({
      sql: 'SELECT email, nome FROM usuarios WHERE ativo = 1 AND lower(email) LIKE ? LIMIT 1',
      args: [`${apelido.toLowerCase()}@%`],
    });
    const dest = u.rows[0];
    if (!dest) { console.warn('[mention-notify] sem usuário para o apelido:', apelido); continue; }
    notifyEmail(String(dest.email), 'Você foi mencionado em um comentário', `
  <p style="font-size:14px;color:#555;margin:0 0 6px"><strong>Lead:</strong> ${esc(nomeSol)}</p>
  <blockquote style="margin:12px 0 0;padding:10px 14px;background:#F7F6F3;border-left:3px solid #00C9A7;border-radius:0 8px 8px 0;font-size:14px;color:#333">${esc(texto)}</blockquote>`);
  }
}

async function notifyStageMentions(texto: string, leadId: string, db: Client) {
  const stageNames = [...new Set((texto.match(/#\[([^\]]+)\]/g) ?? []).map(m => m.slice(2, -1)))];
  if (stageNames.length === 0) return;

  console.log('[stage-notify] stage mentions detected:', stageNames);

  const sol = await db.execute({
    sql: 'SELECT nome_contratado FROM leads WHERE id = ?',
    args: [leadId],
  });
  const nomeSol = String(sol.rows[0]?.nome_contratado ?? leadId);

  for (const stageName of stageNames) {
    const statusResult = await db.execute({
      sql: 'SELECT id FROM status_configs WHERE nome = ? AND ativo = 1 LIMIT 1',
      args: [stageName],
    });
    if (statusResult.rows.length === 0) { console.warn('[stage-notify] no status found for:', stageName); continue; }
    const statusId = statusResult.rows[0].id;

    const inscritos = await emailsDosInscritos(db, 'status_notificacoes', { coluna: 'status_id', valor: statusId });
    if (inscritos.length === 0) { console.log('[stage-notify] sem inscritos na etapa:', stageName); continue; }

    for (const dest of inscritos) {
      notifyEmail(dest.email, `A etapa "${stageName}" foi mencionada em um comentário`, `
  <p style="font-size:14px;color:#555;margin:0 0 6px"><strong>Lead:</strong> ${esc(nomeSol)}</p>
  <blockquote style="margin:12px 0 0;padding:10px 14px;background:#F7F6F3;border-left:3px solid #00C9A7;border-radius:0 8px 8px 0;font-size:14px;color:#333">${esc(texto)}</blockquote>`);
    }
  }
}

/** Escapa o que vai para dentro do HTML do e-mail. */
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Moldura única dos e-mails de notificação, no acento da casa. */
function layoutEmail(titulo: string, corpo: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#121316;background:#F7F6F3;padding:32px 0;margin:0">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 28px 24px">
  <div style="height:4px;width:34px;border-radius:2px;background:#00C9A7;margin-bottom:18px"></div>
  <h1 style="font-size:18px;font-weight:800;margin:0 0 14px">${esc(titulo)}</h1>
  ${corpo}
  <p style="font-size:11px;color:#9A958A;margin:22px 0 0">Portal Sheep - você recebe este aviso porque está inscrito nesta notificação.</p>
</div>
</body></html>`;
}

/**
 * Envia um e-mail pelo Resend.
 *
 * Falhar aqui é sempre não-fatal: notificação é efeito colateral, e perder uma
 * não pode derrubar a ação que a disparou (mover etapa, comentar, cadastrar).
 * Sem `RESEND_API_KEY` ou `RESEND_FROM_EMAIL` a função simplesmente não envia.
 */
async function notifyEmail(to: string, assunto: string, corpo: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from || !to) return;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject: assunto, html: layoutEmail(assunto, corpo) }),
    });
    if (!r.ok) console.error('[notify-email]', to, await r.text().catch(() => ''));
  } catch (e) {
    console.error('[notify-email]', (e as Error).message);
  }
}

/**
 * E-mails dos inscritos numa lista de notificação.
 *
 * O e-mail sai sempre de `usuarios`, nunca de cópia guardada na tabela de
 * inscrição: usuário desativado (`ativo = 0`) para de receber sem precisar
 * limpar inscrição nenhuma.
 */
async function emailsDosInscritos(
  db: Client, tabela: 'status_notificacoes' | 'novo_lead_notificacoes',
  filtro?: { coluna: 'status_id'; valor: unknown },
): Promise<{ email: string; nome: string }[]> {
  const r = await db.execute({
    sql: `SELECT u.email, u.nome FROM ${tabela} n
          JOIN usuarios u ON u.id = n.usuario_id
          WHERE u.ativo = 1${filtro ? ` AND n.${filtro.coluna} = ?` : ''}`,
    args: filtro ? [filtro.valor as any] : [],
  });
  return r.rows.map(x => ({ email: String(x.email), nome: String(x.nome) }));
}

// ── Busca rápida (⌘K) ────────────────────────────────────────────────────────
// SQLite não faz collation acento-insensível, então dobramos os acentos na mão
// (colunas e termo passam pela mesma normalização).
const ACENTOS: [string, string][] = [
  ['á','a'],['à','a'],['â','a'],['ã','a'],['ä','a'],
  ['é','e'],['è','e'],['ê','e'],['ë','e'],
  ['í','i'],['ì','i'],['î','i'],['ï','i'],
  ['ó','o'],['ò','o'],['ô','o'],['õ','o'],['ö','o'],
  ['ú','u'],['ù','u'],['û','u'],['ü','u'],
  ['ç','c'],['ñ','n'],
];

/** Pontuação ignorada na comparação de nomes - "J.B. Comércio" casa com "JB Comercio". */
const PONTUACAO = ["'.'", "','", "'-'", "'/'", "'('", "')'", "''''", "':'", "';'", "'_'"];

/**
 * Expressão SQL que devolve a coluna dobrada para comparação: minúscula, sem
 * acentos, sem pontuação e sem espaços repetidos (tirar a pontuação pode deixar
 * dois espaços no lugar dela).
 */
function sqlFold(col: string): string {
  let e = `LOWER(COALESCE(${col},''))`;
  e = ACENTOS.reduce((acc, [de, para]) => `REPLACE(${acc},'${de}','${para}')`, e);
  e = PONTUACAO.reduce((acc, ch) => `REPLACE(${acc},${ch},'')`, e);
  for (let i = 0; i < 3; i++) e = `REPLACE(${e},'  ',' ')`;
  return `TRIM(${e})`;
}

/** Expressão SQL que mantém só os dígitos de um documento mascarado. */
function sqlDigits(col: string): string {
  return ["'.'", "'-'", "'/'", "' '", "'('", "')'"].reduce(
    (acc, ch) => `REPLACE(${acc},${ch},'')`, `COALESCE(${col},'')`
  );
}

/** Mesma dobra do sqlFold, aplicada ao termo digitado. */
function foldTerm(s: string): string {
  const semAcento = ACENTOS.reduce((acc, [de, para]) => acc.split(de).join(para), s.toLowerCase());
  return semAcento.replace(/[.,/()':;_-]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Identificador do que a ação mexeu, para a linha de auditoria ficar rastreável.
 * Numa criação o id ainda não existe no pedido, então vem da resposta.
 */
function alvoDaAcao(body: any, resposta: any): string | null {
  const alvo = body?.id ?? body?.lead_id ?? body?.cedente_id ?? body?.analise_id ??
               body?.status_id ?? body?.sacado_id ?? body?.chave ??
               body?.usuario_id ?? body?.papel ??
               resposta?.id ?? resposta?.submission?.id ?? resposta?.cedente?.id ??
               resposta?.sacado?.id ?? resposta?.operacao?.id ?? resposta?.status?.id;
  return alvo != null && alvo !== '' ? String(alvo) : null;
}

export async function handleAdminData(
  method: string,
  query: URLSearchParams,
  body: any,
  db: Client,
  usuario?: UsuarioAdmin | null
): Promise<{ status: number; body: any }> {
  const resultado = await despacharAdminData(method, query, body, db, usuario);
  // Toda ação que gravou alguma coisa deixa registro de quem fez. Fica fora do
  // despacho de propósito: assim nenhuma ação nova nasce sem auditoria.
  if (method === 'POST' && resultado.status < 400) {
    const acao = String(body?.action ?? '');
    if (acao) await registrarAuditoria(db, usuario, acao, alvoDaAcao(body, resultado.body));
  }
  return resultado;
}

async function despacharAdminData(
  method: string,
  query: URLSearchParams,
  body: any,
  db: Client,
  usuario?: UsuarioAdmin | null
): Promise<{ status: number; body: any }> {
  await ensureAdminSchema(db);
  // Autoria a carimbar nas gravações desta requisição.
  const [autorId, autorNome] = autoriaDe(usuario);

  // ── Porteiro ──────────────────────────────────────────────────────────────
  // Uma checagem, antes de qualquer despacho: é aqui que a matriz de permissões
  // do papel `membro` vale de verdade. Fica fora do corpo das ações de propósito,
  // como a auditoria - assim nenhuma ação nova nasce sem porteiro, e ação que
  // ninguém mapeou é recusada em vez de liberada por esquecimento
  // (`scripts/check-permissoes.mjs` acusa a que faltar).
  const acaoPedida = method === 'GET' ? String(query.get('action') ?? '') : String(body?.action ?? '');
  const permissoes = await permissoesDoUsuario(db, usuario);
  if (acaoPedida) {
    const exigida = PERMISSAO_DA_ACAO[acaoPedida];
    if (exigida === SO_ADMIN) {
      if (!podeGerenciarUsuarios(usuario)) return NEGADO_USUARIOS;
    } else if (exigida !== LIVRE && !podeAcao(permissoes, acaoPedida)) {
      return negado(exigida);
    }
  }

  // ── GET ──────────────────────────────────────────────
  if (method === 'GET') {
    const action = query.get('action');

    // Quem está logado nesta sessão. `usuario` nulo = entrou pela senha
    // compartilhada, e a UI mostra isso em vez de inventar uma pessoa.
    if (action === 'me') {
      // `permissoes` acompanha a identidade para a tela não oferecer o que o
      // servidor vai recusar. `'*'` = pode tudo (master, admin, ou papel cuja
      // matriz nunca foi configurada).
      return {
        status: 200,
        body: {
          usuario: usuario ?? null,
          autor: autorNome,
          permissoes: permissoes === TUDO_PERM ? '*' : [...permissoes],
        },
      };
    }

    // Página de Perfil: os dados do usuário da sessão mais o retrato do que ele
    // já fez. Cada um só enxerga a si mesmo - não é tela de administração de
    // usuários, e o id vem da sessão, nunca da query.
    if (action === 'perfil') {
      if (!usuario) return { status: 200, body: { usuario: null } };
      const conta = (sql: string) => db.execute({ sql, args: [usuario.id] });
      const [linha, comentarios, eventos, leads, cedentes, pendencias, acoes, ultimas] = await Promise.all([
        conta('SELECT id, email, nome, foto_url, papel, criado_em, ultimo_acesso FROM usuarios WHERE id = ?'),
        conta("SELECT COUNT(*) c FROM lead_eventos WHERE autor_id = ? AND tipo = 'comentario'"),
        conta('SELECT COUNT(*) c FROM lead_eventos WHERE autor_id = ?'),
        conta('SELECT COUNT(*) c FROM leads WHERE criado_por_id = ?'),
        conta('SELECT COUNT(*) c FROM cedentes WHERE criado_por_id = ?'),
        // Só conta o que foi aberto depois que a coluna passou a ser gravada:
        // pendência anterior a isso tem o nome, mas não o id.
        conta('SELECT COUNT(*) c FROM lead_pendencias WHERE criado_por_id = ?'),
        conta('SELECT COUNT(*) c FROM auditoria WHERE usuario_id = ?'),
        conta('SELECT acao, alvo, criado_em FROM auditoria WHERE usuario_id = ? ORDER BY id DESC LIMIT 15'),
      ]);
      const n = (r: { rows: any[] }) => Number(r.rows[0]?.c ?? 0);
      return {
        status: 200,
        body: {
          usuario: linha.rows[0] ?? null,
          resumo: {
            comentarios: n(comentarios), eventos: n(eventos), leads: n(leads),
            cedentes: n(cedentes), pendencias: n(pendencias), acoes: n(acoes),
          },
          ultimas_acoes: ultimas.rows,
        },
      };
    }

    // Catálogo de permissões + a matriz salva do papel. A tela desenha os
    // checkboxes a partir daqui, e não de uma cópia própria: assim não existe
    // checkbox sem permissão real nem permissão sem checkbox.
    if (action === 'permissoes') {
      if (!podeGerenciarUsuarios(usuario)) return NEGADO_USUARIOS;
      const matriz = await matrizDoPapel(db, 'membro');
      return {
        status: 200,
        body: {
          catalogo: CATALOGO,
          papel: 'membro',
          // Papel nunca configurado: a tela mostra tudo marcado, que é o que
          // vale na prática até o primeiro salvamento.
          concedidas: matriz.configurado ? matriz.chaves : [...CHAVES_TODAS],
          configurado: matriz.configurado,
          atualizado_em: matriz.atualizado_em,
          atualizado_por_nome: matriz.atualizado_por_nome,
        },
      };
    }

    // Lista enxuta para o seletor de destinatários de notificação. Separada da
    // ação `usuarios`, que é exclusiva do dono do painel: escolher quem recebe
    // aviso não exige poder gerenciar gente, só chegar em Configurações.
    if (action === 'usuarios_notificaveis') {
      const r = await db.execute(`
        SELECT id, nome, email, foto_url FROM usuarios
        WHERE ativo = 1 ORDER BY nome
      `);
      return { status: 200, body: { usuarios: r.rows } };
    }

    // Gestão de usuários: a lista inteira, com papel, acesso e sessões abertas.
    // Só o dono do painel enxerga - ver `podeGerenciarUsuarios`.
    if (action === 'usuarios') {
      if (!podeGerenciarUsuarios(usuario)) return NEGADO_USUARIOS;
      const agora = new Date().toISOString();
      const [lista, sessoes] = await Promise.all([
        // A ordem final é dada em JS, pelo papel *efetivo* - ver o sort abaixo.
        // Aqui fica só o critério de desempate, que o banco resolve de graça.
        db.execute(`
          SELECT id, email, nome, foto_url, papel, ativo, criado_em, ultimo_acesso
          FROM usuarios
          ORDER BY ativo DESC, ultimo_acesso DESC, nome
        `),
        // Quem está com o painel aberto agora. Uma pessoa pode ter mais de uma
        // sessão viva (outro navegador, outro computador), daí o COUNT.
        db.execute({
          sql: `SELECT usuario_id, COUNT(*) c FROM admin_sessions
                WHERE expires_at > ? AND usuario_id IS NOT NULL GROUP BY usuario_id`,
          args: [agora],
        }),
      ]);
      const abertas = new Map(sessoes.rows.map(r => [String(r.usuario_id), Number(r.c)]));
      const usuarios = lista.rows.map(r => {
        const email = String(r.email);
        return {
          id: String(r.id),
          email,
          nome: String(r.nome),
          foto_url: r.foto_url != null ? String(r.foto_url) : null,
          papel: papelEfetivo(email, r.papel),
          ativo: Number(r.ativo) === 1,
          criado_em: String(r.criado_em ?? ''),
          ultimo_acesso: r.ultimo_acesso != null ? String(r.ultimo_acesso) : null,
          sessoes_abertas: abertas.get(String(r.id)) ?? 0,
        };
      });
      // Admin no topo, depois Master, depois Membro. A ordenação é aqui, e não
      // no ORDER BY, porque quem manda é o papel efetivo (que sai do e-mail) e
      // não a coluna - ela só se acerta na entrada seguinte da pessoa. Dentro de
      // cada papel, quem perdeu o acesso desce, e o resto vem do SQL: último
      // acesso mais recente primeiro, nome como desempate. O `sort` do JS é
      // estável, então essa ordem de base é preservada.
      usuarios.sort((a, b) =>
        ordemPapel(a.papel) - ordemPapel(b.papel) ||
        Number(b.ativo) - Number(a.ativo)
      );
      return { status: 200, body: { usuarios, admin_email: emailAdmin() } };
    }

    if (action === 'board') {
      // Paraleliza as duas consultas - cada round-trip ao banco custa latência
      const [statuses, subs] = await Promise.all([
      db.execute(
        'SELECT * FROM status_configs WHERE ativo = 1 ORDER BY ordem'
      ),
      db.execute(`
        SELECT
          s.id, s.created_at,
          COALESCE(ced.razao_social, ced.nome, NULLIF(TRIM(s.nome_contratado), '')) AS nome_contratado,
          COALESCE(ced.cnpj_cpf, NULLIF(TRIM(s.cnpj_contratado), '')) AS cnpj_contratado,
          COALESCE(sac.razao_social, NULLIF(TRIM(s.nome_sacado), '')) AS nome_sacado,
          COALESCE(sac.cnpj_cpf, NULLIF(TRIM(s.cnpj_sacado), '')) AS cnpj_sacado,
          s.cedente_id, s.sacado_id,
          s.valor, s.valor_numerico, s.prazo_limite, s.fim_type,
          s.previsao_execucao, s.data_execucao,
          COUNT(DISTINCT a.id) + (SELECT COUNT(*) FROM lead_etapa_arquivos ea WHERE ea.lead_id = s.id) AS arquivo_count,
          (SELECT COUNT(*) FROM lead_eventos c WHERE c.lead_id = s.id AND c.tipo = 'comentario') AS comentario_count,
          (SELECT COUNT(*) FROM lead_pendencias p WHERE p.lead_id = s.id AND p.resolvida = 0) AS pendencia_aberta_count,
          (SELECT COUNT(*) FROM lead_pendencias p WHERE p.lead_id = s.id) AS pendencia_total_count,
          curr.status_id AS current_status_id,
          curr.criado_em  AS status_since
        FROM leads s
        LEFT JOIN cedentes ced ON ced.id = s.cedente_id
        LEFT JOIN sacados sac ON sac.id = s.sacado_id
        LEFT JOIN lead_arquivos a ON a.lead_id = s.id
        LEFT JOIN (
          SELECT e.lead_id, e.status_id, e.criado_em
          FROM lead_eventos e
          WHERE e.tipo = 'status_change'
            AND e.id = (
              SELECT MAX(e2.id) FROM lead_eventos e2
              WHERE e2.lead_id = e.lead_id AND e2.tipo = 'status_change'
            )
        ) curr ON curr.lead_id = s.id
        WHERE s.deleted_at IS NULL
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `),
      ]);
      return { status: 200, body: { statuses: statuses.rows, submissions: subs.rows } };
    }

    // Busca rápida global (⌘K): cards de leads + cadastros de onboarding.
    // Casa por nome/razão social, CNPJ/CPF (com ou sem máscara), e-mail e id do card.
    if (action === 'quick_search') {
      const raw = (query.get('q') ?? '').trim();
      if (raw.length < 2) return { status: 200, body: { leads: [] } };

      // A busca é livre para qualquer sessão, mas o resultado não: quem não
      // enxerga o kanban não pode achar cards dele por aqui. Sem este filtro a
      // busca rápida seria a porta dos fundos das duas páginas.
      const veLeads = pode(permissoes, 'leads:ver');
      if (!veLeads) return { status: 200, body: { leads: [] } };

      const term = `%${foldTerm(raw)}%`;
      const digits = raw.replace(/\D/g, '');
      const digitTerm = digits.length >= 3 ? `%${digits}%` : null;
      const LIMIT = 8;

      const solCond = [
        `${sqlFold('x.nome_contratado')} LIKE ?`,
        `${sqlFold('x.nome_sacado')} LIKE ?`,
        // O id também passa pela dobra: o uuid colado com ou sem os hífens casa igual.
        `${sqlFold('x.id')} LIKE ?`,
      ];
      const solArgs: any[] = [term, term, term];
      if (digitTerm) {
        solCond.push(`${sqlDigits('x.cnpj_contratado')} LIKE ?`, `${sqlDigits('x.cnpj_sacado')} LIKE ?`);
        solArgs.push(digitTerm, digitTerm);
      }


      const [sols] = await Promise.all([
        db.execute({
          sql: `
            SELECT x.id, x.created_at, x.valor, x.nome_contratado, x.cnpj_contratado,
                   x.nome_sacado, x.cnpj_sacado, x.status_nome, x.status_cor
            FROM (
              SELECT
                s.id, s.created_at, s.valor, s.deleted_at,
                COALESCE(ced.razao_social, ced.nome, NULLIF(TRIM(s.nome_contratado), '')) AS nome_contratado,
                COALESCE(ced.cnpj_cpf, NULLIF(TRIM(s.cnpj_contratado), '')) AS cnpj_contratado,
                COALESCE(sac.razao_social, NULLIF(TRIM(s.nome_sacado), '')) AS nome_sacado,
                COALESCE(sac.cnpj_cpf, NULLIF(TRIM(s.cnpj_sacado), '')) AS cnpj_sacado,
                st.nome AS status_nome, st.cor AS status_cor
              FROM leads s
              LEFT JOIN cedentes ced ON ced.id = s.cedente_id
              LEFT JOIN sacados sac ON sac.id = s.sacado_id
              LEFT JOIN (
                SELECT e.lead_id, e.status_id
                FROM lead_eventos e
                WHERE e.tipo = 'status_change'
                  AND e.id = (
                    SELECT MAX(e2.id) FROM lead_eventos e2
                    WHERE e2.lead_id = e.lead_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.lead_id = s.id
              LEFT JOIN status_configs st ON st.id = curr.status_id
            ) x
            WHERE x.deleted_at IS NULL AND (${solCond.join(' OR ')})
            ORDER BY x.created_at DESC
            LIMIT ${LIMIT}
          `,
          args: solArgs,
        }),
      ]);

      return {
        status: 200,
        body: {
          leads: sols.rows,
        },
      };
    }

    if (action === 'status_configs') {
      const [statuses, notifs] = await Promise.all([
        db.execute('SELECT * FROM status_configs WHERE ativo = 1 ORDER BY ordem'),
        db.execute(`SELECT n.*, u.nome AS usuario_nome, u.email AS usuario_email
                     FROM status_notificacoes n JOIN usuarios u ON u.id = n.usuario_id
                     ORDER BY u.nome`),
      ]);
      const result = statuses.rows.map(s => ({
        ...s,
        notificacoes: notifs.rows.filter(n => Number(n.status_id) === Number(s.id)),
      }));
      return { status: 200, body: { statuses: result } };
    }

    if (action === 'status_card_count') {
      const statusId = query.get('status_id');
      // Count cards whose latest status_change points to this stage (active or inactive)
      const r = await db.execute({
        sql: `SELECT COUNT(*) as count FROM leads s
              INNER JOIN (
                SELECT e.lead_id FROM lead_eventos e
                WHERE e.tipo = 'status_change' AND CAST(e.status_id AS TEXT) = CAST(? AS TEXT)
                  AND e.id = (
                    SELECT MAX(e2.id) FROM lead_eventos e2
                    WHERE e2.lead_id = e.lead_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.lead_id = s.id
              WHERE s.deleted_at IS NULL`,
        args: [statusId],
      });
      return { status: 200, body: { count: Number(r.rows[0]?.count ?? 0) } };
    }

    // Credenciais da DEPS vivem em variáveis de ambiente - a UI
    // só reflete o que está configurado; o segredo nunca sai do servidor.
    if (action === 'deps_config') {
      const email = process.env.DEPS_EMAIL ?? '';
      const senha = process.env.DEPS_SENHA ?? '';
      return {
        status: 200,
        body: {
          has_credentials: !!(email && senha),
          email,
          produto_pj: process.env.DEPS_PRODUTO_PJ ?? '',
          produto_pf: process.env.DEPS_PRODUTO_PF ?? '',
        },
      };
    }

    // Histórico de análises de crédito. Filtros opcionais: q (cedente/sacado/
    // protocolo), status, de/ate (data ISO yyyy-mm-dd). Sem snapshot - a lista
    // só precisa dos campos de prateleira.
    // Relatórios DEPS (cedente/sacado) salvos de um lead - para o link no balão.
    if (action === 'deps_by_lead') {
      const sid = query.get('lead_id');
      if (!sid) return { status: 400, body: { error: 'lead_id required' } };
      // Mais recente por alvo (agrupa por alvo, pega o maior id).
      const r = await db.execute({
        sql: `SELECT d.alvo, d.nome, d.documento, d.norm_json, d.raw_json, d.criado_em
              FROM lead_deps d
              WHERE d.lead_id = ? AND d.id = (
                SELECT MAX(d2.id) FROM lead_deps d2 WHERE d2.lead_id = d.lead_id AND d2.alvo = d.alvo
              )`,
        args: [sid],
      });
      const deps: Record<string, any> = {};
      for (const row of r.rows as any[]) {
        let norm = null; try { norm = JSON.parse(String(row.norm_json)); } catch { /* ignore */ }
        // raw_json é opcional: registros gravados antes da migração não têm o bruto.
        let raw = null; try { raw = row.raw_json ? JSON.parse(String(row.raw_json)) : null; } catch { /* ignore */ }
        if (norm) deps[String(row.alvo)] = { nome: row.nome, documento: row.documento, norm, raw, criado_em: row.criado_em };
      }
      return { status: 200, body: { deps } };
    }

    // Pendências de um lead (leve) - usada ao mover no board para pré-preencher
    // o modal de "Registrar pendências" com as pendências já existentes.
    if (action === 'pendencias_by_lead') {
      const sid = query.get('lead_id');
      if (!sid) return { status: 400, body: { error: 'lead_id required' } };
      const r = await db.execute({
        sql: 'SELECT id, descricao, categoria, resolvida FROM lead_pendencias WHERE lead_id = ? ORDER BY resolvida ASC, criado_em ASC',
        args: [sid],
      });
      return { status: 200, body: { pendencias: r.rows } };
    }

    // Detalhe de uma análise - inclui snapshot e parecer da IA (reimpressão)
    // ── Projetos ──────────────────────────────────────────────────────────
    if (action === 'projetos') {
      const [projs, equipe, arqs, clientes] = await Promise.all([
        db.execute(`
          SELECT p.*, c.nome AS cliente_nome
          FROM projetos p
          LEFT JOIN clientes c ON c.id = p.cliente_id
          WHERE p.ativo = 1
          ORDER BY p.criado_em DESC
        `),
        db.execute(`
          SELECT e.projeto_id, e.usuario_id, e.papel, u.nome, u.email
          FROM projeto_equipe e JOIN usuarios u ON u.id = e.usuario_id
          ORDER BY u.nome
        `),
        // O base64 fica de fora da listagem: um anexo pesado por projeto
        // tornaria o board inviável. O conteúdo vem por ação própria.
        db.execute(`
          SELECT id, projeto_id, etiqueta, nome, tipo, tamanho, criado_em, criado_por_nome
          FROM projeto_arquivos ORDER BY criado_em
        `),
        db.execute('SELECT id, nome FROM clientes WHERE ativo = 1 ORDER BY nome'),
      ]);
      const projetos = projs.rows.map(p => ({
        ...p,
        equipe: equipe.rows.filter(e => e.projeto_id === p.id)
          .map(e => ({ id: e.usuario_id, nome: e.nome, email: e.email, papel: e.papel })),
        arquivos: arqs.rows.filter(a => a.projeto_id === p.id),
      }));
      return { status: 200, body: { projetos, clientes: clientes.rows } };
    }

    if (action === 'projeto_arquivo_base64') {
      const id = Number(query.get('id'));
      if (!Number.isFinite(id)) return { status: 400, body: { error: 'id inválido.' } };
      const r = await db.execute({
        sql: 'SELECT nome, tipo, base64 FROM projeto_arquivos WHERE id = ?',
        args: [id],
      });
      if (!r.rows[0]) return { status: 404, body: { error: 'Anexo não encontrado.' } };
      return { status: 200, body: r.rows[0] };
    }

    if (action === 'anthropic_config') {
      // Só está "conectado" se houver credencial salva no banco (Turso) E ela for
      // válida numa checagem ao vivo contra a API da Anthropic. .env não conta aqui.
      const cred = await getIntegrationCredential(db, ANTHROPIC_KEY);
      if (!cred?.value) {
        return { status: 200, body: { has_key: false, connected: false, valid: false, model: DEFAULT_ANTHROPIC_MODEL, updated_at: null } };
      }
      const test = await validateAnthropicKey(cred.value);
      return {
        status: 200,
        body: {
          has_key: true,
          connected: test.ok,
          valid: test.ok,
          error: test.ok ? null : (test.error ?? 'Conexão inválida.'),
          model: cred.meta?.model || DEFAULT_ANTHROPIC_MODEL,
          updated_at: cred.updatedAt ?? null,
        },
      };
    }

    if (action === 'list_cedentes') {
      const [rows, seg, sub, oc, ca] = await Promise.all([
        // Pendentes/rejeitados vivem só na pipeline de aprovação; o cadastro principal lista aprovados
        db.execute(`SELECT * FROM cedentes WHERE ativo = 1 AND (aprovacao_status IS NULL OR aprovacao_status = 'aprovado') ORDER BY nome ASC`),
        db.execute('SELECT nome FROM cedente_segmentos ORDER BY nome'),
        db.execute('SELECT nome FROM cedente_sub_segmentos ORDER BY nome'),
        db.execute('SELECT nome FROM cedente_origens_comerciais ORDER BY nome'),
        db.execute('SELECT nome FROM cedente_canais_aquisicao ORDER BY nome'),
      ]);
      return {
        status: 200,
        body: {
          cedentes: rows.rows,
          options: {
            segmentos: seg.rows.map(r => String(r.nome)),
            sub_segmentos: sub.rows.map(r => String(r.nome)),
            origens_comerciais: oc.rows.map(r => String(r.nome)),
            canais_aquisicao: ca.rows.map(r => String(r.nome)),
          },
        },
      };
    }

    // Última taxa usada com este cedente (sugestão do Gerador de Documentos)
    if (action === 'taxa_sugerida') {
      const cnpj = (query.get('cnpj') ?? '').replace(/\D/g, '');
      if (!cnpj) return { status: 200, body: { taxa: null } };
      const r = await db.execute({
        sql: 'SELECT taxa_mensal FROM taxa_historico WHERE cedente_cnpj = ?',
        args: [cnpj],
      });
      const taxa = r.rows[0]?.taxa_mensal;
      return { status: 200, body: { taxa: taxa == null ? null : Number(taxa) } };
    }

    if (action === 'list_sacados') {
      const r = await db.execute('SELECT * FROM sacados WHERE ativo = 1 ORDER BY criado_em DESC');
      return { status: 200, body: { sacados: r.rows } };
    }

    // Pipeline de aprovação de auto-cadastros (cedentes com origem = 'Auto-cadastro')
    if (action === 'cadastros_board') {
      const rows = await db.execute(`
        SELECT c.id, c.nome, c.cnpj_cpf, c.razao_social, c.natureza_juridica,
               c.email, c.nome_responsavel, c.email_responsavel, c.cpf_responsavel,
               c.wpp_contato, c.endereco_pj, c.endereco_responsavel, c.cadastro_extra,
               c.aprovacao_status, c.criado_em, c.cadastro_movido_em,
               (SELECT COUNT(*) FROM cedente_arquivos a WHERE a.cedente_id = c.id) AS arquivo_count
        FROM cedentes c
        WHERE c.ativo = 1 AND c.origem = 'Auto-cadastro'
        ORDER BY c.criado_em DESC
      `);
      return { status: 200, body: { cadastros: rows.rows } };
    }

    // Etapas do onboarding para o board público/admin (colunas dinâmicas)
    if (action === 'cadastro_detail') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'id required' } };
      const c = await db.execute({ sql: 'SELECT * FROM cedentes WHERE id = ?', args: [id] });
      if (!c.rows[0]) return { status: 404, body: { error: 'Not found' } };
      const arquivos = await db.execute({
        sql: 'SELECT id, nome, tipo, tamanho, categoria, criado_em FROM cedente_arquivos WHERE cedente_id = ? ORDER BY criado_em ASC',
        args: [id],
      });
      const pendencias = await db.execute({
        sql: 'SELECT id, descricao, categoria, resolvida, criado_em, resolvido_em FROM cedente_pendencias WHERE cedente_id = ? ORDER BY resolvida ASC, criado_em ASC',
        args: [id],
      });
      return { status: 200, body: { cedente: c.rows[0], arquivos: arquivos.rows, pendencias: pendencias.rows } };
    }

    if (action === 'list_sacados_by_cedente') {
      const cedenteCnpj = (query.get('cnpj') ?? '').replace(/\D/g, '');
      if (!cedenteCnpj) return { status: 400, body: { error: 'cnpj required' } };
      // Sacados que já operaram com esse cedente (via leads)
      const linked = await db.execute({
        sql: `SELECT DISTINCT s.id, s.cnpj_cpf, s.razao_social FROM sacados s
              WHERE s.ativo = 1
              AND s.cnpj_cpf IN (
                SELECT DISTINCT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sol.cnpj_sacado,'.',''),'/',''),'-',''),' ',''),'_','')
                FROM leads sol
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sol.cnpj_contratado,'.',''),'/',''),'-',''),' ',''),'_','') = ?
                AND sol.cnpj_sacado IS NOT NULL AND sol.cnpj_sacado != ''
              )
              ORDER BY s.razao_social ASC`,
        args: [cedenteCnpj],
      });
      // Se não achou sacados relacionados, retorna todos
      if (linked.rows.length === 0) {
        const all = await db.execute('SELECT id, cnpj_cpf, razao_social FROM sacados WHERE ativo = 1 ORDER BY razao_social ASC');
        return { status: 200, body: { sacados: all.rows, filtered: false } };
      }
      return { status: 200, body: { sacados: linked.rows, filtered: true } };
    }

    if (action === 'get_lead_files') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'id required' } };
      const rows = await db.execute({
        sql: `SELECT nome, tipo, tamanho, categoria, base64 FROM lead_arquivos WHERE lead_id = ?
              UNION ALL
              SELECT nome, tipo, tamanho, categoria, base64 FROM lead_etapa_arquivos WHERE lead_id = ?`,
        args: [id, id],
      });
      return { status: 200, body: { arquivos: rows.rows } };
    }

    if (action === 'list_cedente_arquivos') {
      const cedente_id = query.get('cedente_id');
      if (!cedente_id) return { status: 400, body: { error: 'cedente_id required' } };
      const rows = await db.execute({
        sql: 'SELECT id, nome, tipo, tamanho, categoria, criado_em FROM cedente_arquivos WHERE cedente_id = ? ORDER BY criado_em ASC',
        args: [cedente_id],
      });
      return { status: 200, body: { arquivos: rows.rows } };
    }

    if (action === 'get_cedente_arquivo_base64') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'id required' } };
      const row = await db.execute({ sql: 'SELECT base64 FROM cedente_arquivos WHERE id = ?', args: [id] });
      if (!row.rows[0]) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: { base64: row.rows[0].base64 } };
    }

    if (action === 'novo_lead_notifs') {
      const notifs = await db.execute(`SELECT n.*, u.nome AS usuario_nome, u.email AS usuario_email
                     FROM novo_lead_notificacoes n JOIN usuarios u ON u.id = n.usuario_id
                     ORDER BY u.nome`);
      return { status: 200, body: { notificacoes: notifs.rows } };
    }

    if (action === 'detail') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'Missing id' } };

      const sub = await db.execute({ sql: 'SELECT * FROM leads WHERE id = ?', args: [id] });
      if (!sub.rows[0]) return { status: 404, body: { error: 'Not found' } };
      const submission = sub.rows[0] as Record<string, any>;
      if (submission.cedente_id) {
        const ced = await db.execute({ sql: 'SELECT link_drive, razao_social, nome, cnpj_cpf FROM cedentes WHERE id = ?', args: [submission.cedente_id] });
        const c = ced.rows[0] as Record<string, any> | undefined;
        submission.cedente_link_drive = c?.link_drive ?? null;
        // Cadastro é a fonte da verdade: razão social/CNPJ vêm do cedente cadastrado
        if (c) {
          submission.nome_contratado = c.razao_social ?? c.nome ?? submission.nome_contratado;
          submission.cnpj_contratado = c.cnpj_cpf ?? submission.cnpj_contratado;
        }
      } else {
        submission.cedente_link_drive = null;
      }
      // Sacado: idem - prioriza o cadastro (sacados) via sacado_id
      if (submission.sacado_id) {
        const sacR = await db.execute({ sql: 'SELECT razao_social, cnpj_cpf FROM sacados WHERE id = ?', args: [submission.sacado_id] });
        const sacRow = sacR.rows[0] as Record<string, any> | undefined;
        if (sacRow) {
          if (sacRow.razao_social) submission.nome_sacado = sacRow.razao_social;
          if (sacRow.cnpj_cpf) submission.cnpj_sacado = sacRow.cnpj_cpf;
        }
      }

      const eventos = await db.execute({
        // A foto vem por junção, e não gravada no evento: assim o avatar
        // acompanha a foto atual da pessoa, enquanto `autor_nome` continua
        // sendo o nome congelado na hora em que a ação aconteceu.
        sql: `SELECT e.*, sc.nome AS status_nome, sc.cor AS status_cor, u.foto_url AS autor_foto
              FROM lead_eventos e
              LEFT JOIN status_configs sc ON sc.id = e.status_id
              LEFT JOIN usuarios u ON u.id = e.autor_id
              WHERE e.lead_id = ? ORDER BY e.criado_em ASC`,
        args: [id],
      });

      const etapaArquivos = await db.execute({
        sql: `SELECT sa.id, sa.status_id, sa.nome, sa.tipo, sa.tamanho, sa.categoria, sa.criado_em,
                     sc.nome AS status_nome
              FROM lead_etapa_arquivos sa
              LEFT JOIN status_configs sc ON sc.id = sa.status_id
              WHERE sa.lead_id = ? ORDER BY sa.criado_em DESC`,
        args: [id],
      });

      const formArquivos = await db.execute({
        sql: 'SELECT id, categoria, nome, tipo, tamanho FROM lead_arquivos WHERE lead_id = ?',
        args: [id],
      });

      const statuses = await db.execute(
        'SELECT id, nome, cor FROM status_configs WHERE ativo = 1 ORDER BY ordem'
      );

      const pendencias = await db.execute({
        sql: 'SELECT id, descricao, categoria, resolvida, status_id, criado_em, resolvido_em FROM lead_pendencias WHERE lead_id = ? ORDER BY resolvida ASC, criado_em ASC',
        args: [id],
      });

      return {
        status: 200,
        body: {
          submission,
          eventos: eventos.rows,
          etapa_arquivos: etapaArquivos.rows,
          form_arquivos: formArquivos.rows,
          statuses: statuses.rows,
          pendencias: pendencias.rows,
        },
      };
    }

    return { status: 400, body: { error: 'Unknown action' } };
  }

  // ── POST ─────────────────────────────────────────────
  if (method === 'POST') {
    const action = body?.action;

    // Código do projeto: PRJ-<ano com 2 dígitos>-<sequencial de 3>. Gerado aqui e
    // não no formulário, para não existirem dois projetos disputando o mesmo
    // número. A busca é pelo maior sequencial do ano, e não pela contagem:
    // projeto excluído não pode fazer o próximo repetir um código já usado.
    async function proximoCodigo(): Promise<string> {
      const ano = String(new Date().getFullYear()).slice(-2);
      const r = await db.execute({
        sql: `SELECT codigo FROM projetos WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`,
        args: [`PRJ-${ano}-%`],
      });
      const ultimo = String(r.rows[0]?.codigo ?? '');
      const seq = ultimo ? Number(ultimo.split('-')[2] ?? 0) + 1 : 1;
      return `PRJ-${ano}-${String(seq).padStart(3, '0')}`;
    }

    /** Regrava a equipe do projeto. Apaga e insere: a lista que chega é a
     *  verdade, e diferença incremental aqui só traria estado intermediário. */
    async function gravarEquipe(projetoId: string, membros: unknown) {
      await db.execute({ sql: 'DELETE FROM projeto_equipe WHERE projeto_id = ?', args: [projetoId] });
      for (const m of Array.isArray(membros) ? membros : []) {
        const uid = String((m as any)?.usuario_id ?? '');
        if (!uid) continue;
        await db.execute({
          sql: 'INSERT OR IGNORE INTO projeto_equipe (projeto_id, usuario_id, papel) VALUES (?,?,?)',
          args: [projetoId, uid, String((m as any)?.papel ?? 'Dev')],
        });
      }
    }

    /** Campos obrigatórios do projeto. Só observações é livre - e os anexos, que
     *  não passam por aqui: eles sobem depois, em ação própria, porque só
     *  existem depois que o projeto tem id. Essa parte a tela cobra sozinha. */
    function faltaEmProjeto(p: any): string | null {
      if (!String(p?.nome ?? '').trim()) return 'O nome do projeto é obrigatório.';
      if (!p?.cliente_id) return 'O cliente é obrigatório.';
      if (!String(p?.tipo ?? '').trim()) return 'O tipo do projeto é obrigatório.';
      if (!p?.data_inicio) return 'A data de início é obrigatória.';
      if (!p?.previsao_entrega) return 'O fim previsto é obrigatório.';
      if (!String(p?.objetivo ?? '').trim()) return 'O objetivo final é obrigatório.';
      if (!Array.isArray(p?.equipe) || p.equipe.length === 0) return 'O projeto precisa de ao menos uma pessoa na equipe.';
      return null;
    }

    if (action === 'create_projeto') {
      const p = body;
      const falta = faltaEmProjeto(p);
      if (falta) return { status: 400, body: { error: falta } };
      const id = randomUUID();
      const agora = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO projetos (
                id, codigo, nome, cliente_id, tipo, repositorio, objetivo, status,
                data_inicio, previsao_entrega, progresso, observacoes,
                ativo, criado_em, criado_por_id, criado_por_nome
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
        args: [
          id, await proximoCodigo(), String(p.nome).trim(), p.cliente_id || null,
          p.tipo || null, String(p.repositorio ?? '').trim() || null, p.objetivo ?? null,
          p.status ?? 'Em andamento',
          p.data_inicio || null, p.previsao_entrega || null,
          Math.min(100, Math.max(0, Number(p.progresso ?? 0))), p.observacoes ?? null,
          agora, autorId, autorNome,
        ],
      });
      await gravarEquipe(id, p.equipe);
      return { status: 200, body: { id } };
    }

    if (action === 'update_projeto') {
      const p = body;
      if (!p?.id) return { status: 400, body: { error: 'id ausente.' } };
      // A edição parcial da aba de gestão manda só status e progresso; validar
      // tudo aqui barraria arrastar o slider. Só o formulário completo, que
      // envia `equipe`, passa pela validação inteira.
      if (p.equipe !== undefined) {
        const falta = faltaEmProjeto(p);
        if (falta) return { status: 400, body: { error: falta } };
      }
      await db.execute({
        sql: `UPDATE projetos SET
                nome=?, cliente_id=?, tipo=?, repositorio=?, objetivo=?, status=?,
                data_inicio=?, previsao_entrega=?, progresso=?, observacoes=?,
                atualizado_por_id=?, atualizado_por_nome=?, atualizado_em=?
              WHERE id=?`,
        args: [
          String(p.nome ?? '').trim(), p.cliente_id || null,
          p.tipo || null, String(p.repositorio ?? '').trim() || null, p.objetivo ?? null,
          p.status ?? 'Em andamento',
          p.data_inicio || null, p.previsao_entrega || null,
          Math.min(100, Math.max(0, Number(p.progresso ?? 0))), p.observacoes ?? null,
          autorId, autorNome, new Date().toISOString(), p.id,
        ],
      });
      if (p.equipe !== undefined) await gravarEquipe(String(p.id), p.equipe);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_projeto') {
      // Exclusão lógica, como no resto do sistema: o histórico de auditoria
      // continua apontando para uma linha que existe.
      await db.execute({
        sql: 'UPDATE projetos SET ativo = 0, atualizado_por_id=?, atualizado_por_nome=?, atualizado_em=? WHERE id = ?',
        args: [autorId, autorNome, new Date().toISOString(), body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'add_projeto_arquivo') {
      const a = body;
      if (!a?.projeto_id || !a?.nome || !a?.base64) {
        return { status: 400, body: { error: 'Anexo incompleto.' } };
      }
      const r = await db.execute({
        sql: `INSERT INTO projeto_arquivos (projeto_id, etiqueta, nome, tipo, tamanho, base64, criado_em, criado_por_nome)
              VALUES (?,?,?,?,?,?,?,?)`,
        args: [
          a.projeto_id, a.etiqueta || 'Documento', a.nome, a.tipo ?? 'application/octet-stream',
          Number(a.tamanho ?? 0), a.base64, new Date().toISOString(), autorNome,
        ],
      });
      return { status: 200, body: { id: Number(r.lastInsertRowid) } };
    }

    if (action === 'delete_projeto_arquivo') {
      await db.execute({ sql: 'DELETE FROM projeto_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'create_cliente') {
      const nome = String(body?.nome ?? '').trim();
      if (!nome) return { status: 400, body: { error: 'O nome do cliente é obrigatório.' } };
      // Devolve o nome como está gravado, não como foi digitado: quem escrever
      // "cliente novo" recebe de volta "Cliente Novo" e a tela não passa a
      // exibir uma segunda grafia do mesmo registro.
      const existente = await db.execute({
        sql: 'SELECT id, nome FROM clientes WHERE lower(nome) = lower(?) LIMIT 1', args: [nome],
      });
      if (existente.rows[0]) {
        return { status: 200, body: { id: String(existente.rows[0].id), nome: String(existente.rows[0].nome) } };
      }
      const id = randomUUID();
      await db.execute({
        sql: 'INSERT INTO clientes (id, nome, ativo, criado_em) VALUES (?,?,1,?)',
        args: [id, nome, new Date().toISOString()],
      });
      return { status: 200, body: { id, nome } };
    }

    // Matriz de permissões do papel. Chave fora do catálogo é descartada em
    // `salvarMatrizPapel`, então a tela não consegue inventar permissão.
    if (action === 'set_permissoes_papel') {
      if (!podeGerenciarUsuarios(usuario)) return NEGADO_USUARIOS;
      const papel = String(body?.papel ?? 'membro').trim().toLowerCase();
      if (papel !== 'membro') {
        return { status: 400, body: { error: 'Só o papel Membro tem matriz: Master e Admin fazem tudo por definição.' } };
      }
      const chaves = Array.isArray(body?.chaves) ? body.chaves.map((c: unknown) => String(c)) : [];
      const matriz = await salvarMatrizPapel(db, papel, chaves, usuario);
      return { status: 200, body: { ok: true, papel, ...matriz } };
    }

    // ── Gestão de usuários ───────────────────────────────────────────────────
    // Papel e acesso de outra pessoa. Só o dono do painel, e nunca sobre a
    // própria conta dele: rebaixar ou desligar o administrador deixaria o
    // sistema sem ninguém capaz de devolver acesso a alguém.
    if (action === 'set_papel' || action === 'set_usuario_ativo') {
      if (!podeGerenciarUsuarios(usuario)) return NEGADO_USUARIOS;

      const alvoId = String(body?.usuario_id ?? '');
      if (!alvoId) return { status: 400, body: { error: 'usuario_id ausente.' } };

      const res = await db.execute({
        sql: 'SELECT id, email, nome, papel, ativo FROM usuarios WHERE id = ?',
        args: [alvoId],
      });
      const linha = res.rows[0] as Record<string, any> | undefined;
      if (!linha) return { status: 404, body: { error: 'Usuário não encontrado.' } };
      if (ehEmailAdmin(String(linha.email))) {
        return { status: 409, body: { error: 'A conta de administrador do sistema não pode ser alterada por aqui.' } };
      }

      if (action === 'set_papel') {
        const papel = String(body?.papel ?? '').trim().toLowerCase() as Papel;
        // `admin` não está na lista de propósito: esse nível vem do e-mail
        // fixado no servidor, não de um UPDATE.
        if (!PAPEIS_ATRIBUIVEIS.includes(papel)) {
          return { status: 400, body: { error: `Papel inválido. Use ${PAPEIS_ATRIBUIVEIS.join(' ou ')}.` } };
        }
        await db.execute({ sql: 'UPDATE usuarios SET papel = ? WHERE id = ?', args: [papel, alvoId] });
        return { status: 200, body: { ok: true, usuario_id: alvoId, papel } };
      }

      const ativo = body?.ativo === true || body?.ativo === 1 ? 1 : 0;
      await db.execute({ sql: 'UPDATE usuarios SET ativo = ? WHERE id = ?', args: [ativo, alvoId] });
      if (!ativo) {
        // Corta agora, não na próxima expiração: `getAdminSession` já recusa
        // sessão de inativo, mas apagar deixa o efeito imediato e visível na
        // contagem de sessões abertas da tela.
        await db.execute({ sql: 'DELETE FROM admin_sessions WHERE usuario_id = ?', args: [alvoId] });
      }
      return { status: 200, body: { ok: true, usuario_id: alvoId, ativo: ativo === 1 } };
    }

    // Persiste (upsert) o relatório DEPS de um alvo, ligado ao lead - fica
    // acessível no balão do cedente/sacado no card.
    if (action === 'save_lead_deps') {
      const { lead_id, alvo, nome, documento, norm, raw } = body;
      if (!lead_id || (alvo !== 'ced' && alvo !== 'sac') || !norm) {
        return { status: 400, body: { error: 'Dados inválidos.' } };
      }
      await db.execute({ sql: 'DELETE FROM lead_deps WHERE lead_id = ? AND alvo = ?', args: [lead_id, alvo] });
      await db.execute({
        sql: `INSERT INTO lead_deps (lead_id, alvo, nome, documento, norm_json, raw_json, criado_em) VALUES (?,?,?,?,?,?,?)`,
        args: [lead_id, alvo, nome ?? null, documento ?? null, JSON.stringify(norm),
               raw ? JSON.stringify(raw) : null, new Date().toISOString()],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'move') {
      const { lead_id, status_id } = body;
      const now = new Date().toISOString();
      const sc = await db.execute({ sql: 'SELECT nome FROM status_configs WHERE id = ?', args: [status_id] });
      const nome = String(sc.rows[0]?.nome ?? '');

      await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'status_change', ?, ?, ?, ?, ?)`,
        args: [lead_id, status_id, `Movido para ${nome}`, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'leads', lead_id, autorId, autorNome, now);

      // Avisa por e-mail quem acompanha a etapa de destino
      {
        const inscritos = await emailsDosInscritos(db, 'status_notificacoes', { coluna: 'status_id', valor: status_id });
        if (inscritos.length > 0) {
          const s = (await db.execute({ sql: 'SELECT nome_contratado, cnpj_contratado, valor FROM leads WHERE id = ?', args: [lead_id] })).rows[0];
          const corpo = `
  <p style="font-size:14px;color:#555;margin:0 0 4px"><strong>Contratado:</strong> ${esc(s?.nome_contratado ?? '-')} (${esc(s?.cnpj_contratado ?? '-')})</p>
  <p style="font-size:14px;color:#555;margin:0"><strong>Valor:</strong> ${esc(s?.valor ?? '-')}</p>`;
          for (const dest of inscritos) {
            notifyEmail(dest.email, `Lead movido para "${nome}"`, corpo);
          }
        }
      }
      return { status: 200, body: { ok: true } };
    }

    if (action === 'comment') {
      const now = new Date().toISOString();
      const result = await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, descricao, parent_id, criado_em, autor_id, autor_nome)
              VALUES (?, 'comentario', ?, ?, ?, ?, ?)`,
        args: [body.lead_id, body.texto, body.parent_id ?? null, now, autorId, autorNome],
      });
      if (body.texto) {
        notifyMentions(body.texto, body.lead_id, db).catch(e => console.error('[mention-notify]', e));
        notifyStageMentions(body.texto, body.lead_id, db).catch(e => console.error('[stage-notify]', e));
      }
      return {
        status: 200,
        body: { ok: true, id: Number(result.lastInsertRowid), criado_em: now, autor_id: autorId, autor_nome: autorNome },
      };
    }

    if (action === 'delete_comment') {
      // Delete replies first, then the comment itself
      await db.execute({ sql: `DELETE FROM lead_eventos WHERE parent_id = ? AND tipo = 'comentario'`, args: [body.id] });
      await db.execute({ sql: `DELETE FROM lead_eventos WHERE id = ? AND tipo = 'comentario'`, args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'upload_file') {
      const { lead_id, status_id, arquivo } = body;
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO lead_etapa_arquivos (lead_id, status_id, nome, tipo, tamanho, base64, categoria, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [lead_id, status_id, arquivo.nome, arquivo.tipo, arquivo.tamanho, arquivo.base64, arquivo.categoria ?? null, now],
      });
      await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'arquivo', ?, ?, ?, ?, ?)`,
        args: [lead_id, status_id, `Arquivo: ${arquivo.nome}`, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'leads', lead_id, autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_stage_file') {
      await db.execute({ sql: 'DELETE FROM lead_etapa_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'get_file_base64') {
      const f = await db.execute({ sql: 'SELECT base64, nome FROM lead_etapa_arquivos WHERE id = ?', args: [body.id] });
      if (!f.rows[0]) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: f.rows[0] };
    }

    if (action === 'get_form_file_base64') {
      const f = await db.execute({ sql: 'SELECT base64, nome FROM lead_arquivos WHERE id = ?', args: [body.id] });
      if (!f.rows[0]) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: f.rows[0] };
    }

    if (action === 'rename_form_file') {
      await db.execute({ sql: 'UPDATE lead_arquivos SET nome = ? WHERE id = ?', args: [body.nome, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'rename_file') {
      await db.execute({ sql: 'UPDATE lead_etapa_arquivos SET nome = ? WHERE id = ?', args: [body.nome, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_file') {
      await db.execute({ sql: 'DELETE FROM lead_etapa_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_form_file') {
      await db.execute({ sql: 'DELETE FROM lead_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'update_arquivo_categoria') {
      const table = body.is_stage ? 'lead_etapa_arquivos' : 'lead_arquivos';
      await db.execute({ sql: `UPDATE ${table} SET categoria = ? WHERE id = ?`, args: [body.categoria ?? null, body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Pendências (checklist)
    if (action === 'add_pendencias') {
      const { lead_id, status_id, itens } = body;
      const now = new Date().toISOString();
      const lista = (Array.isArray(itens) ? itens : [])
        .map((it: any) => ({ descricao: String(it?.descricao ?? '').trim(), categoria: it?.categoria ?? null }))
        .filter((it: any) => it.descricao);
      for (const it of lista) {
        await db.execute({
          sql: `INSERT INTO lead_pendencias (lead_id, descricao, categoria, resolvida, status_id, criado_em, criado_por_id, criado_por_nome)
                VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
          args: [lead_id, it.descricao, it.categoria, status_id ?? null, now, autorId, autorNome],
        });
      }
      // Resumo na timeline (histórico)
      if (lista.length > 0) {
        const resumo = lista.map((it: any) => `• ${it.categoria ? `[${it.categoria}] ` : ''}${it.descricao}`).join('\n');
        await db.execute({
          sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
                VALUES (?, 'comentario', ?, ?, ?, ?, ?)`,
          args: [lead_id, status_id ?? null, `Pendências registradas:\n${resumo}`, now, autorId, autorNome],
        });
      }
      return { status: 200, body: { ok: true, count: lista.length } };
    }

    if (action === 'toggle_pendencia') {
      const resolvida = body.resolvida ? 1 : 0;
      await db.execute({
        sql: `UPDATE lead_pendencias SET resolvida = ?, resolvido_em = ?, resolvido_por_id = ?, resolvido_por_nome = ? WHERE id = ?`,
        args: [
          resolvida,
          resolvida ? new Date().toISOString() : null,
          resolvida ? autorId : null,
          resolvida ? autorNome : null,
          body.id,
        ],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'update_pendencia') {
      await db.execute({
        sql: `UPDATE lead_pendencias SET descricao = COALESCE(?, descricao), categoria = ? WHERE id = ?`,
        args: [body.descricao != null ? String(body.descricao).trim() : null, body.categoria ?? null, body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_pendencia') {
      await db.execute({ sql: 'DELETE FROM lead_pendencias WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Status CRUD
    if (action === 'create_status') {
      const max = await db.execute('SELECT MAX(ordem) as m FROM status_configs');
      const ordem = Number(max.rows[0]?.m ?? 0) + 1;
      const r = await db.execute({ sql: 'INSERT INTO status_configs (nome, cor, ordem, ativo) VALUES (?, ?, ?, 1)', args: [body.nome, body.cor, ordem] });
      const newId = Number(r.lastInsertRowid);
      return { status: 200, body: { status: { id: newId, nome: body.nome, cor: body.cor, ordem, ativo: 1, notificacoes: [] } } };
    }

    if (action === 'update_status') {
      await db.execute({ sql: 'UPDATE status_configs SET nome = ?, cor = ? WHERE id = ?', args: [body.nome, body.cor, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_status') {
      await db.execute({ sql: 'UPDATE status_configs SET ativo = 0 WHERE id = ?', args: [body.id] });
      await healOrphanedCards(db);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_status_with_move') {
      const { id, move_to_id } = body;
      const now = new Date().toISOString();
      const sc = await db.execute({ sql: 'SELECT nome FROM status_configs WHERE id = ?', args: [move_to_id] });
      const targetNome = String(sc.rows[0]?.nome ?? '');
      // Find all leads currently in this status
      const cards = await db.execute({
        sql: `SELECT s.id FROM leads s
              INNER JOIN (
                SELECT e.lead_id FROM lead_eventos e
                WHERE e.tipo = 'status_change' AND e.status_id = ?
                  AND e.id = (
                    SELECT MAX(e2.id) FROM lead_eventos e2
                    WHERE e2.lead_id = e.lead_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.lead_id = s.id
              WHERE s.deleted_at IS NULL`,
        args: [id],
      });
      for (const row of cards.rows) {
        await db.execute({
          sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
                VALUES (?, 'status_change', ?, ?, ?, ?, ?)`,
          args: [row.id, move_to_id, `Movido para ${targetNome}`, now, autorId, autorNome],
        });
      }
      await db.execute({ sql: 'UPDATE status_configs SET ativo = 0 WHERE id = ?', args: [id] });
      return { status: 200, body: { ok: true, moved: cards.rows.length } };
    }

    // Cedentes CRUD
    if (action === 'create_cedente') {
      const id = randomUUID();
      const now = new Date().toISOString();
      const c = body;
      // aprovacao_status:
      //  - explícito no body → respeita
      //  - onboarding (origem 'Auto-cadastro') → entra na 1ª etapa do pipeline (para aprovação)
      //  - registro direto de cedente ("+ Novo cedente") → já entra APROVADO (default da coluna)
      // Sem pipeline de aprovação, todo cedente registrado já nasce aprovado.
      const aprovacaoStatus = c.aprovacao_status ?? 'aprovado';
      await db.execute({
        sql: `INSERT INTO cedentes (
                id, nome, cnpj_cpf, razao_social, status, flags, origem, segmento, sub_segmento,
                origem_comercial, canal_aquisicao, parceiro, natureza_juridica,
                valores_em_aberto, limite_operacao, rating, obs, email, endereco_pj,
                nome_responsavel, email_responsavel, endereco_responsavel, cpf_responsavel,
                possui_escrow, wpp_contato, conta_escrow, link_drive, cadastro_extra, aprovacao_status, cadastro_movido_em, ativo, criado_em,
                criado_por_id, criado_por_nome
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
        args: [
          id, c.nome, c.cnpj_cpf??null, c.razao_social??null, c.status??'Ativo', c.flags??'Regular',
          c.origem??null, c.segmento??null, c.sub_segmento??null, c.origem_comercial??null,
          c.canal_aquisicao??null, c.parceiro??0, c.natureza_juridica??null,
          c.valores_em_aberto??null, c.limite_operacao??null, c.rating??null, c.obs??null,
          c.email??null, c.endereco_pj??null, c.nome_responsavel??null, c.email_responsavel??null,
          c.endereco_responsavel??null, c.cpf_responsavel??null, c.possui_escrow??0,
          c.wpp_contato??null, c.conta_escrow??null, c.link_drive??null, c.cadastro_extra??null, aprovacaoStatus, now, now,
          autorId, autorNome,
        ],
      });
      return { status: 200, body: { cedente: { id, ...c, aprovacao_status: aprovacaoStatus, ativo: 1, criado_em: now } } };
    }

    if (action === 'update_cedente') {
      const c = body;
      await db.execute({
        sql: `UPDATE cedentes SET
                nome=?, cnpj_cpf=?, razao_social=?, status=?, flags=?, origem=?, segmento=?,
                sub_segmento=?, origem_comercial=?, canal_aquisicao=?, parceiro=?,
                natureza_juridica=?, valores_em_aberto=?, limite_operacao=?, rating=?, obs=?,
                email=?, endereco_pj=?, nome_responsavel=?, email_responsavel=?,
                endereco_responsavel=?, cpf_responsavel=?, possui_escrow=?, wpp_contato=?, conta_escrow=?,
                link_drive=?, cadastro_extra=COALESCE(?, cadastro_extra),
                atualizado_por_id=?, atualizado_por_nome=?, atualizado_em=?
              WHERE id=?`,
        args: [
          c.nome, c.cnpj_cpf??null, c.razao_social??null, c.status??'Ativo', c.flags??'Regular',
          c.origem??null, c.segmento??null, c.sub_segmento??null, c.origem_comercial??null,
          c.canal_aquisicao??null, c.parceiro??0, c.natureza_juridica??null,
          c.valores_em_aberto??null, c.limite_operacao??null, c.rating??null, c.obs??null,
          c.email??null, c.endereco_pj??null, c.nome_responsavel??null, c.email_responsavel??null,
          c.endereco_responsavel??null, c.cpf_responsavel??null, c.possui_escrow??0,
          c.wpp_contato??null, c.conta_escrow??null, c.link_drive??null, c.cadastro_extra??null,
          autorId, autorNome, new Date().toISOString(), c.id,
        ],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_cedente') {
      await db.execute({ sql: 'UPDATE cedentes SET ativo = 0 WHERE id = ?', args: [body.id] });
      await marcarEdicao(db, 'cedentes', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    // Pipeline de aprovação: muda o estágio do auto-cadastro.
    // 'aprovado' libera o CNPJ no formulário público; demais estágios mantêm bloqueado.
    // ── Etapas do onboarding: CRUD / reorder ───────────────────────────────────
    if (action === 'upload_cedente_arquivo') {
      const now = new Date().toISOString();
      await db.execute({
        sql: 'INSERT INTO cedente_arquivos (cedente_id, nome, tipo, tamanho, base64, categoria, criado_em) VALUES (?,?,?,?,?,?,?)',
        args: [body.cedente_id, body.nome, body.tipo??'', body.tamanho??0, body.base64, body.categoria??null, now],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'rename_cedente_arquivo') {
      await db.execute({ sql: 'UPDATE cedente_arquivos SET nome = ? WHERE id = ?', args: [body.nome, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'update_cedente_arquivo_categoria') {
      await db.execute({ sql: 'UPDATE cedente_arquivos SET categoria = ? WHERE id = ?', args: [body.categoria??null, body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Pendências do cedente (onboarding)
    if (action === 'add_cedente_pendencias') {
      const { cedente_id, itens } = body;
      const now = new Date().toISOString();
      const lista = (Array.isArray(itens) ? itens : [])
        .map((it: any) => ({ descricao: String(it?.descricao ?? '').trim(), categoria: it?.categoria ?? null }))
        .filter((it: any) => it.descricao);
      for (const it of lista) {
        await db.execute({
          sql: `INSERT INTO cedente_pendencias (cedente_id, descricao, categoria, resolvida, criado_em) VALUES (?, ?, ?, 0, ?)`,
          args: [cedente_id, it.descricao, it.categoria, now],
        });
      }
      return { status: 200, body: { ok: true, count: lista.length } };
    }

    if (action === 'toggle_cedente_pendencia') {
      const resolvida = body.resolvida ? 1 : 0;
      await db.execute({
        sql: `UPDATE cedente_pendencias SET resolvida = ?, resolvido_em = ? WHERE id = ?`,
        args: [resolvida, resolvida ? new Date().toISOString() : null, body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'update_cedente_pendencia') {
      await db.execute({
        sql: `UPDATE cedente_pendencias SET descricao = COALESCE(?, descricao), categoria = ? WHERE id = ?`,
        args: [body.descricao != null ? String(body.descricao).trim() : null, body.categoria ?? null, body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_cedente_pendencia') {
      await db.execute({ sql: 'DELETE FROM cedente_pendencias WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_cedente_arquivo') {
      await db.execute({ sql: 'DELETE FROM cedente_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'add_cedente_option') {
      const tableMap: Record<string, string> = {
        segmentos: 'cedente_segmentos',
        sub_segmentos: 'cedente_sub_segmentos',
        origens_comerciais: 'cedente_origens_comerciais',
        canais_aquisicao: 'cedente_canais_aquisicao',
      };
      const table = tableMap[body.list];
      if (!table) return { status: 400, body: { error: 'Invalid list' } };
      try {
        await db.execute({ sql: `INSERT INTO ${table} (nome) VALUES (?)`, args: [body.nome] });
        return { status: 200, body: { ok: true } };
      } catch {
        return { status: 409, body: { error: 'Option already exists' } };
      }
    }

    if (action === 'import_cedentes') {
      const items: any[] = body.cedentes ?? [];
      let count = 0;
      for (const c of items) {
        try {
          await db.execute({
            sql: `INSERT INTO cedentes (
                    nome, cnpj_cpf, razao_social, status, flags, origem, segmento, sub_segmento,
                    origem_comercial, canal_aquisicao, parceiro, natureza_juridica,
                    valores_em_aberto, limite_operacao, rating, obs, email, endereco_pj,
                    nome_responsavel, email_responsavel, endereco_responsavel, cpf_responsavel,
                    possui_escrow, wpp_contato, conta_escrow, ativo, criado_em, criado_por_id, criado_por_nome
                  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`,
            args: [
              c.nome, c.cnpj_cpf??null, c.razao_social??null, c.status??'Ativo', c.flags??'Regular',
              c.origem??null, c.segmento??null, c.sub_segmento??null, c.origem_comercial??null,
              c.canal_aquisicao??null, c.parceiro??0, c.natureza_juridica??null,
              c.valores_em_aberto??null, c.limite_operacao??null, c.rating??null, c.obs??null,
              c.email??null, c.endereco_pj??null, c.nome_responsavel??null, c.email_responsavel??null,
              c.endereco_responsavel??null, c.cpf_responsavel??null, c.possui_escrow??0,
              c.wpp_contato??null, c.conta_escrow??null, c.criado_em??new Date().toISOString(),
              autorId, autorNome,
            ],
          });
          count++;
        } catch {}
      }
      return { status: 200, body: { ok: true, count } };
    }

    // Sacados CRUD
    if (action === 'create_sacado') {
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.execute({
        sql: 'INSERT INTO sacados (id, cnpj_cpf, razao_social, criado_em, criado_por_id, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, (body.cnpj_cpf ?? '').replace(/\D/g, '') || null, body.razao_social ?? null, now, autorId, autorNome],
      });
      return { status: 200, body: { sacado: { id, cnpj_cpf: body.cnpj_cpf ?? null, razao_social: body.razao_social ?? null, criado_em: now } } };
    }

    if (action === 'update_sacado') {
      await db.execute({ sql: 'UPDATE sacados SET cnpj_cpf = ?, razao_social = ? WHERE id = ?', args: [(body.cnpj_cpf ?? '').replace(/\D/g, '') || null, body.razao_social ?? null, body.id] });
      await marcarEdicao(db, 'sacados', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_sacado') {
      // Desativar é edição, não exclusão: a linha fica e precisa dizer quem a tirou de circulação.
      await db.execute({ sql: 'UPDATE sacados SET ativo = 0 WHERE id = ?', args: [body.id] });
      await marcarEdicao(db, 'sacados', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    if (action === 'set_conversion_status') {
      const { id } = body; // id = null clears the flag from all
      await db.execute('UPDATE status_configs SET is_conversion = 0');
      if (id != null) {
        await db.execute({ sql: 'UPDATE status_configs SET is_conversion = 1 WHERE id = ?', args: [id] });
      }
      return { status: 200, body: { ok: true } };
    }

    // Etapa de entrada: a que recebe os leads do formulário público.
    // Exclusiva - marcar uma desmarca as outras. id = null volta ao padrão
    // (primeira etapa ativa por ordem).
    if (action === 'set_entrada_status') {
      const { id } = body;
      await db.execute('UPDATE status_configs SET is_entrada = 0');
      if (id != null) {
        await db.execute({ sql: 'UPDATE status_configs SET is_entrada = 1 WHERE id = ?', args: [id] });
      }
      return { status: 200, body: { ok: true } };
    }

    if (action === 'toggle_excluded_status') {
      const { id } = body;
      const cur = await db.execute({ sql: 'SELECT is_excluded FROM status_configs WHERE id = ?', args: [id] });
      const wasExcluded = Number(cur.rows[0]?.is_excluded ?? 0);
      await db.execute({ sql: 'UPDATE status_configs SET is_excluded = ? WHERE id = ?', args: [wasExcluded ? 0 : 1, id] });
      return { status: 200, body: { ok: true, is_excluded: wasExcluded ? 0 : 1 } };
    }

    // Etapa pontual: fica recolhida no kanban mesmo com cards dentro
    if (action === 'toggle_always_collapsed') {
      const { id } = body;
      const cur = await db.execute({ sql: 'SELECT always_collapsed FROM status_configs WHERE id = ?', args: [id] });
      const was = Number(cur.rows[0]?.always_collapsed ?? 0);
      await db.execute({ sql: 'UPDATE status_configs SET always_collapsed = ? WHERE id = ?', args: [was ? 0 : 1, id] });
      return { status: 200, body: { ok: true, always_collapsed: was ? 0 : 1 } };
    }

    if (action === 'toggle_requires_pendencia') {
      const { id } = body;
      const cur = await db.execute({ sql: 'SELECT requires_pendencia FROM status_configs WHERE id = ?', args: [id] });
      const was = Number(cur.rows[0]?.requires_pendencia ?? 0);
      await db.execute({ sql: 'UPDATE status_configs SET requires_pendencia = ? WHERE id = ?', args: [was ? 0 : 1, id] });
      return { status: 200, body: { ok: true, requires_pendencia: was ? 0 : 1 } };
    }

    if (action === 'reorder_statuses') {
      for (let i = 0; i < (body.ids as number[]).length; i++) {
        await db.execute({ sql: 'UPDATE status_configs SET ordem = ? WHERE id = ?', args: [i + 1, body.ids[i]] });
      }
      return { status: 200, body: { ok: true } };
    }

    // Credencial da Anthropic - salva criptografada no banco (cofre de integrações)
    if (action === 'save_anthropic_key') {
      const key = String(body?.key ?? '').trim();
      const model = String(body?.model ?? '').trim() || DEFAULT_ANTHROPIC_MODEL;
      if (key) {
        // Valida a chave nova antes de salvar - só persiste se a conexão funcionar.
        const test = await validateAnthropicKey(key);
        if (!test.ok) return { status: 400, body: { error: test.error ?? 'Chave inválida.' } };
        await saveIntegrationCredential(db, ANTHROPIC_KEY, key, { model, validated_at: new Date().toISOString() });
        return { status: 200, body: { ok: true, model, connected: true } };
      }
      // Sem chave nova: precisa já existir uma credencial salva para trocar só o modelo
      const cred = await getIntegrationCredential(db, ANTHROPIC_KEY);
      if (!cred?.value) return { status: 400, body: { error: 'Informe a chave da API.' } };
      const test = await validateAnthropicKey(cred.value);
      await updateIntegrationMeta(db, ANTHROPIC_KEY, { ...cred.meta, model, validated_at: new Date().toISOString() });
      return { status: 200, body: { ok: true, model, connected: test.ok } };
    }

    if (action === 'remove_anthropic_key') {
      await removeIntegrationCredential(db, ANTHROPIC_KEY);
      return { status: 200, body: { ok: true } };
    }

    // Grava a análise validada no histórico. Chamado pelo "Validar e salvar" da
    // etapa Parecer; criado_por_nome é o analista que validou.
    // Anexos da análise: sobem em PEDAÇOS depois que a análise já tem id.
    // Um pedaço por requisição (o body da função não aguenta o arquivo inteiro);
    // o finalize remonta, grava a linha e limpa os pedaços.
    // Importação em lote de diretrizes (ex.: metodologia que o analista mantinha
    // num markdown próprio). Já vem revisada pelo operador na tela; aqui só
    // validamos e gravamos, pulando o que já existe ativo com o mesmo texto.
    // Novo lead notifications
    if (action === 'add_novo_lead_notif') {
      const r = await db.execute({
        sql: 'INSERT OR IGNORE INTO novo_lead_notificacoes (usuario_id) VALUES (?)',
        args: [body.usuario_id],
      });
      const notif = await inscritoCriado(db, Number(r.lastInsertRowid), body.usuario_id);
      return { status: 200, body: { notificacao: notif } };
    }

    if (action === 'remove_novo_lead_notif') {
      await db.execute({ sql: 'DELETE FROM novo_lead_notificacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Notificações do pipeline de cadastro - por etapa
    // Notificações do pipeline de cadastro - na submissão do formulário
    // Inscritos nas notificações por etapa
    if (action === 'add_notificacao') {
      const r = await db.execute({
        sql: 'INSERT OR IGNORE INTO status_notificacoes (status_id, usuario_id) VALUES (?, ?)',
        args: [body.status_id, body.usuario_id],
      });
      const notif = { ...await inscritoCriado(db, Number(r.lastInsertRowid), body.usuario_id), status_id: body.status_id };
      return { status: 200, body: { notificacao: notif } };
    }

    if (action === 'remove_notificacao') {
      await db.execute({
        sql: 'DELETE FROM status_notificacoes WHERE id = ?',
        args: [body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'patch_submission') {
      const allowed = ['liquidez', 'previsao_execucao', 'data_execucao'];
      const field = body.field as string;
      if (!allowed.includes(field)) return { status: 400, body: { error: 'Field not allowed' } };
      await db.execute({
        sql: `UPDATE leads SET ${field} = ? WHERE id = ?`,
        args: [body.value ?? null, body.id],
      });
      await marcarEdicao(db, 'leads', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    if (action === 'create_sacado') {
      // Localiza (ou cria) um sacado pelo CNPJ. A razão social vem da Receita
      // (consultada no front) e fica salva no cadastro - fonte da verdade daqui pra frente.
      const cnpj = String(body?.cnpj ?? '').replace(/\D/g, '');
      const razao = String(body?.razao_social ?? '').trim();
      if (cnpj.length !== 14 && cnpj.length !== 11) return { status: 400, body: { error: 'CNPJ/CPF inválido.' } };
      const existing = await db.execute({ sql: 'SELECT id, razao_social, cnpj_cpf FROM sacados WHERE cnpj_cpf = ? LIMIT 1', args: [cnpj] });
      if (existing.rows[0]) {
        const row = existing.rows[0] as Record<string, any>;
        // Atualiza a razão social se veio uma nova e a antiga estava vazia
        if (razao && !String(row.razao_social ?? '').trim()) {
          await db.execute({ sql: 'UPDATE sacados SET razao_social = ? WHERE id = ?', args: [razao, row.id] });
          await marcarEdicao(db, 'sacados', String(row.id), autorId, autorNome, new Date().toISOString());
          row.razao_social = razao;
        }
        return { status: 200, body: { sacado: { id: row.id, razao_social: row.razao_social, cnpj_cpf: row.cnpj_cpf } } };
      }
      const newId = randomUUID();
      await db.execute({
        sql: 'INSERT INTO sacados (id, cnpj_cpf, razao_social, criado_em, criado_por_id, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?)',
        args: [newId, cnpj, razao || null, new Date().toISOString(), autorId, autorNome],
      });
      return { status: 200, body: { sacado: { id: newId, razao_social: razao || null, cnpj_cpf: cnpj } } };
    }

    if (action === 'create_submission') {
      const {
        nome_contratado, cnpj_contratado, situacao_contratado,
        nome_sacado, cnpj_sacado, situacao_sacado,
        valor, valor_numerico, prazo_limite, parcelas, fim_type,
        status_id, cedente_id, sacado_id,
      } = body;
      const id = randomUUID();
      const now = new Date().toISOString();

      await db.execute({
        sql: `INSERT INTO leads
              (id, created_at, nome_contratado, cnpj_contratado, situacao_contratado,
               nome_sacado, cnpj_sacado, situacao_sacado,
               valor, valor_numerico, prazo_limite, parcelas, fim_type, cedente_id, sacado_id,
               criado_por_id, criado_por_nome)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id, now,
          nome_contratado ?? null, cnpj_contratado ?? null, situacao_contratado ?? null,
          nome_sacado ?? null, cnpj_sacado ?? null, situacao_sacado ?? null,
          valor ?? null, valor_numerico ?? null, prazo_limite ?? null,
          parcelas != null ? JSON.stringify(parcelas) : null,
          fim_type ?? null, cedente_id ?? null, sacado_id ?? null,
          autorId, autorNome,
        ],
      });

      let currentStatusId: number | null = null;
      if (status_id) {
        const sc = await db.execute({ sql: 'SELECT nome FROM status_configs WHERE id = ?', args: [status_id] });
        const nome = String(sc.rows[0]?.nome ?? '');
        await db.execute({
          sql: `INSERT INTO lead_eventos (lead_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
                VALUES (?, 'status_change', ?, ?, ?, ?, ?)`,
          args: [id, status_id, `Movido para ${nome}`, now, autorId, autorNome],
        });
        currentStatusId = Number(status_id);
      }

      return {
        status: 200,
        body: {
          submission: {
            id, created_at: now,
            nome_contratado: nome_contratado ?? null,
            cnpj_contratado: cnpj_contratado ?? null,
            nome_sacado: nome_sacado ?? null,
            cnpj_sacado: cnpj_sacado ?? null,
            valor: valor ?? null,
            prazo_limite: prazo_limite ?? null,
            fim_type: fim_type ?? null,
            decisions: null,
            arquivo_count: 0,
            current_status_id: currentStatusId,
            status_since: status_id ? now : null,
            parcelas: parcelas != null ? JSON.stringify(parcelas) : null,
          },
        },
      };
    }

    if (action === 'update_submission') {
      const {
        id: subId, nome_contratado, cnpj_contratado, situacao_contratado,
        nome_sacado, cnpj_sacado, situacao_sacado, cedente_id, sacado_id,
        valor, valor_numerico, prazo_limite, parcelas, decisions, fim_type,
      } = body;
      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE leads SET
          nome_contratado=?, cnpj_contratado=?, situacao_contratado=?,
          nome_sacado=?, cnpj_sacado=?, situacao_sacado=?, cedente_id=?, sacado_id=?,
          valor=?, valor_numerico=?, prazo_limite=?, parcelas=?, decisions=?, fim_type=?
          WHERE id=?`,
        args: [
          nome_contratado ?? null, cnpj_contratado ?? null, situacao_contratado ?? null,
          nome_sacado ?? null, cnpj_sacado ?? null, situacao_sacado ?? null,
          cedente_id ?? null, sacado_id ?? null,
          valor ?? null, valor_numerico ?? null, prazo_limite ?? null,
          parcelas != null ? JSON.stringify(parcelas) : null,
          decisions != null ? JSON.stringify(decisions) : null,
          fim_type ?? null,
          subId,
        ],
      });
      await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'edicao', 'Dados editados', ?, ?, ?)`,
        args: [subId, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'leads', subId, autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_submission') {
      const now = new Date().toISOString();
      await db.execute({
        sql: 'UPDATE leads SET deleted_at = ? WHERE id = ?',
        args: [now, body.id],
      });
      await db.execute({
        sql: `INSERT INTO lead_eventos (lead_id, tipo, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'edicao', 'Lead excluída', ?, ?, ?)`,
        args: [body.id, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'leads', String(body.id), autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    // ── Aceite operacoes CRUD ────────────────────────────────────────────────────

  }

  return { status: 405, body: { error: 'Method not allowed' } };
}
