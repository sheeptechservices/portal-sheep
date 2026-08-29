import type { Client } from '@libsql/client';
import { obterDdl, type DDL } from './_schema.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Histórico de análises de crédito.
//
//  Antes deste módulo o módulo de crédito era 100% efêmero: o "Validar e salvar" só
//  marcava a análise como validada no state do React e tudo era perdido ao
//  recarregar. Aqui cada análise validada vira uma linha consultável.
//
//  Guardamos os campos "de prateleira" em colunas (para filtrar/ordenar/exportar
//  sem abrir o JSON) e o restante num snapshot serializado, que é o que permite
//  reimprimir o parecer exatamente como foi emitido. O motor de decisão
//  (computeDecisao) é puro sobre o formulário, então o snapshot do form basta
//  para reconstruir taxa/limite/risco na leitura.
//
//  Os documentos analisados são anexados à análise (credito_analise_arquivos):
//  o parecer é reimprimível, mas sem os anexos não há como reauditar em cima de
//  QUE documentos ele foi emitido - e a origem deles (upload manual, solicitação,
//  cadastro do cedente) desaparece assim que a aba é fechada. O conteúdo vai em
//  base64, como em solicitacao_arquivos / cedente_arquivos, e sobe em pedaços
//  (o body da função Vercel não aguenta o arquivo inteiro).
//
//  Tabelas: credito_analises + credito_analise_arquivos
//  (criadas em ensureAdminSchema / ensureAnalisesSchema)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnaliseRow {
  id: number;
  protocolo: string;
  solicitacao_id: string | null;
  cedente_nome: string | null;
  cedente_cnpj: string | null;
  sacado_nome: string | null;
  sacado_cnpj: string | null;
  valor: string | null;
  status: string;                 // decisão do operador: aprovado | condicionantes | reprovado
  risco: string | null;           // dec.risk do motor (baixo | medio | elevado)
  taxa: string | null;
  limite: string | null;
  tipo_operacao: string | null;
  ia_recomendacao: string | null; // o que a IA sugeriu (comparável com `status`)
  ia_confianca: string | null;
  ia_modelo: string | null;
  criado_por_nome: string | null; // nome do analista que validou a análise
  criado_por_id: string | null;   // referência ao usuário em `usuarios`
  criado_em: string;
}

export interface AnaliseArquivoRow {
  id: number;
  analise_id: number;
  nome: string;
  tipo: string | null;       // classificação documental dada pela IA na leitura
  mime: string | null;
  tamanho: number;
  categoria: string | null;  // categoria estruturada herdada do cadastro/solicitação
  origem: string | null;     // manual | solicitacao | cedente
  criado_em: string;
}

export async function ensureAnalisesSchema(db: Client, ddl?: DDL): Promise<void> {
  // Sem executor, usa o inventário compartilhado: chamada solta de dentro de
  // um handler não repete o DDL que a migração já cobriu.
  const exec = ddl ?? await obterDdl(db);
  await exec(`
    CREATE TABLE IF NOT EXISTS credito_analises (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      protocolo       TEXT NOT NULL,
      solicitacao_id  TEXT,
      cedente_nome    TEXT,
      cedente_cnpj    TEXT,
      sacado_nome     TEXT,
      sacado_cnpj     TEXT,
      valor           TEXT,
      status          TEXT NOT NULL,
      risco           TEXT,
      taxa            TEXT,
      limite          TEXT,
      tipo_operacao   TEXT,
      ia_recomendacao TEXT,
      ia_confianca    TEXT,
      ia_modelo       TEXT,
      parecer_ia      TEXT,
      snapshot        TEXT NOT NULL,
      criado_por_nome TEXT,
      criado_em       TEXT NOT NULL
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS idx_credito_analises_criado ON credito_analises (criado_em DESC)`);
  // Renomeação de `criado_por` para `criado_por_nome`, para casar com o padrão
  // `_id` + `_nome` das outras tabelas. Numa base nova o CREATE acima já nasce
  // com o nome certo e este ALTER falha sem coluna de origem - por isso o try.
  try { await exec(`ALTER TABLE credito_analises RENAME COLUMN criado_por TO criado_por_nome`); } catch {}
  try { await exec(`ALTER TABLE credito_analises ADD COLUMN criado_por_id TEXT`); } catch {}
  // Depois do ALTER, senão o índice não acha a coluna na primeira execução.
  // A tela de Perfil conta as análises da pessoa e o índice acima começa por
  // `criado_em`, então essa contagem varria a tabela.
  try { await exec(`CREATE INDEX IF NOT EXISTS idx_credito_analises_autor ON credito_analises (criado_por_id)`); } catch {}
  await ensureAnaliseArquivosSchema(db, exec);
}

// Anexos da análise: os documentos que a análise realmente leu, congelados junto
// do parecer. `origem` diz de onde o documento veio para a mesa (upload manual,
// anexo da solicitação, cadastro do cedente) e `tipo` é a classificação que a IA
// deu na leitura ("Nota Fiscal", "DEPs Smart"…), não o mime - esse fica em `mime`.
export async function ensureAnaliseArquivosSchema(db: Client, ddl?: DDL): Promise<void> {
  // Sem executor, usa o inventário compartilhado: chamada solta de dentro de
  // um handler não repete o DDL que a migração já cobriu.
  const exec = ddl ?? await obterDdl(db);
  await exec(`
    CREATE TABLE IF NOT EXISTS credito_analise_arquivos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      analise_id INTEGER NOT NULL,
      nome       TEXT NOT NULL,
      tipo       TEXT,
      mime       TEXT,
      tamanho    INTEGER NOT NULL DEFAULT 0,
      categoria  TEXT,
      origem     TEXT,
      base64     TEXT NOT NULL,
      criado_em  TEXT NOT NULL
    )
  `);
  await exec(`CREATE INDEX IF NOT EXISTS idx_credito_analise_arquivos_analise ON credito_analise_arquivos (analise_id)`);
  // Pedaços em trânsito: o arquivo sobe fatiado (uma requisição por pedaço) e só
  // vira linha em credito_analise_arquivos no finalize. Sessões abandonadas são
  // limpas por idade, de forma oportunista.
  await exec(`
    CREATE TABLE IF NOT EXISTS credito_analise_arquivo_chunks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      analise_id INTEGER NOT NULL,
      file_id    TEXT NOT NULL,
      seq        INTEGER NOT NULL,
      chunk      TEXT NOT NULL,
      criado_em  TEXT NOT NULL
    )
  `);
}

// Metadados do anexo - sem base64, que só o download carrega.
export const ANALISE_ARQUIVO_COLS =
  'id, analise_id, nome, tipo, mime, tamanho, categoria, origem, criado_em';

// Colunas da listagem - sem snapshot/parecer_ia, que só o detalhe carrega.
export const ANALISE_LIST_COLS =
  'id, protocolo, solicitacao_id, cedente_nome, cedente_cnpj, sacado_nome, sacado_cnpj, ' +
  'valor, status, risco, taxa, limite, tipo_operacao, ia_recomendacao, ia_confianca, ia_modelo, ' +
  'criado_por_nome, criado_por_id, criado_em';
