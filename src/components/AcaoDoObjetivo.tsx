// ─────────────────────────────────────────────────────────────────────────────
//  As ações de um objetivo da semana: desejável, data, responsáveis, prova e
//  desdobramento. Uma peça só, para a fileira ler como uma família - a mesma
//  pílula de 26px, a mesma borda, o mesmo ícone de 13px e o mesmo hover. Vazia,
//  ela é um círculo com o ícone; com conteúdo (a data, as fotos, a contagem),
//  cresce para os lados sem mudar de altura.
//
//  A data e as pessoas moram nos componentes delas (`DatePicker chip`,
//  `SeletorPessoas compacto`), que vestem a mesma classe `.acao-objetivo`.
// ─────────────────────────────────────────────────────────────────────────────
import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** O tamanho do ícone em toda ação de objetivo. */
export const ICONE_DA_ACAO = 13;

export function AcaoDoObjetivo({ rotulo, className, children, ...resto }: {
  /** O nome da ação, para leitor de tela e para o balão do mouse. */
  rotulo: string;
  className?: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} {...resto}
      className={`acao-objetivo${className ? ` ${className}` : ''}`}>
      {children}
    </button>
  );
}
