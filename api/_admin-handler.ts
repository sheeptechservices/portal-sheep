import type { Client } from '@libsql/client';
import { randomUUID, randomBytes } from 'crypto';
import {
  ANTHROPIC_KEY, DEFAULT_ANTHROPIC_MODEL,
  getIntegrationCredential, saveIntegrationCredential,
  updateIntegrationMeta, removeIntegrationCredential, validateAnthropicKey,
} from './_credentials.js';
import { ensureDiretrizesSchema } from './_diretrizes.js';
import { ensureAnalisesSchema, ANALISE_LIST_COLS, ANALISE_ARQUIVO_COLS } from './_analises.js';
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
    CREATE TABLE IF NOT EXISTS solicitacoes (
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
  try { await ddl(`ALTER TABLE solicitacoes ADD COLUMN parcelas TEXT`); } catch {}

  await ddl(`
    CREATE TABLE IF NOT EXISTS solicitacao_arquivos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id TEXT NOT NULL,
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
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      status_id         INTEGER NOT NULL,
      slack_user_id     TEXT NOT NULL,
      slack_user_name   TEXT NOT NULL,
      slack_user_avatar TEXT,
      UNIQUE(status_id, slack_user_id)
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS nova_solicitacao_notificacoes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_user_id     TEXT NOT NULL UNIQUE,
      slack_user_name   TEXT NOT NULL,
      slack_user_avatar TEXT
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS solicitacao_eventos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      status_id      INTEGER,
      descricao      TEXT,
      parent_id      INTEGER,
      criado_em      TEXT NOT NULL
    )
  `);
  // Migration: add parent_id if it doesn't exist yet
  try {
    await ddl(`ALTER TABLE solicitacao_eventos ADD COLUMN parent_id INTEGER`);
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
    `ALTER TABLE solicitacoes ADD COLUMN cedente_id INTEGER`,
    `ALTER TABLE solicitacoes ADD COLUMN sacado_id INTEGER`,
    `ALTER TABLE sacados ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1`,
    // `cidade_estado` saiu daqui: a lista tinha o ADD e o DROP da mesma coluna,
    // então toda partida recriava e derrubava a coluna de novo, sem fim. A
    // coluna não deve existir, e não existe - nada a migrar.
    `ALTER TABLE solicitacoes ADD COLUMN liquidez TEXT`,
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
    CREATE TABLE IF NOT EXISTS solicitacao_etapa_arquivos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id TEXT NOT NULL,
      status_id      INTEGER NOT NULL,
      nome           TEXT NOT NULL,
      tipo           TEXT NOT NULL,
      tamanho        INTEGER NOT NULL,
      base64         TEXT NOT NULL,
      criado_em      TEXT NOT NULL
    )
  `);
  // Categoria do anexo (Lastro, Proposta, etc.) - em ambas as tabelas de arquivos
  try { await ddl(`ALTER TABLE solicitacao_etapa_arquivos ADD COLUMN categoria TEXT`); } catch {}

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

  await ddl(`
    CREATE TABLE IF NOT EXISTS liquidez_transactions (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      source      TEXT NOT NULL CHECK(source IN ('interno', 'atlas', 'fidc')),
      type        TEXT NOT NULL CHECK(type IN ('entrada', 'saida')),
      category    TEXT NOT NULL,
      amount      REAL NOT NULL,
      description TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try { await ddl(`ALTER TABLE liquidez_transactions ADD COLUMN realized INTEGER NOT NULL DEFAULT 0`); } catch {}
  try { await ddl(`ALTER TABLE solicitacoes ADD COLUMN deleted_at TEXT`); } catch {}
  // Datas de execução (só via sistema, não vêm do formulário): previsão posiciona o
  // card na liquidez; data_execucao registra quando a operação foi de fato executada.
  try { await ddl(`ALTER TABLE solicitacoes ADD COLUMN previsao_execucao TEXT`); } catch {}
  try { await ddl(`ALTER TABLE solicitacoes ADD COLUMN data_execucao TEXT`); } catch {}

  await ddl(`
    CREATE TABLE IF NOT EXISTS liquidez_saldos (
      week_start TEXT NOT NULL,
      source     TEXT NOT NULL,
      amount     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (week_start, source)
    )
  `);

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

  // Migration: add is_entrada flag (etapa que recebe as solicitações do formulário)
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

  // Pendências (checklist) de uma solicitação - ex.: "Aprovado com Pendência"
  await ddl(`
    CREATE TABLE IF NOT EXISTS solicitacao_pendencias (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id TEXT NOT NULL,
      descricao      TEXT NOT NULL,
      categoria      TEXT,
      resolvida      INTEGER NOT NULL DEFAULT 0,
      status_id      INTEGER,
      criado_em      TEXT NOT NULL,
      resolvido_em   TEXT
    )
  `);

  // Relatório DEPS (cedente/sacado) persistido por solicitação - gerado no módulo
  // de Análise de Crédito e acessível no balão da parte no card da solicitação.
  await ddl(`
    CREATE TABLE IF NOT EXISTS solicitacao_deps (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      solicitacao_id TEXT NOT NULL,
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
  try { await ddl(`ALTER TABLE solicitacao_deps ADD COLUMN raw_json TEXT`); } catch {}

  // Data migration: strip hyphens from conta_escrow (idempotent)
  await db.execute(`UPDATE cedentes SET conta_escrow = REPLACE(conta_escrow, '-', '') WHERE conta_escrow IS NOT NULL AND conta_escrow LIKE '%-%'`);

  // Data migration: corrige "FIDIC" → "FIDC" na origem de liquidez (idempotente) - DUX-327
  await db.execute(`UPDATE solicitacoes SET liquidez = 'FIDC' WHERE liquidez = 'FIDIC'`);

  // Seed default statuses on first run
  const cnt = await db.execute('SELECT COUNT(*) as c FROM status_configs');
  if (Number(cnt.rows[0].c) === 0) {
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Em análise', '#FFB400', 1)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Documentação', '#0066CC', 2)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Aprovado', '#1E8A3E', 3)`);
    await db.execute(`INSERT INTO status_configs (nome, cor, ordem) VALUES ('Cancelado', '#D93025', 4)`);
  }

  await ddl(`
    CREATE TABLE IF NOT EXISTS aceite_operacoes (
      id                        TEXT PRIMARY KEY,
      token                     TEXT NOT NULL UNIQUE,
      solicitacao_id            TEXT NOT NULL,
      tipo                      TEXT NOT NULL DEFAULT 'ACEITE_SACADO',
      status                    TEXT NOT NULL DEFAULT 'PENDENTE',
      nome_cedente              TEXT NOT NULL,
      cnpj_cedente              TEXT NOT NULL,
      email_cedente             TEXT,
      email_cedente_responsavel TEXT,
      nome_sacado               TEXT NOT NULL,
      cnpj_sacado               TEXT,
      numero_nf                 TEXT,
      data_emissao_nf           TEXT,
      valor_nf                  REAL,
      vencimento                TEXT,
      periodo_servico           TEXT,
      parcelas                  TEXT,
      banco_nome                TEXT,
      titular_conta             TEXT,
      cnpj_titular              TEXT,
      agencia                   TEXT,
      conta                     TEXT,
      token_expires_at          TEXT NOT NULL,
      email_history             TEXT,
      aceitante                 TEXT,
      criado_em                 TEXT NOT NULL
    )
  `);

  await ddl(`
    CREATE TABLE IF NOT EXISTS aceite_anexos (
      id          TEXT PRIMARY KEY,
      operacao_id TEXT NOT NULL,
      nome        TEXT NOT NULL,
      tipo        TEXT NOT NULL,
      tamanho     INTEGER NOT NULL,
      data_url    TEXT NOT NULL,
      criado_em   TEXT NOT NULL
    )
  `);

  // Notificações do pipeline de auto-cadastro de cedentes (mesma lógica das solicitações).
  // Por etapa fixa (pendente/em_analise/aprovado/rejeitado):
  await ddl(`
    CREATE TABLE IF NOT EXISTS cadastro_etapa_notificacoes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      etapa             TEXT NOT NULL,
      slack_user_id     TEXT NOT NULL,
      slack_user_name   TEXT NOT NULL,
      slack_user_avatar TEXT,
      UNIQUE(etapa, slack_user_id)
    )
  `);
  // No momento da submissão do formulário de cadastro:
  await ddl(`
    CREATE TABLE IF NOT EXISTS cadastro_submissao_notificacoes (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_user_id     TEXT NOT NULL UNIQUE,
      slack_user_name   TEXT NOT NULL,
      slack_user_avatar TEXT
    )
  `);

  // Etapas configuráveis do pipeline de onboarding (auto-cadastro).
  // `chave` é o valor persistido em cedentes.aprovacao_status. As chaves
  // 'aprovado' e 'rejeitado' são âncoras semânticas protegidas (controlam o
  // acesso ao formulário público) - podem ser renomeadas/recoloridas/reordenadas,
  // mas não excluídas. Demais etapas são livres e contam como "em análise".
  await ddl(`
    CREATE TABLE IF NOT EXISTS cadastro_status_configs (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      chave TEXT NOT NULL UNIQUE,
      nome  TEXT NOT NULL,
      cor   TEXT NOT NULL DEFAULT '#AAAAAA',
      ordem INTEGER NOT NULL DEFAULT 0,
      ativo INTEGER NOT NULL DEFAULT 1
    )
  `);
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
    ['solicitacao_eventos',    ['autor_id TEXT', 'autor_nome TEXT']],
    ['solicitacoes',           ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['cedentes',               ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['sacados',                ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['liquidez_transactions',  ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
    ['solicitacao_pendencias', ['criado_por_id TEXT', 'criado_por_nome TEXT', 'resolvido_por_id TEXT', 'resolvido_por_nome TEXT']],
    ['aceite_operacoes',       ['criado_por_id TEXT', 'criado_por_nome TEXT', 'atualizado_por_id TEXT', 'atualizado_por_nome TEXT', 'atualizado_em TEXT']],
  ];
  for (const [tabela, colunas] of colunasAutoria) {
    for (const coluna of colunas) {
      try { await ddl(`ALTER TABLE ${tabela} ADD COLUMN ${coluna}`); } catch {}
    }
  }

  // Diretrizes do motor de crédito (regras da casa aprendidas com o operador)
  await ensureDiretrizesSchema(db, ddl);
  // Histórico de análises de crédito validadas
  await ensureAnalisesSchema(db, ddl);

  // Índices nas chaves estrangeiras. Sem eles, cada busca por `solicitacao_id`
  // (etc.) vira full table scan: o board roda subqueries correlacionadas por
  // linha e cada abertura de detalhe varre as tabelas filhas inteiras, o que
  // dispara o "rows read" do Turso. Os índices transformam isso em busca direta.
  const indices = [
    // Cobre comentario_count, o MAX(id) de status_change do board e o detalhe.
    `CREATE INDEX IF NOT EXISTS idx_eventos_sol ON solicitacao_eventos (solicitacao_id, tipo, id)`,
    `CREATE INDEX IF NOT EXISTS idx_eventos_parent ON solicitacao_eventos (parent_id)`,
    `CREATE INDEX IF NOT EXISTS idx_etapa_arq_sol ON solicitacao_etapa_arquivos (solicitacao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sol_arq_sol ON solicitacao_arquivos (solicitacao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pend_sol ON solicitacao_pendencias (solicitacao_id, resolvida)`,
    `CREATE INDEX IF NOT EXISTS idx_deps_sol ON solicitacao_deps (solicitacao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_arq_ced ON cedente_arquivos (cedente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_pend_ced ON cedente_pendencias (cedente_id)`,
    `CREATE INDEX IF NOT EXISTS idx_aceite_op_sol ON aceite_operacoes (solicitacao_id)`,
    `CREATE INDEX IF NOT EXISTS idx_aceite_anexos_op ON aceite_anexos (operacao_id)`,
    // Autoria. A tela de Perfil filtra por pessoa (`autor_id`, `criado_por_id`,
    // `usuario_id`) e nenhum dos índices acima começa por essas colunas, então
    // cada contagem varria a tabela inteira. Índice por coluna consultada, e
    // não por coluna existente: autoria que ninguém filtra não ganha índice,
    // porque índice também custa em toda gravação.
    // `(autor_id, tipo)` serve as duas contagens de eventos: a de comentários
    // usa as duas colunas, a de eventos usa só o prefixo.
    `CREATE INDEX IF NOT EXISTS idx_eventos_autor ON solicitacao_eventos (autor_id, tipo)`,
    `CREATE INDEX IF NOT EXISTS idx_sol_autor ON solicitacoes (criado_por_id)`,
    `CREATE INDEX IF NOT EXISTS idx_ced_autor ON cedentes (criado_por_id)`,
    `CREATE INDEX IF NOT EXISTS idx_pend_autor ON solicitacao_pendencias (criado_por_id)`,
    // `(usuario_id, id DESC)` cobre a contagem e as últimas 15 ações no mesmo
    // índice - o ORDER BY sai de graça, sem passo de ordenação.
    `CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria (usuario_id, id DESC)`,
  ];
  for (const sql of indices) { try { await ddl(sql); } catch { /* tabela ainda não existe em algum estado - ignora */ } }

  const cadCnt = await db.execute('SELECT COUNT(*) as c FROM cadastro_status_configs');
  if (Number(cadCnt.rows[0].c) === 0) {
    const seed: Array<[string, string, string, number]> = [
      ['pendente',   'Pendente',   '#FFB400', 1],
      ['em_analise', 'Em análise', '#0066CC', 2],
      ['aprovado',   'Aprovado',   '#1E8A3E', 3],
      ['rejeitado',  'Rejeitado',  '#D93025', 4],
    ];
    for (const [chave, nome, cor, ordem] of seed) {
      await db.execute({
        sql: 'INSERT INTO cadastro_status_configs (chave, nome, cor, ordem, ativo) VALUES (?,?,?,?,1)',
        args: [chave, nome, cor, ordem],
      });
    }
  }

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
export type TabelaComEdicao = 'solicitacoes' | 'cedentes' | 'sacados' | 'aceite_operacoes';

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
 * Etapa de entrada do pipeline de solicitações: a marcada com `is_entrada` nas
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
      FROM solicitacoes s
      INNER JOIN (
        SELECT e.solicitacao_id, e.status_id
        FROM solicitacao_eventos e
        WHERE e.tipo = 'status_change'
          AND e.id = (
            SELECT MAX(e2.id) FROM solicitacao_eventos e2
            WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
          )
      ) curr ON curr.solicitacao_id = s.id
      LEFT JOIN status_configs sc ON sc.id = curr.status_id AND sc.ativo = 1
      WHERE sc.id IS NULL
    `);
    for (const row of orphans.rows) {
      await db.execute({
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em)
              VALUES (?, 'status_change', ?, 'Reagrupado após exclusão de etapa', ?)`,
        args: [row.id, targetId, now],
      });
    }
  } catch (_) { /* non-fatal */ }
}

