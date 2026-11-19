import { useCallback, useSyncExternalStore } from 'react';
import { assinarRota, navegar, rotaAtual, SUBPAGINAS } from './rotas';
import type { Page } from '../admin/destinos';

// A subpagina de cada tela - a aba do Funil, a visao das Tarefas, a secao das
// Configuracoes - guardada fora da tela. Assim o menu lateral sabe qual delas
// esta aberta para acender o item certo, e pode levar direto a uma: ele grava a
// aba e abre a pagina, e a pagina ja nasce nela.
//
// A aba tambem vai no endereco (`/tarefas/lista`): escolher uma reescreve o
// caminho, e um link com ela abre a tela ja na aba. Trocar de pagina e voltar
// devolve a mesma aba; recarregar devolve a do endereco.

const valores = new Map<string, string>();
const ouvintes = new Set<() => void>();

function assinar(o: () => void): () => void {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

function avisar() { for (const o of ouvintes) o(); }

/** A aba que o endereco traz manda: link colado, voltar do navegador. Sem aba
 *  no endereco, a tela volta para a dela de sempre. */
function seguirRota() {
  const r = rotaAtual();
  if (!SUBPAGINAS[r.pagina]) return;
  if (r.sub) {
    if (valores.get(r.pagina) === r.sub) return;
    valores.set(r.pagina, r.sub);
  } else {
    if (!valores.has(r.pagina)) return;
    valores.delete(r.pagina);
  }
  avisar();
}
seguirRota();
assinarRota(seguirRota);

export const lojaSubpagina = {
  ler(pagina: string): string | undefined { return valores.get(pagina); },
  definir(pagina: string, aba: string): void {
    const r = rotaAtual();
    // Com a tela aberta, a aba vai para o endereco. Com outra tela aberta (o
    // menu grava a aba antes de trocar de pagina), quem escreve e a troca.
    if (r.pagina === pagina && SUBPAGINAS[pagina as Page]?.includes(aba) && r.sub !== aba) {
      navegar({ ...r, sub: aba }, 'replace');
    }
    if (valores.get(pagina) === aba) return;
    valores.set(pagina, aba);
    avisar();
  },
};

/** A aba gravada de uma pagina, para quem so le (o menu). */
export function useSubpaginaAtual(pagina: string): string | undefined {
  return useSyncExternalStore(assinar, () => valores.get(pagina), () => undefined);
}

/**
 * O `useState` da aba de uma pagina, ligado ao menu e ao endereco. `inicial`
 * vale enquanto ninguem escolheu nada; a pagina continua dona da validacao
 * (aba que a permissao tirou volta para a primeira, como antes).
 */
export function useSubpagina<T extends string>(pagina: string, inicial: T | (() => T)): [T, (v: T) => void] {
  const gravada = useSubpaginaAtual(pagina);
  const aba = (gravada ?? (typeof inicial === 'function' ? (inicial as () => T)() : inicial)) as T;
  const definir = useCallback((v: T) => lojaSubpagina.definir(pagina, v), [pagina]);
  return [aba, definir];
}
