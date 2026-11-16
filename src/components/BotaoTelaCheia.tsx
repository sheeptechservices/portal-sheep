// O botão de tela cheia dos modais principais: os cantos para fora amplia, os
// cantos para dentro volta. Fica no cabeçalho, logo antes do fechar, com a
// mesma moldura dos botões vizinhos - por isso a classe vem de quem usa.
import { IconTelaCheia } from './icons';

export function BotaoTelaCheia({ cheia, onAlternar, classe = 'secao-add' }: {
  cheia: boolean;
  onAlternar: () => void;
  /** A moldura dos vizinhos no cabeçalho de cada modal. */
  classe?: string;
}) {
  const rotulo = cheia ? 'Voltar ao tamanho normal' : 'Abrir em tela cheia';
  return (
    <button type="button" className={classe} style={{ width: 30, height: 30 }}
      title={rotulo} aria-label={rotulo} aria-pressed={cheia}
      onClick={onAlternar}>
      <IconTelaCheia size={15} cheia={cheia} />
    </button>
  );
}
