// ─────────────────────────────────────────────────────────────────────────────
//  A semana de um objetivo é a data dele.
//
//  Todo objetivo nasce com a sexta da semana em que entra, e a data não fica
//  vazia. Pôr uma data de outra semana leva o objetivo para ela: sai desta
//  Planning e entra naquela, com as provas. O servidor faz a mudança
//  (`mover_objetivo_de_semana`); aqui ficam as contas de semana e o contexto
//  que leva a mudança da lista de objetivos até a página, que é quem grava.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext } from 'react';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A segunda-feira da semana de uma data AAAA-MM-DD. */
export function segundaDaData(data: string): string {
  const [a, m, d] = data.split('-').map(Number);
  const dia = new Date(a, m - 1, d);
  dia.setDate(dia.getDate() - ((dia.getDay() + 6) % 7));
  return iso(dia);
}

/** A sexta da semana que começa na segunda dada. */
export function sextaDaSemana(segunda: string): string {
  const [a, m, d] = segunda.split('-').map(Number);
  return iso(new Date(a, m - 1, d + 4));
}

/** "21/09", para dizer para onde o objetivo foi. */
export function diaEMes(data: string): string {
  const [, m, d] = data.split('-');
  return `${d}/${m}`;
}

/** O objetivo como a lista o conhece, no que a troca de semana precisa. */
export interface ObjetivoLevado {
  id: string;
  texto: string;
  feito: boolean;
  fazendo?: boolean;
  prazo: string | null;
  responsaveis: string[];
  pai?: string | null;
  desejavel?: boolean;
}

export interface SemanaDaPlanning {
  /** A segunda-feira da semana em foco. */
  segunda: string;
  /** Leva `objetivo` (já com a data nova) para a semana dela; `restante` é a
   *  lista que fica nesta. */
  mover: (projetoId: string, objetivo: ObjetivoLevado, restante: ObjetivoLevado[]) => void;
}

/** Nulo fora da Planning: sem ele a lista não sabe a semana e não muda nada
 *  de lugar. */
export const SemanaDaPlanningCtx = createContext<SemanaDaPlanning | null>(null);
