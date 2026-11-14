import { useCallback, useSyncExternalStore } from 'react';

// A subpagina de cada tela - a aba do Funil, a visao das Tarefas, a secao das
// Configuracoes - guardada fora da tela. Assim o menu lateral sabe qual delas
// esta aberta para acender o item certo, e pode levar direto a uma: ele grava a
// aba e abre a pagina, e a pagina ja nasce nela.
//
// A memoria e da sessao da janela: trocar de pagina e voltar devolve a mesma
// aba, e recarregar comeca do inicio de cada tela.

const valores = new Map<string, string>();
const ouvintes = new Set<() => void>();

function assinar(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const lojaSubpagina = {
  ler(pagina: string): string | undefined { return valores.get(pagina); },
  definir(pagina: string, aba: string): void {
    if (valores.get(pagina) === aba) return;
    valores.set(pagina, aba);
    for (const o of ouvintes) o();
  },
};

/** A aba gravada de uma pagina, para quem so le (o menu). */
export function useSubpaginaAtual(pagina: string): string | undefined {
  return useSyncExternalStore(assinar, () => valores.get(pagina), () => undefined);
}

/**
 * O `useState` da aba de uma pagina, ligado ao menu. `inicial` vale enquanto
 * ninguem escolheu nada; a pagina continua dona da validacao (aba que a
 * permissao tirou volta para a primeira, como antes).
 */
export function useSubpagina<T extends string>(pagina: string, inicial: T | (() => T)): [T, (v: T) => void] {
  const gravada = useSubpaginaAtual(pagina);
  const aba = (gravada ?? (typeof inicial === 'function' ? (inicial as () => T)() : inicial)) as T;
  const definir = useCallback((v: T) => lojaSubpagina.definir(pagina, v), [pagina]);
  return [aba, definir];
}
