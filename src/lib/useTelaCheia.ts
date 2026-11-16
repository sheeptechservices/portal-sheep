// ─────────────────────────────────────────────────────────────────────────────
//  Tela cheia dos modais principais.
//
//  A tarefa, o projeto e a oportunidade abrem num tamanho de leitura, e um
//  botão no cabeçalho os leva até quase a borda da tela - para o quadro de
//  tarefas do projeto caber com as colunas lado a lado, para uma descrição
//  longa respirar. A escolha fica neste navegador, uma por modal: quem gosta
//  do projeto em tela cheia não precisa ver a tarefa assim também.
//
//  Quem usa põe a classe `tela-cheia` na caixa do modal; o desenho é do CSS,
//  com a folga curta em volta e a mudança de tamanho na curva da casa.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react';

/** A chave do projeto, de antes de a tela cheia ser de todos os modais: quem
 *  já a tinha ligado continua abrindo o projeto assim. */
const CHAVE_ANTIGA_DO_PROJETO = 'sheep_projeto_tela_cheia';

const chave = (modal: string) => `sheep_tela_cheia:${modal}`;

function ler(modal: string): boolean {
  try {
    const v = localStorage.getItem(chave(modal))
      ?? (modal === 'projeto' ? localStorage.getItem(CHAVE_ANTIGA_DO_PROJETO) : null);
    return v === '1';
  } catch { return false; }
}

export function useTelaCheia(modal: string) {
  const [cheia, setCheia] = useState(() => ler(modal));
  const alternar = useCallback(() => setCheia(c => {
    try { localStorage.setItem(chave(modal), c ? '0' : '1'); } catch { /* sem armazenamento */ }
    return !c;
  }), [modal]);
  return { cheia, alternar };
}
