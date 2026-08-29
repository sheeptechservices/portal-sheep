import type { Client } from '@libsql/client';
import { obterDdl, type DDL } from './_schema.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Base de conhecimento do motor de crédito - "diretrizes da casa".
//
//  Regras que o operador salva a partir das correções do parecer. Ficam no Turso
//  (sobrevivem a deploy) e são injetadas no prompt da IA em runtime. Cada regra é
//  categorizada e tem escopo; nada é apagado fisicamente (auditoria) - o que sai
//  de circulação vira status 'substituida' ou 'revogada'.
//
//  Tabela: credito_diretrizes (criada em ensureAdminSchema / ensureDiretrizesSchema)
// ─────────────────────────────────────────────────────────────────────────────

export type DiretrizCategoria = 'extracao' | 'interpretacao' | 'decisao';

export interface Diretriz {
  id: number;
  categoria: DiretrizCategoria;
  escopo: string;          // 'global' | 'segmento:xxx' | 'produto:xxx'
  instrucao: string;
  exemplo: string | null;
  status: 'ativa' | 'substituida' | 'revogada';
  substitui_id: number | null;
  prioridade: number;
  origem: string | null;
  criado_por_nome: string | null; // nome de quem cadastrou, para exibição
  criado_por_id: string | null;  // referência ao usuário em `usuarios`
  criado_em: string;
  atualizado_em: string;
}

export async function ensureDiretrizesSchema(db: Client, ddl?: DDL): Promise<void> {
  // Sem executor, usa o inventário compartilhado: chamada solta de dentro de
  // um handler não repete o DDL que a migração já cobriu.
  const exec = ddl ?? await obterDdl(db);
  await exec(`
    CREATE TABLE IF NOT EXISTS credito_diretrizes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      categoria     TEXT NOT NULL,
      escopo        TEXT NOT NULL DEFAULT 'global',
      instrucao     TEXT NOT NULL,
      exemplo       TEXT,
      status        TEXT NOT NULL DEFAULT 'ativa',
      substitui_id  INTEGER,
      prioridade    INTEGER NOT NULL DEFAULT 0,
      origem        TEXT,
      criado_por_nome TEXT,
      criado_em     TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    )
  `);
  // Renomeação de `criado_por` para `criado_por_nome`, para casar com o padrão
  // `_id` + `_nome` das outras tabelas. Numa base nova o CREATE acima já nasce
  // com o nome certo e este ALTER falha sem coluna de origem - por isso o try.
  try { await exec(`ALTER TABLE credito_diretrizes RENAME COLUMN criado_por TO criado_por_nome`); } catch {}
  try { await exec(`ALTER TABLE credito_diretrizes ADD COLUMN criado_por_id TEXT`); } catch {}
}

function rowToDiretriz(r: any): Diretriz {
  return {
    id: Number(r.id),
    categoria: String(r.categoria) as DiretrizCategoria,
    escopo: String(r.escopo ?? 'global'),
    instrucao: String(r.instrucao ?? ''),
    exemplo: r.exemplo != null ? String(r.exemplo) : null,
    status: String(r.status ?? 'ativa') as Diretriz['status'],
    substitui_id: r.substitui_id != null ? Number(r.substitui_id) : null,
    prioridade: Number(r.prioridade ?? 0),
    origem: r.origem != null ? String(r.origem) : null,
    criado_por_nome: r.criado_por_nome != null ? String(r.criado_por_nome) : null,
    criado_por_id: r.criado_por_id != null ? String(r.criado_por_id) : null,
    criado_em: String(r.criado_em ?? ''),
    atualizado_em: String(r.atualizado_em ?? ''),
  };
}

// Diretrizes ATIVAS (as únicas injetadas no prompt). Filtra por categoria(s).
// Resiliente: se a tabela ainda não existe, devolve [].
export async function getDiretrizesAtivas(db: Client, categorias?: DiretrizCategoria[]): Promise<Diretriz[]> {
  try {
    const res = await db.execute(`SELECT * FROM credito_diretrizes WHERE status = 'ativa' ORDER BY categoria, escopo, prioridade DESC, id`);
    let rows = res.rows.map(rowToDiretriz);
    if (categorias && categorias.length) rows = rows.filter(d => categorias.includes(d.categoria));
    return rows;
  } catch {
    return [];
  }
}

// Monta o bloco de texto com as diretrizes para injetar no system prompt.
export function buildDiretrizesBloco(rows: Diretriz[]): string {
  if (!rows.length) return '';
  const linhas = rows.map(d => {
    const ex = d.exemplo ? ` (ex.: ${d.exemplo})` : '';
    return `- [${d.categoria} · ${d.escopo}] ${d.instrucao}${ex}`;
  });
  return [
    '=== DIRETRIZES DA CASA (regras definidas pela equipe DUX - siga rigorosamente) ===',
    'Estas regras foram cadastradas pelos operadores a partir de correções anteriores. Aplique-as.',
    'Quando duas regras se sobrepuserem, a de escopo mais específico (produto/segmento) prevalece sobre a global.',
    ...linhas,
  ].join('\n');
}
