import { useEffect, useState } from 'react';

/** O corte do celular, o mesmo da barra de navegação de baixo e das regras de
 *  `@media (max-width: 768px)` do `main.css`. */
export const CORTE_CELULAR = '(max-width: 768px)';

/** A tela está no tamanho de celular? Acompanha a troca (girar o aparelho,
 *  redimensionar a janela), para a peça trocar de forma sem recarregar. */
export function useCelular(): boolean {
  const [celular, setCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CORTE_CELULAR).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(CORTE_CELULAR);
    const aplicar = () => setCelular(mq.matches);
    aplicar();
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, []);
  return celular;
}
