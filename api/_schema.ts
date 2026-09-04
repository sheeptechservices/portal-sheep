import type { Client } from '@libsql/client';

// ─────────────────────────────────────────────────────────────────────────────
//  Inventário do schema, lido uma vez por processo.
//
//  O `ensureAdminSchema` emitia ~115 CREATE/ALTER/INDEX em sequência, um por
//  ida ao banco. Contra um Turso remoto (~157 ms por ida daqui) isso é ~18 s
//  pagos pela primeira requisição de cada instância - e em dev, onde o Vite
//  invalida o módulo a cada arquivo salvo, isso acontecia o tempo todo.
//
//  O conserto não é lembrar de versionar o schema à mão (fácil de esquecer, e
//  o esquecimento é silencioso): é perguntar ao banco o que já existe. Uma
//  consulta ao `sqlite_master` com `pragma_table_info` devolve, de uma vez, toda
//  tabela, todo índice e toda coluna. Com isso na mão, DDL que não muda nada
//  simplesmente não é enviada.
//
//  Schema em dia passa a custar 1 ida em vez de ~115, e ninguém precisa manter
//  número de versão nenhum: adicionar um `ALTER TABLE ADD COLUMN` continua sendo
//  só escrever a linha.
// ─────────────────────────────────────────────────────────────────────────────

interface Inventario {
  tabelas: Set<string>;
  indices: Set<string>;
  /** tabela -> colunas. Ausente para tabela criada agora, que ainda não foi lida. */
  colunas: Map<string, Set<string>>;
  /** Tabelas criadas nesta execução: toda coluna delas é tentada, sem checar. */
  novas: Set<string>;
}

/** DDL que só vai ao banco quando muda alguma coisa. */
export type DDL = (sql: string) => Promise<void>;

