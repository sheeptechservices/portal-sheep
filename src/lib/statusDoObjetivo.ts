// ─────────────────────────────────────────────────────────────────────────────
//  O status de um objetivo da semana: fazer, fazendo e feito.
//
//  Gravado como duas marcas, `feito` e `fazendo`, e não como uma palavra: o
//  `feito` já existia e é o que conta os cumpridos em toda parte (a Planning, o
//  quadro do cabeçalho, a lista de frases feitas da semana). O `fazendo` veio
//  depois, ao lado dele, e o objetivo gravado antes dele lê como "fazer" ou
//  "feito", como sempre leu.
// ─────────────────────────────────────────────────────────────────────────────
import { IconMarcoAndamento, IconMarcoConcluido, IconMarcoPlanejado } from '../components/icons';

export const STATUS_OBJETIVO = ['Fazer', 'Fazendo', 'Feito'] as const;
export type StatusDoObjetivo = typeof STATUS_OBJETIVO[number];

/** Vermelho o que falta, âmbar o que anda, verde o que saiu. */
export const COR_OBJETIVO: Record<string, string> = {
  Fazer: 'var(--red)',
  Fazendo: 'var(--amber)',
  Feito: 'var(--green)',
};

/** Os mesmos marcos das entregas: o círculo vazio, o relógio e o certo. */
export const ICONE_OBJETIVO: Record<string, (p: { size?: number }) => JSX.Element> = {
  Fazer: IconMarcoPlanejado,
  Fazendo: IconMarcoAndamento,
  Feito: IconMarcoConcluido,
};

export function statusDoObjetivo(o: { feito: boolean; fazendo?: boolean }): StatusDoObjetivo {
  if (o.feito) return 'Feito';
  return o.fazendo ? 'Fazendo' : 'Fazer';
}

/** A lista do marco: os três, sempre, na ordem do trabalho. */
export const OPCOES_DO_OBJETIVO = STATUS_OBJETIVO.map(valor => ({ valor }));

/** As duas marcas que um status grava. */
export function marcasDoStatus(s: StatusDoObjetivo): { feito: boolean; fazendo: boolean } {
  return { feito: s === 'Feito', fazendo: s === 'Fazendo' };
}
