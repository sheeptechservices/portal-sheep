import { useEffect } from 'react';
import { CORTE_CELULAR } from './useCelular';

/**
 * Fecha um dropdown aberto via portal (position: fixed) quando:
 * - o usuário clica fora dele;
 * - a página/qualquer container rola (o dropdown "descolaria" do gatilho);
 * - a janela é redimensionada.
 *
 * `refs` deve conter o gatilho e o próprio dropdown - cliques/rolagens dentro
 * deles não fecham.
 *
 * No celular a lista não fica ancorada no gatilho: ela ganha a classe
 * `lista-folha` e vira folha embaixo da tela, com um véu atrás. Ali rolar a
 * página ou mudar o tamanho da janela não fecha nada - no celular as duas
 * coisas acontecem sozinhas (a barra do navegador que some, o teclado que
 * abre), e era isso que fazia o filtro sumir no meio do toque.
 */
export function useDropdownDismiss(
  open: boolean,
  refs: Array<React.RefObject<HTMLElement | null>>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const inside = (t: Node | null) => !!t && refs.some(r => r.current?.contains(t));
    const celular = window.matchMedia(CORTE_CELULAR).matches;

    // A lista é o ref que está em `position: fixed` (o gatilho mora no fluxo da
    // página). Ela pode montar um quadro depois do gatilho, então procura de novo
    // no quadro seguinte.
    let folha: HTMLElement | null = null;
    const marcarFolha = () => {
      if (!celular || folha) return;
      folha = refs.map(r => r.current).find(el => !!el && getComputedStyle(el).position === 'fixed') ?? null;
      if (!folha) return;
      folha.classList.add('lista-folha');
      document.body.classList.add('com-lista-folha');
    };
    marcarFolha();
    const quadro = requestAnimationFrame(marcarFolha);

    const onDown = (e: MouseEvent) => { if (!inside(e.target as Node)) onClose(); };
    const onScroll = (e: Event) => {
      if (folha || inside(e.target as Node)) return;
      onClose();
    };
    const onResize = () => { if (!folha) onClose(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(quadro);
      folha?.classList.remove('lista-folha');
      document.body.classList.remove('com-lista-folha');
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);
}
