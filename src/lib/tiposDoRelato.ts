// ─────────────────────────────────────────────────────────────────────────────
//  O que um chamado é: bug ou melhoria.
//
//  Um lugar só para os dois tipos, porque eles aparecem em três telas - a fila
//  de chamados de dentro, o cartão de reportar e o painel de chamados do
//  cliente - e cada uma precisa do mesmo nome, da mesma cor e do mesmo ícone.
//  Mora fora de `ListaReportes` para o painel público não levar o código da
//  fila interna junto só para ler esta lista.
//
//  São dois, e de propósito: a pergunta que a fila responde é uma só - isto
//  está quebrado? -, e uma terceira gaveta viraria o depósito de quem não quis
//  escolher. Vermelho para o defeito e verde para o pedido, porque é a mesma
//  leitura de toda a casa: vermelho é o que está errado agora, verde é o que
//  se ganha.
// ─────────────────────────────────────────────────────────────────────────────
import { IconBug, IconSparkles } from '../components/icons';

export const TIPOS_DO_RELATO = [
  { valor: 'bug', label: 'Bug', cor: 'var(--red)', Icone: IconBug },
  { valor: 'melhoria', label: 'Melhoria', cor: 'var(--green-light)', Icone: IconSparkles },
];

/** A linha que ajuda a escolher: de fora, "o relatório não bate" e "queria um
 *  relatório novo" chegam iguais, e quem escreve é quem sabe qual dos dois é. */
export const DESCRICAO_DO_TIPO: Record<string, string> = {
  bug: 'Existe e parou de funcionar, ou funciona errado',
  melhoria: 'Não existe ainda, ou existe e podia ser melhor',
};

export const ROTULO_DO_TIPO: Record<string, (typeof TIPOS_DO_RELATO)[number]> =
  Object.fromEntries(TIPOS_DO_RELATO.map(t => [t.valor, t]));
