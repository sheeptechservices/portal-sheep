import { useCallback, useEffect, useRef, useState } from 'react';

/** Fecha um modal ou popup com animação, e não com um corte.
 *
 *  React desmonta o componente no instante em que a condição vira falsa, então
 *  a entrada anima e a saída some. Este gancho inverte o caminho: quem fecha
 *  chama `fechar()`, que marca a saída, deixa a animação correr e só então
 *  avisa quem monta. O componente segue montado durante esses milissegundos, e
 *  é isso que dá a saída.
 *
 *  A duração acompanha a `--transition-spring` da casa. Quem pede menos
 *  movimento fecha na hora: animação de saída para quem desligou animação
 *  seria só atraso.
 *
 *  Uso:
 *    const { saindo, fechar } = useSaidaSuave(onFechar);
 *    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} onClick={fechar}>
 */
export function useSaidaSuave(onFechar: () => void, ms = 180) {
  const [saindo, setSaindo] = useState(false);
  const relogio = useRef<number | null>(null);

  // Fechar duas vezes - clicar no fundo e apertar Escape junto - não pode
  // agendar dois avisos.
  const fechar = useCallback(() => {
    if (relogio.current !== null) return;
    const semMovimento = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (semMovimento) { onFechar(); return; }
    setSaindo(true);
    relogio.current = window.setTimeout(() => {
      relogio.current = null;
      onFechar();
    }, ms);
  }, [onFechar, ms]);

  useEffect(() => () => {
    if (relogio.current !== null) window.clearTimeout(relogio.current);
  }, []);

  return { saindo, fechar };
}