export async function getNovaSubmissaoRecipients(db: Client): Promise<string[]> {
  await ensureAdminSchema(db);
  const rows = await db.execute('SELECT slack_user_id FROM nova_solicitacao_notificacoes');
  return rows.rows.map(r => String(r.slack_user_id));
}

export async function getCadastroSubmissaoRecipients(db: Client): Promise<string[]> {
  await ensureAdminSchema(db);
  const rows = await db.execute('SELECT slack_user_id FROM cadastro_submissao_notificacoes');
  return rows.rows.map(r => String(r.slack_user_id));
}

async function notifyMentions(token: string, texto: string, solicitacaoId: string, db: Client) {
  // \w+ doesn't capture dots - use [\w.]+ so "guilherme.zaidan" is captured in full
  const usernames = [...new Set((texto.match(/@([\w.]+)/g) ?? []).map(m => m.slice(1)))];
  if (usernames.length === 0) return;

  console.log('[mention-notify] mentions detected:', usernames);

  const r = await fetch('https://slack.com/api/users.list?limit=200', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json() as { ok: boolean; members?: any[] };
  if (!data.ok) { console.error('[mention-notify] users.list failed:', data); return; }

  const members = (data.members ?? []).filter(
    (m: any) => !m.is_bot && !m.deleted && m.id !== 'USLACKBOT'
  );

  const sol = await db.execute({
    sql: 'SELECT nome_contratado FROM solicitacoes WHERE id = ?',
    args: [solicitacaoId],
  });
  const nomeSol = String(sol.rows[0]?.nome_contratado ?? solicitacaoId);

  for (const username of usernames) {
    const member = members.find((m: any) => m.name === username);
    if (!member) { console.warn('[mention-notify] no Slack user found for username:', username); continue; }
    console.log('[mention-notify] notifying', member.id, 'for mention of', username);
    const msg = `💬 *Você foi mencionado em um comentário*\n*Solicitação:* ${nomeSol}\n> ${texto}`;
    notifySlack(token, member.id, msg);
  }
}

async function notifyStageMentions(token: string, texto: string, solicitacaoId: string, db: Client) {
  const stageNames = [...new Set((texto.match(/#\[([^\]]+)\]/g) ?? []).map(m => m.slice(2, -1)))];
  if (stageNames.length === 0) return;

  console.log('[stage-notify] stage mentions detected:', stageNames);

  const sol = await db.execute({
    sql: 'SELECT nome_contratado FROM solicitacoes WHERE id = ?',
    args: [solicitacaoId],
  });
  const nomeSol = String(sol.rows[0]?.nome_contratado ?? solicitacaoId);

  for (const stageName of stageNames) {
    const statusResult = await db.execute({
      sql: 'SELECT id FROM status_configs WHERE nome = ? AND ativo = 1 LIMIT 1',
      args: [stageName],
    });
    if (statusResult.rows.length === 0) { console.warn('[stage-notify] no status found for:', stageName); continue; }
    const statusId = statusResult.rows[0].id;

    const notifs = await db.execute({
      sql: 'SELECT slack_user_id FROM status_notificacoes WHERE status_id = ?',
      args: [statusId],
    });
    if (notifs.rows.length === 0) { console.log('[stage-notify] no subscribers for stage:', stageName); continue; }

    const msg = `🏷️ *A etapa "${stageName}" foi mencionada em um comentário*\n*Solicitação:* ${nomeSol}\n> ${texto}`;
    for (const n of notifs.rows) {
      console.log('[stage-notify] notifying', n.slack_user_id, 'for stage', stageName);
      notifySlack(token, String(n.slack_user_id), msg);
    }
  }
}

async function notifySlack(token: string, userId: string, text: string) {
  try {
    const dm = await fetch('https://slack.com/api/conversations.open', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: userId }),
    }).then(r => r.json()) as { ok: boolean; channel?: { id: string } };
    if (!dm.ok || !dm.channel) return;
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: dm.channel.id, text }),
    });
  } catch {}
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
  const alvo = body?.id ?? body?.solicitacao_id ?? body?.cedente_id ?? body?.analise_id ??
               body?.status_id ?? body?.sacado_id ?? body?.chave ?? body?.slack_user_id ??
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
  slackToken?: string,
  usuario?: UsuarioAdmin | null
): Promise<{ status: number; body: any }> {
  const resultado = await despacharAdminData(method, query, body, db, slackToken, usuario);
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
  slackToken?: string,
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
      const [linha, comentarios, eventos, solicitacoes, cedentes, analises, pendencias, acoes, ultimas] = await Promise.all([
        conta('SELECT id, email, nome, foto_url, papel, criado_em, ultimo_acesso FROM usuarios WHERE id = ?'),
        conta("SELECT COUNT(*) c FROM solicitacao_eventos WHERE autor_id = ? AND tipo = 'comentario'"),
        conta('SELECT COUNT(*) c FROM solicitacao_eventos WHERE autor_id = ?'),
        conta('SELECT COUNT(*) c FROM solicitacoes WHERE criado_por_id = ?'),
        conta('SELECT COUNT(*) c FROM cedentes WHERE criado_por_id = ?'),
        conta('SELECT COUNT(*) c FROM credito_analises WHERE criado_por_id = ?'),
        // Só conta o que foi aberto depois que a coluna passou a ser gravada:
        // pendência anterior a isso tem o nome, mas não o id.
        conta('SELECT COUNT(*) c FROM solicitacao_pendencias WHERE criado_por_id = ?'),
        conta('SELECT COUNT(*) c FROM auditoria WHERE usuario_id = ?'),
        conta('SELECT acao, alvo, criado_em FROM auditoria WHERE usuario_id = ? ORDER BY id DESC LIMIT 15'),
      ]);
      const n = (r: { rows: any[] }) => Number(r.rows[0]?.c ?? 0);
      return {
        status: 200,
        body: {
          usuario: linha.rows[0] ?? null,
          resumo: {
            comentarios: n(comentarios), eventos: n(eventos), solicitacoes: n(solicitacoes),
            cedentes: n(cedentes), analises: n(analises), pendencias: n(pendencias), acoes: n(acoes),
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
          COUNT(DISTINCT a.id) + (SELECT COUNT(*) FROM solicitacao_etapa_arquivos ea WHERE ea.solicitacao_id = s.id) AS arquivo_count,
          (SELECT COUNT(*) FROM solicitacao_eventos c WHERE c.solicitacao_id = s.id AND c.tipo = 'comentario') AS comentario_count,
          (SELECT COUNT(*) FROM solicitacao_pendencias p WHERE p.solicitacao_id = s.id AND p.resolvida = 0) AS pendencia_aberta_count,
          (SELECT COUNT(*) FROM solicitacao_pendencias p WHERE p.solicitacao_id = s.id) AS pendencia_total_count,
          curr.status_id AS current_status_id,
          curr.criado_em  AS status_since
        FROM solicitacoes s
        LEFT JOIN cedentes ced ON ced.id = s.cedente_id
        LEFT JOIN sacados sac ON sac.id = s.sacado_id
        LEFT JOIN solicitacao_arquivos a ON a.solicitacao_id = s.id
        LEFT JOIN (
          SELECT e.solicitacao_id, e.status_id, e.criado_em
          FROM solicitacao_eventos e
          WHERE e.tipo = 'status_change'
            AND e.id = (
              SELECT MAX(e2.id) FROM solicitacao_eventos e2
              WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
            )
        ) curr ON curr.solicitacao_id = s.id
        WHERE s.deleted_at IS NULL
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `),
      ]);
      return { status: 200, body: { statuses: statuses.rows, submissions: subs.rows } };
    }

    // Busca rápida global (⌘K): cards de solicitações + cadastros de onboarding.
    // Casa por nome/razão social, CNPJ/CPF (com ou sem máscara), e-mail e id do card.
    if (action === 'quick_search') {
      const raw = (query.get('q') ?? '').trim();
      if (raw.length < 2) return { status: 200, body: { solicitacoes: [], cadastros: [] } };

      // A busca é livre para qualquer sessão, mas o resultado não: quem não
      // enxerga o kanban não pode achar cards dele por aqui. Sem este filtro a
      // busca rápida seria a porta dos fundos das duas páginas.
      const veSolicitacoes = pode(permissoes, 'solicitacoes:ver');
      const veCadastros = pode(permissoes, 'onboarding:ver');
      if (!veSolicitacoes && !veCadastros) return { status: 200, body: { solicitacoes: [], cadastros: [] } };

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

      const cadCond = [
        `${sqlFold('c.nome')} LIKE ?`,
        `${sqlFold('c.razao_social')} LIKE ?`,
        `${sqlFold('c.nome_responsavel')} LIKE ?`,
        `${sqlFold('c.email')} LIKE ?`,
      ];
      const cadArgs: any[] = [term, term, term, term];
      if (digitTerm) {
        cadCond.push(`${sqlDigits('c.cnpj_cpf')} LIKE ?`, `${sqlDigits('c.cpf_responsavel')} LIKE ?`);
        cadArgs.push(digitTerm, digitTerm);
      }

      const [sols, cads] = await Promise.all([
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
              FROM solicitacoes s
              LEFT JOIN cedentes ced ON ced.id = s.cedente_id
              LEFT JOIN sacados sac ON sac.id = s.sacado_id
              LEFT JOIN (
                SELECT e.solicitacao_id, e.status_id
                FROM solicitacao_eventos e
                WHERE e.tipo = 'status_change'
                  AND e.id = (
                    SELECT MAX(e2.id) FROM solicitacao_eventos e2
                    WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.solicitacao_id = s.id
              LEFT JOIN status_configs st ON st.id = curr.status_id
            ) x
            WHERE x.deleted_at IS NULL AND (${solCond.join(' OR ')})
            ORDER BY x.created_at DESC
            LIMIT ${LIMIT}
          `,
          args: solArgs,
        }),
        db.execute({
          sql: `
            SELECT c.id, c.nome, c.razao_social, c.cnpj_cpf, c.nome_responsavel,
                   c.aprovacao_status, c.criado_em,
                   cs.nome AS etapa_nome, cs.cor AS etapa_cor
            FROM cedentes c
            LEFT JOIN cadastro_status_configs cs ON cs.chave = c.aprovacao_status
            WHERE c.ativo = 1 AND c.origem = 'Auto-cadastro' AND (${cadCond.join(' OR ')})
            ORDER BY c.criado_em DESC
            LIMIT ${LIMIT}
          `,
          args: cadArgs,
        }),
      ]);

      return {
        status: 200,
        body: {
          solicitacoes: veSolicitacoes ? sols.rows : [],
          cadastros: veCadastros ? cads.rows : [],
        },
      };
    }

    if (action === 'status_configs') {
      const [statuses, notifs] = await Promise.all([
        db.execute('SELECT * FROM status_configs WHERE ativo = 1 ORDER BY ordem'),
        db.execute('SELECT * FROM status_notificacoes ORDER BY slack_user_name'),
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
        sql: `SELECT COUNT(*) as count FROM solicitacoes s
              INNER JOIN (
                SELECT e.solicitacao_id FROM solicitacao_eventos e
                WHERE e.tipo = 'status_change' AND CAST(e.status_id AS TEXT) = CAST(? AS TEXT)
                  AND e.id = (
                    SELECT MAX(e2.id) FROM solicitacao_eventos e2
                    WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.solicitacao_id = s.id
              WHERE s.deleted_at IS NULL`,
        args: [statusId],
      });
      return { status: 200, body: { count: Number(r.rows[0]?.count ?? 0) } };
    }

    if (action === 'slack_config') {
      return { status: 200, body: { has_token: !!slackToken } };
    }

    // Credenciais da DEPS vivem em variáveis de ambiente (igual ao Slack) - a UI
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

    if (action === 'list_diretrizes') {
      // status: 'ativa' (default) | 'all'
      const filtro = query.get('status') ?? 'ativa';
      const sql = filtro === 'all'
        ? `SELECT * FROM credito_diretrizes ORDER BY status, categoria, escopo, prioridade DESC, id DESC`
        : `SELECT * FROM credito_diretrizes WHERE status = 'ativa' ORDER BY categoria, escopo, prioridade DESC, id DESC`;
      const r = await db.execute(sql);
      return { status: 200, body: { diretrizes: r.rows } };
    }

    // Histórico de análises de crédito. Filtros opcionais: q (cedente/sacado/
    // protocolo), status, de/ate (data ISO yyyy-mm-dd). Sem snapshot - a lista
    // só precisa dos campos de prateleira.
    if (action === 'list_analises') {
      const q = (query.get('q') ?? '').trim();
      const status = (query.get('status') ?? '').trim();
      const de = (query.get('de') ?? '').trim();
      const ate = (query.get('ate') ?? '').trim();
      const limit = Math.min(Math.max(Number(query.get('limit') ?? 200) || 200, 1), 500);

      const where: string[] = [];
      const args: any[] = [];
      if (q) {
        where.push('(cedente_nome LIKE ? OR sacado_nome LIKE ? OR cedente_cnpj LIKE ? OR sacado_cnpj LIKE ? OR protocolo LIKE ?)');
        const like = `%${q}%`;
        args.push(like, like, like, like, like);
      }
      if (status) { where.push('status = ?'); args.push(status); }
      if (de) { where.push('criado_em >= ?'); args.push(`${de}T00:00:00.000Z`); }
      // `ate` é inclusivo: pega o dia inteiro
      if (ate) { where.push('criado_em <= ?'); args.push(`${ate}T23:59:59.999Z`); }

      const r = await db.execute({
        sql: `SELECT ${ANALISE_LIST_COLS},
                     (SELECT COUNT(*) FROM credito_analise_arquivos a WHERE a.analise_id = credito_analises.id) AS arquivo_count
              FROM credito_analises
              ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
              ORDER BY criado_em DESC, id DESC LIMIT ?`,
        args: [...args, limit],
      });
      return { status: 200, body: { analises: r.rows } };
    }

    // Relatórios DEPS (cedente/sacado) salvos de uma solicitação - para o link no balão.
    if (action === 'deps_by_solicitacao') {
      const sid = query.get('solicitacao_id');
      if (!sid) return { status: 400, body: { error: 'solicitacao_id required' } };
      // Mais recente por alvo (agrupa por alvo, pega o maior id).
      const r = await db.execute({
        sql: `SELECT d.alvo, d.nome, d.documento, d.norm_json, d.raw_json, d.criado_em
              FROM solicitacao_deps d
              WHERE d.solicitacao_id = ? AND d.id = (
                SELECT MAX(d2.id) FROM solicitacao_deps d2 WHERE d2.solicitacao_id = d.solicitacao_id AND d2.alvo = d.alvo
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

    // Pendências de uma solicitação (leve) - usada ao mover no board para pré-preencher
    // o modal de "Registrar pendências" com as pendências já existentes.
    if (action === 'pendencias_by_solicitacao') {
      const sid = query.get('solicitacao_id');
      if (!sid) return { status: 400, body: { error: 'solicitacao_id required' } };
      const r = await db.execute({
        sql: 'SELECT id, descricao, categoria, resolvida FROM solicitacao_pendencias WHERE solicitacao_id = ? ORDER BY resolvida ASC, criado_em ASC',
        args: [sid],
      });
      return { status: 200, body: { pendencias: r.rows } };
    }

    // Detalhe de uma análise - inclui snapshot e parecer da IA (reimpressão)
    if (action === 'analise_detail') {
      const id = Number(query.get('id'));
      if (!Number.isFinite(id)) return { status: 400, body: { error: 'ID inválido.' } };
      const [r, arqs] = await Promise.all([
        db.execute({ sql: 'SELECT * FROM credito_analises WHERE id = ?', args: [id] }),
        db.execute({
          sql: `SELECT ${ANALISE_ARQUIVO_COLS} FROM credito_analise_arquivos WHERE analise_id = ? ORDER BY id ASC`,
          args: [id],
        }),
      ]);
      const row = r.rows[0];
      if (!row) return { status: 404, body: { error: 'Análise não encontrada.' } };
      const parse = (v: any) => { try { return v ? JSON.parse(String(v)) : null; } catch { return null; } };
      return {
        status: 200,
        body: {
          analise: { ...row, snapshot: parse(row.snapshot), parecer_ia: parse(row.parecer_ia) },
          arquivos: arqs.rows,
        },
      };
    }

    // Conteúdo de UM anexo da análise (ver/baixar) - mesmo contrato dos anexos
    // do cedente, para reaproveitar o b64ToFile/preview do front.
    if (action === 'get_analise_arquivo_base64') {
      const id = Number(query.get('id'));
      if (!Number.isFinite(id)) return { status: 400, body: { error: 'id inválido.' } };
      const r = await db.execute({
        sql: 'SELECT nome, mime, base64 FROM credito_analise_arquivos WHERE id = ?',
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

    if (action === 'cadastro_notif_config') {
      const [etapas, etapa, sub] = await Promise.all([
        db.execute('SELECT * FROM cadastro_status_configs WHERE ativo = 1 ORDER BY ordem'),
        db.execute('SELECT * FROM cadastro_etapa_notificacoes ORDER BY slack_user_name'),
        db.execute('SELECT * FROM cadastro_submissao_notificacoes ORDER BY slack_user_name'),
      ]);
      const result = etapas.rows.map(e => ({
        ...e,
        locked: CADASTRO_LOCKED_CHAVES.includes(String(e.chave)) ? 1 : 0,
        notificacoes: etapa.rows.filter(n => String(n.etapa) === String(e.chave)),
      }));
      return { status: 200, body: { etapas: result, etapa_notificacoes: etapa.rows, submissao_notificacoes: sub.rows } };
    }

    // Etapas do onboarding para o board público/admin (colunas dinâmicas)
    if (action === 'cadastro_status_configs') {
      const etapas = await db.execute('SELECT * FROM cadastro_status_configs WHERE ativo = 1 ORDER BY ordem');
      const result = etapas.rows.map(e => ({ ...e, locked: CADASTRO_LOCKED_CHAVES.includes(String(e.chave)) ? 1 : 0 }));
      return { status: 200, body: { etapas: result } };
    }

    if (action === 'cadastro_status_card_count') {
      const chave = query.get('chave');
      const r = await db.execute({
        sql: `SELECT COUNT(*) as count FROM cedentes WHERE ativo = 1 AND origem = 'Auto-cadastro' AND aprovacao_status = ?`,
        args: [chave],
      });
      return { status: 200, body: { count: Number(r.rows[0]?.count ?? 0) } };
    }

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
      // Sacados que já operaram com esse cedente (via solicitacoes)
      const linked = await db.execute({
        sql: `SELECT DISTINCT s.id, s.cnpj_cpf, s.razao_social FROM sacados s
              WHERE s.ativo = 1
              AND s.cnpj_cpf IN (
                SELECT DISTINCT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(sol.cnpj_sacado,'.',''),'/',''),'-',''),' ',''),'_','')
                FROM solicitacoes sol
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

    if (action === 'list_solicitacoes_for_aceite') {
      const rows = await db.execute(`
        SELECT
          s.id, s.created_at, s.nome_contratado, s.cnpj_contratado,
          s.nome_sacado, s.cnpj_sacado, s.valor, s.valor_numerico, s.prazo_limite, s.parcelas,
          c.id        AS cedente_id,        c.nome         AS cedente_nome,
          c.razao_social AS cedente_razao_social,
          c.cnpj_cpf  AS cedente_cnpj,      c.email        AS cedente_email,
          c.email_responsavel AS cedente_email_responsavel,
          c.conta_escrow AS cedente_conta_escrow,
          sac.id      AS sacado_id_db,      sac.razao_social AS sacado_razao_social,
          sac.cnpj_cpf AS sacado_cnpj_db
        FROM solicitacoes s
        LEFT JOIN cedentes c ON c.id = (
          CASE WHEN s.cedente_id IS NOT NULL THEN s.cedente_id
               ELSE (SELECT id FROM cedentes WHERE REPLACE(REPLACE(REPLACE(cnpj_cpf,'.',''),'/',''),'-','') = REPLACE(REPLACE(REPLACE(s.cnpj_contratado,'.',''),'/',''),'-','') LIMIT 1)
          END
        )
        LEFT JOIN sacados sac ON sac.id = (
          CASE WHEN s.sacado_id IS NOT NULL THEN s.sacado_id
               ELSE (SELECT id FROM sacados WHERE REPLACE(REPLACE(REPLACE(cnpj_cpf,'.',''),'/',''),'-','') = REPLACE(REPLACE(REPLACE(s.cnpj_sacado,'.',''),'/',''),'-','') LIMIT 1)
          END
        )
        LEFT JOIN (
          SELECT e.solicitacao_id, e.status_id
          FROM solicitacao_eventos e
          WHERE e.tipo = 'status_change'
            AND e.id = (
              SELECT MAX(e2.id) FROM solicitacao_eventos e2
              WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
            )
        ) curr ON curr.solicitacao_id = s.id
        LEFT JOIN status_configs sc ON sc.id = curr.status_id
        WHERE s.deleted_at IS NULL
          AND (sc.is_excluded IS NULL OR sc.is_excluded = 0)
          AND (sc.is_conversion IS NULL OR sc.is_conversion = 0)
        ORDER BY s.created_at DESC
        LIMIT 300
      `);
      return { status: 200, body: { solicitacoes: rows.rows } };
    }

    if (action === 'get_solicitacao_files') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'id required' } };
      const rows = await db.execute({
        sql: `SELECT nome, tipo, tamanho, categoria, base64 FROM solicitacao_arquivos WHERE solicitacao_id = ?
              UNION ALL
              SELECT nome, tipo, tamanho, categoria, base64 FROM solicitacao_etapa_arquivos WHERE solicitacao_id = ?`,
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

    if (action === 'nova_solicitacao_notifs') {
      const notifs = await db.execute('SELECT * FROM nova_solicitacao_notificacoes ORDER BY slack_user_name');
      return { status: 200, body: { notificacoes: notifs.rows } };
    }

    if (action === 'detail') {
      const id = query.get('id');
      if (!id) return { status: 400, body: { error: 'Missing id' } };

      const sub = await db.execute({ sql: 'SELECT * FROM solicitacoes WHERE id = ?', args: [id] });
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
              FROM solicitacao_eventos e
              LEFT JOIN status_configs sc ON sc.id = e.status_id
              LEFT JOIN usuarios u ON u.id = e.autor_id
              WHERE e.solicitacao_id = ? ORDER BY e.criado_em ASC`,
        args: [id],
      });

      const etapaArquivos = await db.execute({
        sql: `SELECT sa.id, sa.status_id, sa.nome, sa.tipo, sa.tamanho, sa.categoria, sa.criado_em,
                     sc.nome AS status_nome
              FROM solicitacao_etapa_arquivos sa
              LEFT JOIN status_configs sc ON sc.id = sa.status_id
              WHERE sa.solicitacao_id = ? ORDER BY sa.criado_em DESC`,
        args: [id],
      });

      const formArquivos = await db.execute({
        sql: 'SELECT id, categoria, nome, tipo, tamanho FROM solicitacao_arquivos WHERE solicitacao_id = ?',
        args: [id],
      });

      const statuses = await db.execute(
        'SELECT id, nome, cor FROM status_configs WHERE ativo = 1 ORDER BY ordem'
      );

      const pendencias = await db.execute({
        sql: 'SELECT id, descricao, categoria, resolvida, status_id, criado_em, resolvido_em FROM solicitacao_pendencias WHERE solicitacao_id = ? ORDER BY resolvida ASC, criado_em ASC',
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

    if (action === 'list_aceite_operacoes') {
      const rows = await db.execute('SELECT * FROM aceite_operacoes ORDER BY criado_em DESC');
      return { status: 200, body: { operacoes: rows.rows } };
    }

    if (action === 'get_aceite_anexos') {
      const operacao_id = query.get('operacao_id');
      if (!operacao_id) return { status: 400, body: { error: 'operacao_id required' } };
      const rows = await db.execute({ sql: 'SELECT * FROM aceite_anexos WHERE operacao_id = ?', args: [operacao_id] });
      return { status: 200, body: { anexos: rows.rows } };
    }

    return { status: 400, body: { error: 'Unknown action' } };
  }

  // ── POST ─────────────────────────────────────────────
  if (method === 'POST') {
    const action = body?.action;

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

    // Persiste (upsert) o relatório DEPS de um alvo, ligado à solicitação - fica
    // acessível no balão do cedente/sacado no card.
    if (action === 'save_solicitacao_deps') {
      const { solicitacao_id, alvo, nome, documento, norm, raw } = body;
      if (!solicitacao_id || (alvo !== 'ced' && alvo !== 'sac') || !norm) {
        return { status: 400, body: { error: 'Dados inválidos.' } };
      }
      await db.execute({ sql: 'DELETE FROM solicitacao_deps WHERE solicitacao_id = ? AND alvo = ?', args: [solicitacao_id, alvo] });
      await db.execute({
        sql: `INSERT INTO solicitacao_deps (solicitacao_id, alvo, nome, documento, norm_json, raw_json, criado_em) VALUES (?,?,?,?,?,?,?)`,
        args: [solicitacao_id, alvo, nome ?? null, documento ?? null, JSON.stringify(norm),
               raw ? JSON.stringify(raw) : null, new Date().toISOString()],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'move') {
      const { solicitacao_id, status_id } = body;
      const now = new Date().toISOString();
      const sc = await db.execute({ sql: 'SELECT nome FROM status_configs WHERE id = ?', args: [status_id] });
      const nome = String(sc.rows[0]?.nome ?? '');

      await db.execute({
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'status_change', ?, ?, ?, ?, ?)`,
        args: [solicitacao_id, status_id, `Movido para ${nome}`, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'solicitacoes', solicitacao_id, autorId, autorNome, now);

      // Slack notifications
      if (slackToken) {
        const notifs = await db.execute({
          sql: 'SELECT slack_user_id FROM status_notificacoes WHERE status_id = ?',
          args: [status_id],
        });
        if (notifs.rows.length > 0) {
          const s = (await db.execute({ sql: 'SELECT nome_contratado, cnpj_contratado, valor FROM solicitacoes WHERE id = ?', args: [solicitacao_id] })).rows[0];
          const msg = `📋 Solicitação movida para *${nome}*\n*Contratado:* ${s?.nome_contratado ?? '-'} (${s?.cnpj_contratado ?? '-'})\n*Valor:* ${s?.valor ?? '-'}`;
          for (const n of notifs.rows) {
            notifySlack(slackToken, String(n.slack_user_id), msg);
          }
        }
      }
      return { status: 200, body: { ok: true } };
    }

    if (action === 'comment') {
      const now = new Date().toISOString();
      const result = await db.execute({
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, descricao, parent_id, criado_em, autor_id, autor_nome)
              VALUES (?, 'comentario', ?, ?, ?, ?, ?)`,
        args: [body.solicitacao_id, body.texto, body.parent_id ?? null, now, autorId, autorNome],
      });
      if (slackToken && body.texto) {
        notifyMentions(slackToken, body.texto, body.solicitacao_id, db).catch(e => console.error('[mention-notify]', e));
        notifyStageMentions(slackToken, body.texto, body.solicitacao_id, db).catch(e => console.error('[stage-notify]', e));
      }
      return {
        status: 200,
        body: { ok: true, id: Number(result.lastInsertRowid), criado_em: now, autor_id: autorId, autor_nome: autorNome },
      };
    }

    if (action === 'delete_comment') {
      // Delete replies first, then the comment itself
      await db.execute({ sql: `DELETE FROM solicitacao_eventos WHERE parent_id = ? AND tipo = 'comentario'`, args: [body.id] });
      await db.execute({ sql: `DELETE FROM solicitacao_eventos WHERE id = ? AND tipo = 'comentario'`, args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'upload_file') {
      const { solicitacao_id, status_id, arquivo } = body;
      const now = new Date().toISOString();
      await db.execute({
        sql: `INSERT INTO solicitacao_etapa_arquivos (solicitacao_id, status_id, nome, tipo, tamanho, base64, categoria, criado_em)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [solicitacao_id, status_id, arquivo.nome, arquivo.tipo, arquivo.tamanho, arquivo.base64, arquivo.categoria ?? null, now],
      });
      await db.execute({
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'arquivo', ?, ?, ?, ?, ?)`,
        args: [solicitacao_id, status_id, `Arquivo: ${arquivo.nome}`, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'solicitacoes', solicitacao_id, autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_stage_file') {
      await db.execute({ sql: 'DELETE FROM solicitacao_etapa_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'get_file_base64') {
      const f = await db.execute({ sql: 'SELECT base64, nome FROM solicitacao_etapa_arquivos WHERE id = ?', args: [body.id] });
      if (!f.rows[0]) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: f.rows[0] };
    }

    if (action === 'get_form_file_base64') {
      const f = await db.execute({ sql: 'SELECT base64, nome FROM solicitacao_arquivos WHERE id = ?', args: [body.id] });
      if (!f.rows[0]) return { status: 404, body: { error: 'Not found' } };
      return { status: 200, body: f.rows[0] };
    }

    if (action === 'rename_form_file') {
      await db.execute({ sql: 'UPDATE solicitacao_arquivos SET nome = ? WHERE id = ?', args: [body.nome, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'rename_file') {
      await db.execute({ sql: 'UPDATE solicitacao_etapa_arquivos SET nome = ? WHERE id = ?', args: [body.nome, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_file') {
      await db.execute({ sql: 'DELETE FROM solicitacao_etapa_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_form_file') {
      await db.execute({ sql: 'DELETE FROM solicitacao_arquivos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'update_arquivo_categoria') {
      const table = body.is_stage ? 'solicitacao_etapa_arquivos' : 'solicitacao_arquivos';
      await db.execute({ sql: `UPDATE ${table} SET categoria = ? WHERE id = ?`, args: [body.categoria ?? null, body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Pendências (checklist)
    if (action === 'add_pendencias') {
      const { solicitacao_id, status_id, itens } = body;
      const now = new Date().toISOString();
      const lista = (Array.isArray(itens) ? itens : [])
        .map((it: any) => ({ descricao: String(it?.descricao ?? '').trim(), categoria: it?.categoria ?? null }))
        .filter((it: any) => it.descricao);
      for (const it of lista) {
        await db.execute({
          sql: `INSERT INTO solicitacao_pendencias (solicitacao_id, descricao, categoria, resolvida, status_id, criado_em, criado_por_id, criado_por_nome)
                VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
          args: [solicitacao_id, it.descricao, it.categoria, status_id ?? null, now, autorId, autorNome],
        });
      }
      // Resumo na timeline (histórico)
      if (lista.length > 0) {
        const resumo = lista.map((it: any) => `• ${it.categoria ? `[${it.categoria}] ` : ''}${it.descricao}`).join('\n');
        await db.execute({
          sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
                VALUES (?, 'comentario', ?, ?, ?, ?, ?)`,
          args: [solicitacao_id, status_id ?? null, `Pendências registradas:\n${resumo}`, now, autorId, autorNome],
        });
      }
      return { status: 200, body: { ok: true, count: lista.length } };
    }

    if (action === 'toggle_pendencia') {
      const resolvida = body.resolvida ? 1 : 0;
      await db.execute({
        sql: `UPDATE solicitacao_pendencias SET resolvida = ?, resolvido_em = ?, resolvido_por_id = ?, resolvido_por_nome = ? WHERE id = ?`,
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
        sql: `UPDATE solicitacao_pendencias SET descricao = COALESCE(?, descricao), categoria = ? WHERE id = ?`,
        args: [body.descricao != null ? String(body.descricao).trim() : null, body.categoria ?? null, body.id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_pendencia') {
      await db.execute({ sql: 'DELETE FROM solicitacao_pendencias WHERE id = ?', args: [body.id] });
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
      // Find all solicitações currently in this status
      const cards = await db.execute({
        sql: `SELECT s.id FROM solicitacoes s
              INNER JOIN (
                SELECT e.solicitacao_id FROM solicitacao_eventos e
                WHERE e.tipo = 'status_change' AND e.status_id = ?
                  AND e.id = (
                    SELECT MAX(e2.id) FROM solicitacao_eventos e2
                    WHERE e2.solicitacao_id = e.solicitacao_id AND e2.tipo = 'status_change'
                  )
              ) curr ON curr.solicitacao_id = s.id
              WHERE s.deleted_at IS NULL`,
        args: [id],
      });
      for (const row of cards.rows) {
        await db.execute({
          sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
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
      let aprovacaoStatus = c.aprovacao_status ?? null;
      if (!aprovacaoStatus) {
        if (c.origem === 'Auto-cadastro') {
          const entryRow = await db.execute(`SELECT chave FROM cadastro_status_configs WHERE ativo = 1 ORDER BY ordem LIMIT 1`);
          aprovacaoStatus = String(entryRow.rows[0]?.chave ?? 'pendente');
        } else {
          aprovacaoStatus = 'aprovado';
        }
      }
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
    if (action === 'move_cadastro') {
      const etapa = await db.execute({
        sql: 'SELECT nome FROM cadastro_status_configs WHERE chave = ? AND ativo = 1 LIMIT 1',
        args: [body.aprovacao_status],
      });
      if (etapa.rows.length === 0) {
        return { status: 400, body: { error: 'aprovacao_status inválido' } };
      }
      const movidoEm = new Date().toISOString();
      await db.execute({
        sql: `UPDATE cedentes SET aprovacao_status = ?, cadastro_movido_em = ?,
                atualizado_por_id = ?, atualizado_por_nome = ?, atualizado_em = ?
              WHERE id = ?`,
        args: [body.aprovacao_status, movidoEm, autorId, autorNome, movidoEm, body.id],
      });

      // Notifica os inscritos da etapa de destino no Slack
      if (slackToken) {
        const notifs = await db.execute({
          sql: 'SELECT slack_user_id FROM cadastro_etapa_notificacoes WHERE etapa = ?',
          args: [body.aprovacao_status],
        });
        if (notifs.rows.length > 0) {
          const c = (await db.execute({ sql: 'SELECT nome, cnpj_cpf FROM cedentes WHERE id = ?', args: [body.id] })).rows[0];
          const label = String(etapa.rows[0].nome);
          const msg = `📋 Cadastro de cedente movido para *${label}*\n*Empresa:* ${c?.nome ?? '-'} (${c?.cnpj_cpf ?? '-'})`;
          for (const n of notifs.rows) {
            notifySlack(slackToken, String(n.slack_user_id), msg);
          }
        }
      }
      return { status: 200, body: { ok: true } };
    }

    // ── Etapas do onboarding: CRUD / reorder ───────────────────────────────────
    if (action === 'create_cadastro_status') {
      const max = await db.execute('SELECT MAX(ordem) as m FROM cadastro_status_configs WHERE ativo = 1');
      const ordem = Number(max.rows[0]?.m ?? 0) + 1;
      const chave = `et_${randomUUID().slice(0, 8)}`;
      const r = await db.execute({
        sql: 'INSERT INTO cadastro_status_configs (chave, nome, cor, ordem, ativo) VALUES (?,?,?,?,1)',
        args: [chave, body.nome, body.cor, ordem],
      });
      return {
        status: 200,
        body: { etapa: { id: Number(r.lastInsertRowid), chave, nome: body.nome, cor: body.cor, ordem, ativo: 1, locked: 0, notificacoes: [] } },
      };
    }

    if (action === 'update_cadastro_status') {
      await db.execute({ sql: 'UPDATE cadastro_status_configs SET nome = ?, cor = ? WHERE id = ?', args: [body.nome, body.cor, body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_cadastro_status') {
      const cur = await db.execute({ sql: 'SELECT chave FROM cadastro_status_configs WHERE id = ?', args: [body.id] });
      const chave = String(cur.rows[0]?.chave ?? '');
      if (CADASTRO_LOCKED_CHAVES.includes(chave)) {
        return { status: 400, body: { error: 'Etapa protegida não pode ser excluída' } };
      }
      // Reassocia cadastros desta etapa antes de excluir
      if (body.move_to_chave) {
        await db.execute({
          sql: `UPDATE cedentes SET aprovacao_status = ? WHERE aprovacao_status = ? AND origem = 'Auto-cadastro'`,
          args: [body.move_to_chave, chave],
        });
      }
      await db.execute({ sql: 'UPDATE cadastro_status_configs SET ativo = 0 WHERE id = ?', args: [body.id] });
      await db.execute({ sql: 'DELETE FROM cadastro_etapa_notificacoes WHERE etapa = ?', args: [chave] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'reorder_cadastro_status') {
      for (let i = 0; i < (body.ids as number[]).length; i++) {
        await db.execute({ sql: 'UPDATE cadastro_status_configs SET ordem = ? WHERE id = ?', args: [i + 1, body.ids[i]] });
      }
      return { status: 200, body: { ok: true } };
    }

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

    // Etapa de entrada: a que recebe as solicitações do formulário público.
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

    // Bot token is managed via environment variables - these are no-ops in the UI
    if (action === 'save_slack_token' || action === 'remove_slack_token') {
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

    if (action === 'salvar_diretriz') {
      await ensureDiretrizesSchema(db);
      const categoria = String(body?.categoria ?? '').trim();
      const escopo = String(body?.escopo ?? 'global').trim() || 'global';
      const instrucao = String(body?.instrucao ?? '').trim();
      const exemplo = body?.exemplo ? String(body.exemplo).trim() : null;
      const origem = body?.origem ? String(body.origem).trim() : null;
      const substituiIds: number[] = Array.isArray(body?.substitui_ids)
        ? body.substitui_ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n)) : [];
      if (!['extracao', 'interpretacao', 'decisao'].includes(categoria)) {
        return { status: 400, body: { error: 'Categoria inválida.' } };
      }
      if (!instrucao) return { status: 400, body: { error: 'A regra não pode ser vazia.' } };

      const now = new Date().toISOString();
      // Regras substituídas saem de circulação (mas ficam no banco - auditoria)
      for (const sid of substituiIds) {
        await db.execute({
          sql: `UPDATE credito_diretrizes SET status = 'substituida', atualizado_em = ? WHERE id = ? AND status = 'ativa'`,
          args: [now, sid],
        });
      }
      const ins = await db.execute({
        sql: `INSERT INTO credito_diretrizes
              (categoria, escopo, instrucao, exemplo, status, substitui_id, prioridade, origem, criado_por_nome, criado_por_id, criado_em, atualizado_em)
              VALUES (?, ?, ?, ?, 'ativa', ?, 0, ?, ?, ?, ?, ?)`,
        args: [categoria, escopo, instrucao, exemplo, substituiIds[0] ?? null, origem, autorNome, autorId, now, now],
      });
      return { status: 200, body: { ok: true, id: Number(ins.lastInsertRowid ?? 0), substituidas: substituiIds } };
    }

    // Grava a análise validada no histórico. Chamado pelo "Validar e salvar" da
    // etapa Parecer; criado_por_nome é o analista que validou.
    if (action === 'salvar_analise') {
      await ensureAnalisesSchema(db);
      const s = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());
      const status = String(body?.status ?? '').trim();
      if (!status) return { status: 400, body: { error: 'Análise sem status de decisão.' } };
      if (!body?.snapshot || typeof body.snapshot !== 'object') {
        return { status: 400, body: { error: 'Snapshot da análise ausente.' } };
      }
      const now = new Date().toISOString();
      const protocolo = s(body?.protocolo) ?? `AC-${now.slice(0, 10).replace(/-/g, '')}-${now.slice(11, 16).replace(':', '')}`;

      const ins = await db.execute({
        sql: `INSERT INTO credito_analises
              (protocolo, solicitacao_id, cedente_nome, cedente_cnpj, sacado_nome, sacado_cnpj,
               valor, status, risco, taxa, limite, tipo_operacao,
               ia_recomendacao, ia_confianca, ia_modelo, parecer_ia, snapshot, criado_por_nome, criado_por_id, criado_em)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          protocolo, s(body?.solicitacao_id),
          s(body?.cedente_nome), s(body?.cedente_cnpj), s(body?.sacado_nome), s(body?.sacado_cnpj),
          s(body?.valor), status, s(body?.risco), s(body?.taxa), s(body?.limite), s(body?.tipo_operacao),
          s(body?.ia_recomendacao), s(body?.ia_confianca), s(body?.ia_modelo),
          body?.parecer_ia ? JSON.stringify(body.parecer_ia) : null,
          JSON.stringify(body.snapshot),
          autorNome, autorId, now,
        ],
      });
      return { status: 200, body: { ok: true, id: Number(ins.lastInsertRowid ?? 0), protocolo, criado_em: now } };
    }

    // Anexos da análise: sobem em PEDAÇOS depois que a análise já tem id.
    // Um pedaço por requisição (o body da função não aguenta o arquivo inteiro);
    // o finalize remonta, grava a linha e limpa os pedaços.
    if (action === 'analise_arquivo_chunk') {
      const analiseId = Number(body?.analise_id);
      const fileId = body?.file_id != null ? String(body.file_id) : '';
      const { seq, chunk } = body ?? {};
      if (!Number.isFinite(analiseId) || !fileId || typeof chunk !== 'string' || seq == null) {
        return { status: 400, body: { error: 'Pedaço de anexo inválido.' } };
      }
      await db.execute({
        sql: 'INSERT INTO credito_analise_arquivo_chunks (analise_id, file_id, seq, chunk, criado_em) VALUES (?,?,?,?,?)',
        args: [analiseId, fileId, Number(seq), chunk, new Date().toISOString()],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'analise_arquivo_finalize') {
      const analiseId = Number(body?.analise_id);
      const fileId = body?.file_id != null ? String(body.file_id) : '';
      const arquivo = body?.arquivo ?? {};
      if (!Number.isFinite(analiseId) || !fileId || !arquivo?.nome) {
        return { status: 400, body: { error: 'Dados do anexo ausentes.' } };
      }
      const existe = await db.execute({ sql: 'SELECT id FROM credito_analises WHERE id = ? LIMIT 1', args: [analiseId] });
      if (!existe.rows[0]) return { status: 404, body: { error: 'Análise não encontrada.' } };

      const pedacos = await db.execute({
        sql: 'SELECT chunk FROM credito_analise_arquivo_chunks WHERE analise_id = ? AND file_id = ? ORDER BY seq ASC',
        args: [analiseId, fileId],
      });
      const base64 = pedacos.rows.map(r => String(r.chunk)).join('');
      // Consome os pedaços mesmo se o conteúdo vier vazio, para não deixar órfãos.
      await db.execute({
        sql: 'DELETE FROM credito_analise_arquivo_chunks WHERE analise_id = ? AND file_id = ?',
        args: [analiseId, fileId],
      }).catch(() => {});
      await db.execute({
        sql: 'DELETE FROM credito_analise_arquivo_chunks WHERE criado_em < ?',
        args: [new Date(Date.now() - 3600_000).toISOString()],
      }).catch(() => {});
      if (!base64) return { status: 400, body: { error: 'Nenhum conteúdo recebido para o anexo.' } };

      const t = (v: any) => (v == null || String(v).trim() === '' ? null : String(v).trim());
      const ins = await db.execute({
        sql: `INSERT INTO credito_analise_arquivos
              (analise_id, nome, tipo, mime, tamanho, categoria, origem, base64, criado_em)
              VALUES (?,?,?,?,?,?,?,?,?)`,
        args: [
          analiseId, String(arquivo.nome), t(arquivo.tipo), t(arquivo.mime),
          Number(arquivo.tamanho ?? 0) || 0, t(arquivo.categoria), t(arquivo.origem),
          base64, new Date().toISOString(),
        ],
      });
      return { status: 200, body: { ok: true, id: Number(ins.lastInsertRowid ?? 0) } };
    }

    // Importação em lote de diretrizes (ex.: metodologia que o analista mantinha
    // num markdown próprio). Já vem revisada pelo operador na tela; aqui só
    // validamos e gravamos, pulando o que já existe ativo com o mesmo texto.
    if (action === 'importar_diretrizes') {
      await ensureDiretrizesSchema(db);
      const entrada = Array.isArray(body?.diretrizes) ? body.diretrizes : [];
      if (!entrada.length) return { status: 400, body: { error: 'Nenhuma diretriz para importar.' } };
      if (entrada.length > 200) return { status: 400, body: { error: 'Importe no máximo 200 diretrizes por vez.' } };
      const origem = body?.origem ? String(body.origem).trim() : 'importação de markdown';

      // Texto das ativas para deduplicar (normalizado: caixa e espaços)
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
      const existentes = new Set(
        (await db.execute(`SELECT instrucao FROM credito_diretrizes WHERE status = 'ativa'`))
          .rows.map(r => norm(String(r.instrucao ?? ''))),
      );

      const now = new Date().toISOString();
      const criadas: number[] = [];
      const ignoradas: string[] = [];
      for (const d of entrada) {
        const categoria = String(d?.categoria ?? '').trim();
        const instrucao = String(d?.instrucao ?? '').trim();
        if (!['extracao', 'interpretacao', 'decisao'].includes(categoria) || !instrucao) {
          ignoradas.push(instrucao || '(vazia)');
          continue;
        }
        if (existentes.has(norm(instrucao))) { ignoradas.push(instrucao); continue; }
        const escopo = String(d?.escopo ?? 'global').trim() || 'global';
        const exemplo = d?.exemplo ? String(d.exemplo).trim() : null;
        const prioridade = Number.isFinite(Number(d?.prioridade)) ? Number(d.prioridade) : 0;
        const ins = await db.execute({
          sql: `INSERT INTO credito_diretrizes
                (categoria, escopo, instrucao, exemplo, status, substitui_id, prioridade, origem, criado_por_nome, criado_por_id, criado_em, atualizado_em)
                VALUES (?, ?, ?, ?, 'ativa', NULL, ?, ?, ?, ?, ?, ?)`,
          args: [categoria, escopo, instrucao, exemplo, prioridade, origem, autorNome, autorId, now, now],
        });
        criadas.push(Number(ins.lastInsertRowid ?? 0));
        existentes.add(norm(instrucao));
      }
      return { status: 200, body: { ok: true, criadas: criadas.length, ignoradas: ignoradas.length, ids: criadas } };
    }

    if (action === 'revogar_diretriz') {
      const id = Number(body?.id);
      if (!Number.isFinite(id)) return { status: 400, body: { error: 'ID inválido.' } };
      const now = new Date().toISOString();
      await db.execute({
        sql: `UPDATE credito_diretrizes SET status = 'revogada', atualizado_em = ? WHERE id = ?`,
        args: [now, id],
      });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'send_aceite_email') {
      const { to, cc, link, cedente_nome, sacado_nome } = body as {
        to: string[]; cc?: string[]; link: string; cedente_nome: string; sacado_nome: string;
      };
      const apiKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'noreply@wearedux.com';
      if (!apiKey) return { status: 500, body: { error: 'RESEND_API_KEY não configurado' } };
      if (!to?.length || !link) return { status: 400, body: { error: 'Parâmetros inválidos' } };

      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#121316;background:#fff;padding:40px 0;margin:0">
<div style="max-width:520px;margin:0 auto;padding:0 24px">
  <div style="background:#FFB400;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:24px">
    <span style="color:#fff;font-weight:900;font-size:18px">D</span>
  </div>
  <h1 style="font-size:22px;font-weight:800;margin:0 0 8px">Aceite do Sacado</h1>
  <p style="font-size:15px;color:#555;margin:0 0 24px">
    Você recebeu uma solicitação de aceite referente à operação de <strong>${cedente_nome}</strong> com o sacado <strong>${sacado_nome}</strong>.
  </p>
  <a href="${link}" style="display:inline-block;background:#121316;color:#fff;font-weight:700;font-size:14px;padding:13px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px">
    Revisar e assinar →
  </a>
  <p style="font-size:12px;color:#999;margin:0">Se não esperava este e-mail, pode ignorá-lo.</p>
</div>
</body></html>`;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromEmail, to, ...(cc?.length && { cc }), subject: `Aceite do Sacado - ${cedente_nome}`, html }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { status: 502, body: { error: 'Erro ao enviar e-mail', detail: err } };
      }
      return { status: 200, body: { ok: true } };
    }

    // Nova solicitação notifications
    if (action === 'add_nova_solicitacao_notif') {
      const r = await db.execute({
        sql: `INSERT OR IGNORE INTO nova_solicitacao_notificacoes (slack_user_id, slack_user_name, slack_user_avatar)
              VALUES (?, ?, ?)`,
        args: [body.slack_user_id, body.slack_user_name, body.slack_user_avatar ?? null],
      });
      const notif = {
        id: Number(r.lastInsertRowid),
        slack_user_id: body.slack_user_id,
        slack_user_name: body.slack_user_name,
        slack_user_avatar: body.slack_user_avatar ?? null,
      };
      return { status: 200, body: { notificacao: notif } };
    }

    if (action === 'remove_nova_solicitacao_notif') {
      await db.execute({ sql: 'DELETE FROM nova_solicitacao_notificacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Notificações do pipeline de cadastro - por etapa
    if (action === 'add_cadastro_etapa_notif') {
      const r = await db.execute({
        sql: `INSERT OR IGNORE INTO cadastro_etapa_notificacoes (etapa, slack_user_id, slack_user_name, slack_user_avatar)
              VALUES (?, ?, ?, ?)`,
        args: [body.etapa, body.slack_user_id, body.slack_user_name, body.slack_user_avatar ?? null],
      });
      return {
        status: 200,
        body: { notificacao: {
          id: Number(r.lastInsertRowid), etapa: body.etapa,
          slack_user_id: body.slack_user_id, slack_user_name: body.slack_user_name,
          slack_user_avatar: body.slack_user_avatar ?? null,
        } },
      };
    }

    if (action === 'remove_cadastro_etapa_notif') {
      await db.execute({ sql: 'DELETE FROM cadastro_etapa_notificacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Notificações do pipeline de cadastro - na submissão do formulário
    if (action === 'add_cadastro_submissao_notif') {
      const r = await db.execute({
        sql: `INSERT OR IGNORE INTO cadastro_submissao_notificacoes (slack_user_id, slack_user_name, slack_user_avatar)
              VALUES (?, ?, ?)`,
        args: [body.slack_user_id, body.slack_user_name, body.slack_user_avatar ?? null],
      });
      return {
        status: 200,
        body: { notificacao: {
          id: Number(r.lastInsertRowid),
          slack_user_id: body.slack_user_id, slack_user_name: body.slack_user_name,
          slack_user_avatar: body.slack_user_avatar ?? null,
        } },
      };
    }

    if (action === 'remove_cadastro_submissao_notif') {
      await db.execute({ sql: 'DELETE FROM cadastro_submissao_notificacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    // Slack notifications
    if (action === 'add_notificacao') {
      const r = await db.execute({
        sql: `INSERT OR IGNORE INTO status_notificacoes (status_id, slack_user_id, slack_user_name, slack_user_avatar)
              VALUES (?, ?, ?, ?)`,
        args: [body.status_id, body.slack_user_id, body.slack_user_name, body.slack_user_avatar ?? null],
      });
      const notif = {
        id: Number(r.lastInsertRowid),
        status_id: body.status_id,
        slack_user_id: body.slack_user_id,
        slack_user_name: body.slack_user_name,
        slack_user_avatar: body.slack_user_avatar ?? null,
      };
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
        sql: `UPDATE solicitacoes SET ${field} = ? WHERE id = ?`,
        args: [body.value ?? null, body.id],
      });
      await marcarEdicao(db, 'solicitacoes', String(body.id), autorId, autorNome, new Date().toISOString());
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
        sql: `INSERT INTO solicitacoes
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
          sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, status_id, descricao, criado_em, autor_id, autor_nome)
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
        sql: `UPDATE solicitacoes SET
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
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'edicao', 'Dados editados', ?, ?, ?)`,
        args: [subId, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'solicitacoes', subId, autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_submission') {
      const now = new Date().toISOString();
      await db.execute({
        sql: 'UPDATE solicitacoes SET deleted_at = ? WHERE id = ?',
        args: [now, body.id],
      });
      await db.execute({
        sql: `INSERT INTO solicitacao_eventos (solicitacao_id, tipo, descricao, criado_em, autor_id, autor_nome)
              VALUES (?, 'edicao', 'Solicitação excluída', ?, ?, ?)`,
        args: [body.id, now, autorId, autorNome],
      });
      await marcarEdicao(db, 'solicitacoes', String(body.id), autorId, autorNome, now);
      return { status: 200, body: { ok: true } };
    }

    // ── Aceite operacoes CRUD ────────────────────────────────────────────────────

    if (action === 'create_aceite_operacao') {
      const id = randomUUID();
      const token = randomBytes(24).toString('hex');
      const now = new Date().toISOString();
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const parcelas = body.parcelas != null
        ? (typeof body.parcelas === 'string' ? body.parcelas : JSON.stringify(body.parcelas))
        : null;
      await db.execute({
        sql: `INSERT INTO aceite_operacoes (
          id, token, solicitacao_id, tipo, status,
          nome_cedente, cnpj_cedente, email_cedente, email_cedente_responsavel,
          nome_sacado, cnpj_sacado, numero_nf, data_emissao_nf, valor_nf,
          vencimento, periodo_servico, parcelas,
          banco_nome, titular_conta, cnpj_titular, agencia, conta,
          token_expires_at, criado_em, criado_por_id, criado_por_nome
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        args: [
          id, token, body.solicitacao_id, body.tipo ?? 'ACEITE_SACADO', 'PENDENTE',
          body.nome_cedente, body.cnpj_cedente, body.email_cedente ?? null, body.email_cedente_responsavel ?? null,
          body.nome_sacado, body.cnpj_sacado ?? null, body.numero_nf ?? null, body.data_emissao_nf ?? null, body.valor_nf ?? null,
          body.vencimento ?? null, body.periodo_servico ?? null, parcelas,
          body.banco_nome ?? null, body.titular_conta ?? null, body.cnpj_titular ?? null, body.agencia ?? null, body.conta ?? null,
          tokenExpiresAt, now, autorId, autorNome,
        ],
      });
      const rowRes = await db.execute({ sql: 'SELECT * FROM aceite_operacoes WHERE id = ?', args: [id] });
      return { status: 200, body: { operacao: rowRes.rows[0] } };
    }

    if (action === 'update_aceite_status') {
      await db.execute({ sql: 'UPDATE aceite_operacoes SET status = ? WHERE id = ?', args: [body.status, body.id] });
      await marcarEdicao(db, 'aceite_operacoes', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    if (action === 'reenviar_aceite') {
      const token = randomBytes(24).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      await db.execute({
        sql: "UPDATE aceite_operacoes SET token=?, token_expires_at=?, status='PENDENTE', aceitante=NULL WHERE id=?",
        args: [token, tokenExpiresAt, body.id],
      });
      await marcarEdicao(db, 'aceite_operacoes', String(body.id), autorId, autorNome, new Date().toISOString());
      const rowRes = await db.execute({ sql: 'SELECT * FROM aceite_operacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { operacao: rowRes.rows[0] } };
    }

    if (action === 'add_aceite_email_history') {
      const rowRes = await db.execute({ sql: 'SELECT email_history FROM aceite_operacoes WHERE id = ?', args: [body.id] });
      const existing = rowRes.rows[0]?.email_history ? JSON.parse(String(rowRes.rows[0].email_history)) : [];
      const merged = [...existing, ...(body.entries ?? [])];
      await db.execute({ sql: 'UPDATE aceite_operacoes SET email_history = ? WHERE id = ?', args: [JSON.stringify(merged), body.id] });
      await marcarEdicao(db, 'aceite_operacoes', String(body.id), autorId, autorNome, new Date().toISOString());
      return { status: 200, body: { ok: true } };
    }

    if (action === 'delete_aceite_operacao') {
      await db.execute({ sql: 'DELETE FROM aceite_anexos WHERE operacao_id = ?', args: [body.id] });
      await db.execute({ sql: 'DELETE FROM aceite_operacoes WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }

    if (action === 'add_aceite_anexo') {
      const id = randomUUID();
      const now = new Date().toISOString();
      await db.execute({
        sql: 'INSERT INTO aceite_anexos (id, operacao_id, nome, tipo, tamanho, data_url, criado_em) VALUES (?,?,?,?,?,?,?)',
        args: [id, body.operacao_id, body.nome, body.tipo, body.tamanho, body.data_url, now],
      });
      const rowRes = await db.execute({ sql: 'SELECT * FROM aceite_anexos WHERE id = ?', args: [id] });
      return { status: 200, body: { anexo: rowRes.rows[0] } };
    }

    if (action === 'delete_aceite_anexo') {
      await db.execute({ sql: 'DELETE FROM aceite_anexos WHERE id = ?', args: [body.id] });
      return { status: 200, body: { ok: true } };
    }
  }

  return { status: 405, body: { error: 'Method not allowed' } };
}
