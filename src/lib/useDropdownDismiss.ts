import { useEffect } from 'react';

/**
 * Fecha um dropdown aberto via portal (position: fixed) quando:
 * - o usuário clica fora dele;
 * - a página/qualquer container rola (o dropdown "descolaria" do gatilho);
 * - a janela é redimensionada.
 *
 * `refs` deve conter o gatilho e o próprio dropdown - cliques/rolagens dentro
 * deles não fecham.
 */
export function useDropdownDismiss(
  open: boolean,
  refs: Array<React.RefObject<HTMLElement | null>>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const inside = (t: Node | null) => !!t && refs.some(r => r.current?.contains(t));
    const onDown = (e: MouseEvent) => { if (!inside(e.target as Node)) onClose(); };
    const onScroll = (e: Event) => { if (inside(e.target as Node)) return; onClose(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [open]);
}
