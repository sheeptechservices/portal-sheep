import { useLayoutEffect, type RefObject } from 'react';

/**
 * Faz um `textarea` crescer com o que se escreve, até um teto.
 *
 * Campo de altura fixa esconde o texto que já existe: quem abre uma tarefa com
 * dez linhas de descrição vê três e precisa rolar dentro de uma caixa dentro de
 * um painel que também rola. O teto existe pelo motivo oposto - uma descrição
 * longa não pode empurrar o resto do formulário para fora da tela.
 *
 * A medida é feita antes da pintura (`useLayoutEffect`): medida depois, a caixa
 * aparece pequena e cresce num pulo visível a cada tecla.
 */
export function useAlturaAutomatica(
  ref: RefObject<HTMLTextAreaElement | null>,
  valor: string,
  teto = 260,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Zerar antes de medir: `scrollHeight` nunca encolhe sozinho, e sem isto a
    // caixa só cresceria - apagar o texto deixaria o vão para trás.
    el.style.height = 'auto';
    const altura = Math.min(el.scrollHeight, teto);
    el.style.height = `${altura}px`;
    // Passou do teto: a rolagem volta a existir, e só aí.
    el.style.overflowY = el.scrollHeight > teto ? 'auto' : 'hidden';
  }, [ref, valor, teto]);
}
