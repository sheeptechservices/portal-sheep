// ─────────────────────────────────────────────────────────────────────────────
//  As atividades em segundo plano.
//
//  Toda ação demorada do portal - analisar uma vaga, gerar um documento,
//  consultar um bureau - nasce dentro de alguma coisa que se fecha: uma gaveta,
//  um modal, um popup. Quando a pessoa fecha essa coisa antes de a ação
//  terminar, duas perdas acontecem juntas: o trabalho some, e ninguém avisa que
//  sumiu. Aqui o trabalho passa a ser do sistema, e não da tela que o abriu.
//
//  O contrato é curto de propósito. Quem chama pede um `trabalho`, faz o que
//  tem de fazer com o `sinal` dele no `fetch`, vai contando o andamento, e no
//  fim diz se concluiu ou falhou. O balão do canto e o toast do fim são
//  desenhados pelo provedor, não por quem chamou.
//
//  O que isto NÃO faz, e é bom estar escrito: a ação vive enquanto a aba do
//  navegador viver. Trocar de aba não interrompe nada - o `fetch` continua -,
//  mas fechar a aba ou recarregar a página encerra o que estava correndo aqui.
//  Ação que precisa sobreviver a isso tem de deixar registro no servidor, como
//  a análise de vaga faz com o histórico.
//
//  Cancelar aborta o pedido; o que o servidor já gravou continua gravado.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext } from 'react';

export interface Atividade {
  id: string;
  /** O que está acontecendo: "Analisando a vaga". */
  titulo: string;
  /** De onde ela saiu: "Banco de talentos". */
  onde?: string;
  /** A linha de andamento, quando há uma: "12 de 33 pessoas". */
  detalhe: string | null;
  /** De 0 a 1. `null` é a ação que não tem como se medir - a barra então anda
   *  sozinha, dizendo "estou viva" em vez de fingir uma fração. */
  progresso: number | null;
  /** Marcada para sair: dá tempo de a animação de saída rodar. */
  saindo?: boolean;
  /** A tela que começou a ação está à vista e já mostra o andamento dela. O
   *  balão então se cala: dois lugares contando a mesma coisa ao mesmo tempo é
   *  ruído, e o balão existe para quando a ação sai de vista. */
  oculta?: boolean;
  /** A página onde a ação nasceu. O balão navega até lá antes de abrir. */
  pagina?: string;
  /** Reabre o lugar de onde a ação saiu - a gaveta, o modal, o popup. */
  abrir?: () => void;
  /** A pergunta que o x faz antes de cancelar de verdade. */
  aviso?: string;
}

/** O que quem começou uma ação recebe de volta. */
export interface Trabalho {
  id: string;
  /** Vai no `fetch`. Cancelar no balão aborta por aqui. */
  sinal: AbortSignal;
  /** Foi cancelada por quem clicou? Serve para não mostrar erro de algo que a
   *  própria pessoa interrompeu. */
  foiCancelada: () => boolean;
  andar: (progresso: number | null, detalhe?: string | null) => void;
  /** Liga e desliga o balão. Quem chamou é quem sabe se a própria tela ainda
   *  está mostrando o andamento. */
  mostrarBalao: (v: boolean) => void;
  /** Tira o balão e confirma no toast. */
  concluir: (titulo: string, mensagem?: string) => void;
  /** Tira o balão e explica no toast. */
  falhar: (titulo: string, mensagem?: string) => void;
}

export interface AtividadesCtx {
  atividades: Atividade[];
  iniciar: (dados: {
    titulo: string;
    onde?: string;
    pagina?: string;
    /** Como voltar para onde a ação está acontecendo. Enquanto a tela de origem
     *  estiver montada, isto reabre a gaveta ou o modal; se a pessoa já tiver
     *  trocado de página, o balão navega para `pagina` primeiro - e ali a
     *  função antiga não vale mais, então ela cai na página, e não na gaveta. */
    abrir?: () => void;
    aviso?: string;
  }) => Trabalho;
  cancelar: (id: string) => void;
}

/** Fora do provedor - numa bancada, num teste - o trabalho continua
 *  funcionando; só não aparece balão nenhum. Devolver um objeto sem `sinal`
 *  quebraria o `fetch` de quem chamou. */
function trabalhoSolto(): Trabalho {
  const controle = new AbortController();
  return {
    id: 'solto',
    sinal: controle.signal,
    foiCancelada: () => false,
    andar: () => {},
    mostrarBalao: () => {},
    concluir: () => {},
    falhar: () => {},
  };
}

export const AtividadesContext = createContext<AtividadesCtx>({
  atividades: [],
  iniciar: () => trabalhoSolto(),
  cancelar: () => {},
});

export function useAtividades() { return useContext(AtividadesContext); }
