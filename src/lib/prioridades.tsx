// ─────────────────────────────────────────────────────────────────────────────
//  Prioridade.
//
//  Vale para projeto e para tarefa, e mora aqui - fora das telas - porque as
//  duas leem a mesma escala e o formulário de tarefa é compartilhado entre
//  elas. Deixada dentro de uma página, ela fechava um ciclo de import entre as
//  telas de Projetos e de Tarefas.
// ─────────────────────────────────────────────────────────────────────────────
import type { JSX } from 'react';
import {
  IconPrioridadeAlta, IconPrioridadeBaixa, IconPrioridadeMaxima, IconPrioridadeMedia,
} from '../components/icons';

/** Sai como "Média" porque a maioria é: exigir a escolha consciente em todo
 *  cadastro só produziria ruído. */
export const PRIORIDADES = ['Urgente', 'Alta', 'Média', 'Baixa'] as const;
export const PRIORIDADE_PADRAO = 'Média';

export const COR_PRIORIDADE: Record<string, string> = {
  'Urgente': '#D93025',
  'Alta': '#C2410C',
  'Média': '#B58300',
  'Baixa': '#6E6F69',
};

/** Barras que crescem com o nível; o topo da escala usa desenho próprio. */
const DESENHO_PRIORIDADE: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Urgente': IconPrioridadeMaxima,
  'Alta': IconPrioridadeAlta,
  'Média': IconPrioridadeMedia,
  'Baixa': IconPrioridadeBaixa,
};

/** O ícone já sai na cor do nível. A cor mora aqui, e não em cada uso, senão a
 *  célula editável e a de leitura acabam divergindo. */
export const ICONE_PRIORIDADE: Record<string, (p: { size?: number }) => JSX.Element> =
  Object.fromEntries(PRIORIDADES.map(nivel => [
    nivel,
    ({ size = 14 }: { size?: number }) => (
      <span style={{ color: COR_PRIORIDADE[nivel], display: 'inline-flex' }}>
        {DESENHO_PRIORIDADE[nivel]({ size })}
      </span>
    ),
  ]));
