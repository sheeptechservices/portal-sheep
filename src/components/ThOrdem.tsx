import type { ReactNode } from 'react';
import { IconChevronDown, IconChevronUp, IconChevronUpDown } from './icons';

/** A ordem de uma tabela: a coluna que manda e para que lado. */
export interface OrdemDaTabela<C extends string> { col: C; dir: 'asc' | 'desc' }

/**
 * O título de coluna que ordena, no mesmo desenho do cabeçalho da lista do
 * Funil: a seta de três estados diz se a coluna manda e para que lado. Mora em
 * `components/`, e não dentro de uma tela, porque a fila de chamados de dentro
 * e o painel de chamados do cliente usam o mesmo cabeçalho - e o painel não
 * pode importar nada do portal.
 */
export function ThOrdem<C extends string>({ col, ordem, onOrdenar, children }: {
  col: C;
  ordem: OrdemDaTabela<C> | null;
  onOrdenar: (col: C) => void;
  children: ReactNode;
}) {
  const ativa = ordem?.col === col;
  return (
    <th className={`sortable-th${ativa ? ' sorted' : ''}`}
      aria-sort={ativa ? (ordem!.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onClick={() => onOrdenar(col)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOrdenar(col); } }}>
      {children}
      <span className="sort-arrow" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        {ativa
          ? (ordem!.dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)
          : <IconChevronUpDown size={12} />}
      </span>
    </th>
  );
}
