// ─────────────────────────────────────────────────────────────────────────────
//  Complexidade da tarefa.
//
//  Quanto trabalho ela dá, que é pergunta diferente de quando ela precisa estar
//  pronta: uma tarefa urgente pode ser simples, e uma tarefa sem prazo pode
//  custar uma semana. Por isso é campo próprio, ao lado da prioridade, e não
//  outra escala dentro dela.
//
//  Mora aqui, fora das telas, pelo mesmo motivo da prioridade: o formulário de
//  tarefa é compartilhado entre as telas de Projetos e de Tarefas, e a escala
//  dentro de uma delas fecharia um ciclo de import.
// ─────────────────────────────────────────────────────────────────────────────
import type { JSX } from 'react';
import {
  IconComplexidadeDificil, IconComplexidadeModerada, IconComplexidadeSimples,
} from '../components/icons';

/** Da que mais custa para a que menos custa. Sem padrão: a tarefa nasce sem
 *  complexidade, e vazio é resposta - dimensionar é uma decisão, e um valor
 *  escolhido pelo sistema viraria palpite gravado como fato. */
export const COMPLEXIDADES = ['Difícil', 'Moderada', 'Simples'] as const;

export type Complexidade = typeof COMPLEXIDADES[number];

/** A cor de cada nível, em token da casa: o tema escuro acompanha sozinho. */
export const COR_COMPLEXIDADE: Record<string, string> = {
  'Difícil': 'var(--red)',
  'Moderada': 'var(--amber)',
  'Simples': 'var(--green)',
};

/** O que cada nível quer dizer, na hora de escolher. A escala é de esforço, e
 *  a frase diz em que ordem de grandeza ele está - sem prometer prazo, que é
 *  outro campo. */
export const DESCRICAO_COMPLEXIDADE: Record<string, string> = {
  'Difícil': 'Muitas partes ou pouca certeza: pede investigação',
  'Moderada': 'Caminho conhecido, com alguma coisa a resolver',
  'Simples': 'Direto ao ponto, sem nada a descobrir',
};

/** O caminho de cada nível: reto, com um degrau, com três. */
const DESENHO_COMPLEXIDADE: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Difícil': IconComplexidadeDificil,
  'Moderada': IconComplexidadeModerada,
  'Simples': IconComplexidadeSimples,
};

/** O ícone já sai na cor do nível, como o da prioridade: a cor mora aqui, e não
 *  em cada uso, senão a lista e o card acabam divergindo. */
export const ICONE_COMPLEXIDADE: Record<string, (p: { size?: number }) => JSX.Element> =
  Object.fromEntries(COMPLEXIDADES.map(nivel => [
    nivel,
    ({ size = 14 }: { size?: number }) => (
      <span style={{ color: COR_COMPLEXIDADE[nivel], display: 'inline-flex' }}>
        {DESENHO_COMPLEXIDADE[nivel]({ size })}
      </span>
    ),
  ]));

/** A posição na escala - Difícil é 0. Sem complexidade vai para o fim: a
 *  tarefa que ninguém dimensionou não se compara com as que alguém pesou. */
export function posicaoDaComplexidade(c: string | null | undefined): number {
  const i = COMPLEXIDADES.indexOf(String(c ?? '') as Complexidade);
  return i < 0 ? COMPLEXIDADES.length : i;
}