const RE_CREATE_TABLE = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`[]?(\w+)/i;
const RE_CREATE_INDEX = /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`[]?(\w+)/i;
const RE_ADD_COLUNA = /^\s*ALTER\s+TABLE\s+["'`[]?(\w+)["'`\]]?\s+ADD\s+COLUMN\s+["'`[]?(\w+)/i;
const RE_DROP_COLUNA = /^\s*ALTER\s+TABLE\s+["'`[]?(\w+)["'`\]]?\s+DROP\s+(?:COLUMN\s+)?["'`[]?(\w+)/i;
const RE_RENAME_COLUNA = /^\s*ALTER\s+TABLE\s+["'`[]?(\w+)["'`\]]?\s+RENAME\s+COLUMN\s+["'`[]?(\w+)["'`\]]?\s+TO\s+["'`[]?(\w+)/i;
const RE_RENAME_TABELA = /^\s*ALTER\s+TABLE\s+["'`[]?(\w+)["'`\]]?\s+RENAME\s+TO\s+["'`[]?(\w+)/i;

async function lerInventario(db: Client): Promise<Inventario> {
  const inv: Inventario = { tabelas: new Set(), indices: new Set(), colunas: new Map(), novas: new Set() };
  // `LEFT JOIN pragma_table_info(m.name)`: a função tabular do SQLite expande as
  // colunas de cada tabela na mesma consulta. É o que permite a ida única.
  const res = await db.execute(`
    SELECT m.type AS tipo, m.name AS nome, p.name AS coluna
    FROM sqlite_master m
    LEFT JOIN pragma_table_info(m.name) p ON m.type = 'table'
    WHERE m.type IN ('table', 'index') AND m.name NOT LIKE 'sqlite_%'
  `);
  for (const linha of res.rows as unknown as Array<{ tipo: string; nome: string; coluna: string | null }>) {
    const nome = String(linha.nome);
    if (linha.tipo === 'index') { inv.indices.add(nome); continue; }
    inv.tabelas.add(nome);
    if (linha.coluna == null) continue;
    let cols = inv.colunas.get(nome);
    if (!cols) { cols = new Set(); inv.colunas.set(nome, cols); }
    cols.add(String(linha.coluna));
  }
  return inv;
}

function montarDdl(db: Client, inv: Inventario): DDL {
  return async (sql: string) => {
    const tabela = RE_CREATE_TABLE.exec(sql);
    if (tabela) {
      const nome = tabela[1];
      if (inv.tabelas.has(nome)) return;
      await db.execute(sql);
      inv.tabelas.add(nome);
      // Sem as colunas lidas: marcada como nova para que os ALTER seguintes
      // sejam tentados (o try/catch de quem chama absorve os duplicados).
      inv.novas.add(nome);
      return;
    }

    const indice = RE_CREATE_INDEX.exec(sql);
    if (indice) {
      if (inv.indices.has(indice[1])) return;
      await db.execute(sql);
      inv.indices.add(indice[1]);
      return;
    }

    const coluna = RE_ADD_COLUNA.exec(sql);
    if (coluna) {
      const [, tab, col] = coluna;
      if (!inv.novas.has(tab) && inv.colunas.get(tab)?.has(col)) return;
      await db.execute(sql);
      inv.colunas.get(tab)?.add(col);
      return;
    }

    const drop = RE_DROP_COLUNA.exec(sql);
    if (drop) {
      const [, tab, col] = drop;
      if (!inv.colunas.get(tab)?.has(col)) return;
      await db.execute(sql);
      inv.colunas.get(tab)?.delete(col);
      return;
    }

    // Antes do de coluna: `RENAME COLUMN` tambem casa "ALTER TABLE ... RENAME",
    // e a ordem e o que separa os dois.
    const renomearTabela = RE_RENAME_TABELA.exec(sql);
    if (renomearTabela) {
      const [, de, para] = renomearTabela;
      // Ja renomeada, ou base nova que ja nasceu com o nome certo. Nos dois
      // casos nao ha o que fazer - e tentar daria erro de tabela inexistente.
      if (!inv.tabelas.has(de) || inv.tabelas.has(para)) return;
      await db.execute(sql);
      inv.tabelas.delete(de);
      inv.tabelas.add(para);
      const cols = inv.colunas.get(de);
      if (cols) { inv.colunas.delete(de); inv.colunas.set(para, cols); }
      return;
    }

    const rename = RE_RENAME_COLUNA.exec(sql);
    if (rename) {
      const [, tab, de, para] = rename;
      const cols = inv.colunas.get(tab);
      // Já renomeada, ou origem inexistente (base nova, que já nasce certa).
      if (!cols || cols.has(para) || !cols.has(de)) return;
      await db.execute(sql);
      cols.delete(de);
      cols.add(para);
      return;
    }

    // Não reconhecida (migração de dado, seed, o que for): vai como está.
    await db.execute(sql);
  };
}

// O cache guarda o inventário, não o executor: o executor é montado com o
// cliente de quem chamou. Cada requisição cria o seu (são 18 pontos no projeto
// que fazem `createClient`), e prender o primeiro deles num closure de módulo
// seria uma armadilha - hoje inofensiva porque ninguém fecha cliente, mas o dia
// em que alguém fechar, a migração quebraria num ponto difícil de achar.
let _inventario: Promise<Inventario> | null = null;

/**
 * DDL condicional deste processo. O inventário é lido uma vez e mantido em dia
 * pelo próprio `ddl`, então toda função `ensure*` que passar por aqui - inclusive
 * as chamadas repetidas de dentro dos handlers - fica de graça depois da primeira.
 *
 * Falha limpa o cache: a próxima tentativa relê em vez de herdar um inventário
 * pela metade.
 */
export async function obterDdl(db: Client): Promise<DDL> {
  if (!_inventario) {
    _inventario = lerInventario(db).catch(err => { _inventario = null; throw err; });
  }
  return montarDdl(db, await _inventario);
}
