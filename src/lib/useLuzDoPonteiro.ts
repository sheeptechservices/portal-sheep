import { useEffect } from 'react';

/**
 * Os cards que ganham a luz que segue o ponteiro. Lista fechada, e nao "tudo
 * que e clicavel": a luz diz "isto e uma peca inteira", e num botao ou numa
 * linha de tabela ela so faria barulho. Card novo que queira a luz leva
 * `data-luz`, sem precisar entrar aqui.
 */
const ALVOS = [
  '.kanban-card',
  '.admin-stat-card-v2',
  '.admin-stat-card',
  '.card',
  '.visao-cartao',
  '.perfil-cartao',
  '.integration-card',
  '.gc-card',
  '.ac-card',
  '[data-luz]',
].join(', ');

/**
 * Acende um halo de limao que acompanha o ponteiro dentro do card sob ele.
 *
 * Um ouvinte so, no documento, e nao um por card: a lista de cards muda o
 * tempo todo (busca, filtro, gaveta), e o ouvinte unico nunca fica para tras.
 * O calculo roda uma vez por quadro, por mais rapido que o mouse ande.
 *
 * O desenho mora no CSS (`.luz-ponteiro`); aqui so se escreve a posicao e a
 * classe. No toque nao ha "sob o dedo" antes do toque, entao o gancho nem liga.
 */
export function useLuzDoPonteiro() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let atual: HTMLElement | null = null;
    let quadro = 0;
    let ultimo: PointerEvent | null = null;

    const apagar = () => {
      if (!atual) return;
      atual.classList.remove('luz-ponteiro');
      atual = null;
    };

    const pintar = () => {
      quadro = 0;
      const e = ultimo;
      if (!e) return;
      const alvo = (e.target instanceof Element ? e.target.closest(ALVOS) : null) as HTMLElement | null;
      if (alvo !== atual) {
        apagar();
        if (alvo) {
          alvo.classList.add('luz-ponteiro');
          atual = alvo;
        }
      }
      if (atual) {
        const r = atual.getBoundingClientRect();
        atual.style.setProperty('--luz-x', `${e.clientX - r.left}px`);
        atual.style.setProperty('--luz-y', `${e.clientY - r.top}px`);
      }
    };

    const mover = (e: PointerEvent) => {
      ultimo = e;
      if (!quadro) quadro = requestAnimationFrame(pintar);
    };

    document.addEventListener('pointermove', mover, { passive: true });
    document.documentElement.addEventListener('pointerleave', apagar);
    window.addEventListener('blur', apagar);
    return () => {
      document.removeEventListener('pointermove', mover);
      document.documentElement.removeEventListener('pointerleave', apagar);
      window.removeEventListener('blur', apagar);
      if (quadro) cancelAnimationFrame(quadro);
      apagar();
    };
  }, []);
}
