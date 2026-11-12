import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

/**
 * Marcar várias peças de uma lista para agir em todas de uma vez.
 *
 * É o mesmo gesto em toda tela de cards da casa, e por isso mora aqui, e não
 * em cada quadro:
 *
 * - a caixa do card marca e desmarca (`marcar`);
 * - Ctrl ou Cmd com clique marca, e Shift com clique marca o intervalo desde a
 *   última marcada à mão;
 * - com alguma marcada, o clique simples também marca: é o gesto da vez, e
 *   abrir a ficha no meio de uma seleção a interromperia (`clicar`);
 * - Esc limpa.
 *
 * A seleção vale só para o que está na tela: a peça que um filtro escondeu sai
 * dela. Senão a barra contaria uma peça que ninguém está vendo, e excluir a
 * levaria junto.
 *
 * `visiveis` vai na ordem em que as peças aparecem - coluna por coluna, grupo
 * por grupo -, porque é nela que o Shift acha o intervalo.
 */
/** Quem está selecionando agora. Uma tela pode ter vários quadros montados ao
 *  mesmo tempo - a ficha do projeto tem um por entrega -, e duas seleções
 *  vivas dariam duas barras, uma por cima da outra. Começar a marcar num
 *  quadro limpa a dos outros. */
const ouvintes = new Set<(dono: symbol) => void>();

export function useSelecao<T extends { id: number | string }>(visiveis: T[], { ativo = true, ocupado = false }: {
  /** Falso para quem não pode agir em nenhuma peça: aí o clique só abre. */
  ativo?: boolean;
  /** Há uma gaveta ou um diálogo por cima: o Esc é de quem está aberto. */
  ocupado?: boolean;
} = {}) {
  const [selecao, setSelecao] = useState<Set<T['id']>>(() => new Set());
  const ancora = useRef<T['id'] | null>(null);

  useEffect(() => {
    setSelecao(s => {
      if (s.size === 0) return s;
      const ids = new Set(visiveis.map(t => t.id));
      const fica = new Set([...s].filter(id => ids.has(id)));
      return fica.size === s.size ? s : fica;
    });
  }, [visiveis]);

  const selecionadas = useMemo(() => visiveis.filter(t => selecao.has(t.id)), [visiveis, selecao]);

  const limpar = useCallback(() => {
    setSelecao(new Set());
    ancora.current = null;
  }, []);

  const eu = useRef(Symbol('selecao'));
  useEffect(() => {
    const aoOutroComecar = (dono: symbol) => { if (dono !== eu.current) limpar(); };
    ouvintes.add(aoOutroComecar);
    return () => { ouvintes.delete(aoOutroComecar); };
  }, [limpar]);
  const temAlguma = selecao.size > 0;
  useEffect(() => {
    if (temAlguma) ouvintes.forEach(f => f(eu.current));
  }, [temAlguma]);

  // Na captura, e parando ali: o Esc que limpa a seleção não pode fechar
  // também a ficha em volta do quadro, que escuta a mesma tecla.
  useEffect(() => {
    if (selecao.size === 0 || ocupado) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Num campo o Esc é dele: limpa a busca, fecha a lista que abriu.
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.stopPropagation();
      limpar();
    };
    window.addEventListener('keydown', aoTeclar, true);
    return () => window.removeEventListener('keydown', aoTeclar, true);
  }, [selecao.size, ocupado, limpar]);

  const marcar = useCallback((t: T, intervalo = false) => {
    const de = ancora.current;
    if (intervalo && de != null && de !== t.id) {
      const i = visiveis.findIndex(x => x.id === de);
      const j = visiveis.findIndex(x => x.id === t.id);
      if (i >= 0 && j >= 0) {
        const [a, b] = i < j ? [i, j] : [j, i];
        setSelecao(s => {
          const n = new Set(s);
          for (const x of visiveis.slice(a, b + 1)) n.add(x.id);
          return n;
        });
        ancora.current = t.id;
        return;
      }
    }
    ancora.current = t.id;
    setSelecao(s => {
      const n = new Set(s);
      if (n.has(t.id)) n.delete(t.id); else n.add(t.id);
      return n;
    });
  }, [visiveis]);

  /** O clique no card: marca quando é gesto de seleção, abre quando não é. */
  const clicar = useCallback((t: T, e: MouseEvent, abrir: (t: T) => void) => {
    if (ativo && (e.shiftKey || e.ctrlKey || e.metaKey || selecao.size > 0)) {
      e.preventDefault();
      marcar(t, e.shiftKey);
      return;
    }
    abrir(t);
  }, [ativo, selecao.size, marcar]);

  const marcarTodas = useCallback(() => setSelecao(new Set(visiveis.map(t => t.id))), [visiveis]);

  return { selecao, selecionadas, marcar, clicar, limpar, marcarTodas, ativo };
}

/** Shift com clique marca o intervalo; sem isto o navegador seleciona o texto
 *  entre os dois cliques, e a tela inteira fica azul. */
export const semTextoNoShift = (e: MouseEvent) => { if (e.shiftKey) e.preventDefault(); };
