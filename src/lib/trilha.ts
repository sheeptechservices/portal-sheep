// ─────────────────────────────────────────────────────────────────────────────
//  O degrau extra do caminho de pão.
//
//  A casca desenha "Ferramentas / Nome da ferramenta" sozinha, porque isso ela
//  sabe pela página aberta. O que ela não sabe é o que a ferramenta abriu por
//  dentro - um talento, um documento, um registro qualquer -, e é esse degrau
//  que a página publica aqui.
//
//  Mora fora do `AdminApp` pelo mesmo motivo do toast: quem publica o degrau é
//  uma página que o `AdminApp` importa, e pedir o gancho de volta a ele fecharia
//  um ciclo entre os dois arquivos.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useEffect, useRef } from 'react';

export interface DegrauTrilha {
  /** O que aparece no fim do caminho. */
  label: string;
  /** Voltar um nível: é o que o degrau do meio passa a fazer quando existe um
   *  terceiro. */
  onVoltar: () => void;
}

export const TrilhaContext = createContext<{
  degrau: DegrauTrilha | null;
  definir: (d: DegrauTrilha | null) => void;
}>({ degrau: null, definir: () => {} });

export function useTrilha() { return useContext(TrilhaContext); }

/**
 * Publica um degrau enquanto ele existir, e o retira ao sair da tela.
 *
 * O `onVoltar` fica num `ref` e fora das dependências de propósito: ele é uma
 * função nova a cada render, e no array de dependências faria o efeito rodar
 * sem parar.
 */
export function useDegrauTrilha(label: string | null, onVoltar: () => void) {
  const { definir } = useTrilha();
  const voltar = useRef(onVoltar);
  voltar.current = onVoltar;

  useEffect(() => {
    if (!label) { definir(null); return; }
    definir({ label, onVoltar: () => voltar.current() });
    return () => definir(null);
  }, [label, definir]);
}
