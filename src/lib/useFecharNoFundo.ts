import { useRef } from 'react';
import type React from 'react';

/** Fecha o modal só quando o gesto inteiro aconteceu no fundo. Sem isto, uma
 *  seleção de texto que começa dentro da caixa e termina fora fecha a caixa,
 *  jogando fora o que a pessoa estava escrevendo. */
export function useFecharNoFundo(onFechar: () => void) {
  const comecouNoFundo = useRef(false);
  return {
    onMouseDown: (e: React.MouseEvent) => { comecouNoFundo.current = e.target === e.currentTarget; },
    onClick: (e: React.MouseEvent) => {
      if (comecouNoFundo.current && e.target === e.currentTarget) onFechar();
    },
  };
}
