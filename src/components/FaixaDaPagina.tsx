import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ContaAnimada } from './ContaAnimada';

/**
 * A faixa do alto da pagina, no desenho da identidade de 11/2026: o rotulo da
 * area em caixa alta com o nome da tela embaixo, os numeros que resumem a tela
 * ao lado, no mesmo par rotulo e valor, e a acao principal no canto direito.
 *
 * O titulo e um numero a mais na mesma fileira, e nao um cabecalho por cima
 * dela: o olho le a faixa da esquerda para a direita como uma linha so.
 */
export interface ItemDaFaixa {
  rotulo: string;
  valor: ReactNode;
  /** Complemento colado ao valor, menor: a variacao, a unidade. */
  nota?: ReactNode;
  /** Pinta a nota: `bom` em verde, `ruim` em vermelho. Sem tom, ela fica cinza. */
  tom?: 'bom' | 'ruim';
  /** Dica do numero, para quem quer saber de onde ele sai. */
  dica?: string;
  /** Texto com numero que deve contar ao aparecer (`R$ 447.000`, `31%`).
   *  Numero puro sempre conta; texto so quando pedido - uma data nao conta. */
  animar?: boolean;
  /** Numero que filtra a tela: vira botao, e aceso quando o filtro esta ligado. */
  onClick?: () => void;
  ativo?: boolean;
}

export function FaixaDaPagina({ secao, titulo, itens = [], acoes, apos }: {
  /** A area do portal a que a tela pertence: COMERCIAL, OPERACAO. */
  secao: string;
  titulo: string;
  itens?: ItemDaFaixa[];
  acoes?: ReactNode;
  /** O que vem logo depois do titulo: as abas de uma tela que tem duas faces. */
  apos?: ReactNode;
}) {
  return (
    <header className="faixa-pagina">
      <div className="faixa-item faixa-titulo">
        <span className="faixa-rotulo">{secao}</span>
        <h1 className="faixa-valor">{titulo}</h1>
      </div>
      {apos && <div className="faixa-apos">{apos}</div>}
      {itens.map(item => {
        const conteudo = (
          <>
            <span className="faixa-rotulo">{item.rotulo}</span>
            <span className="faixa-valor">
              {typeof item.valor === 'number' || (item.animar && typeof item.valor === 'string')
                ? <ContaAnimada valor={item.valor as string | number} />
                : item.valor}
              {item.nota != null && (
                <span className={`faixa-nota${item.tom ? ` ${item.tom}` : ''}`}>{item.nota}</span>
              )}
            </span>
          </>
        );
        return item.onClick ? (
          <button key={item.rotulo} type="button" title={item.dica}
            className={`faixa-item faixa-item-botao${item.ativo ? ' ativo' : ''}`}
            aria-pressed={!!item.ativo} onClick={item.onClick}>
            {conteudo}
          </button>
        ) : (
          <div key={item.rotulo} className="faixa-item" title={item.dica}>{conteudo}</div>
        );
      })}
      {acoes && <div className="faixa-acoes">{acoes}</div>}
    </header>
  );
}

/**
 * As abas em pilula do cabecalho do painel. A escolhida e a pilula cheia de
 * limao, e ela corre de uma aba para a outra em vez de apagar numa e acender
 * na outra: o olho acompanha para onde a escolha foi.
 */
export interface AbaPilula<T extends string> {
  id: T;
  rotulo: string;
  /** Contagem miuda ao lado do rotulo. */
  conta?: number;
}

export function AbasPilula<T extends string>({ abas, ativa, onTrocar, rotulo }: {
  abas: AbaPilula<T>[];
  ativa: T;
  onTrocar: (id: T) => void;
  /** Nome do grupo para leitor de tela. */
  rotulo: string;
}) {
  const trilho = useRef<HTMLDivElement>(null);
  const [pino, setPino] = useState<{ left: number; width: number } | null>(null);

  // A pilula mede a aba escolhida depois do desenho, e mede de novo quando a
  // largura muda (uma contagem que ganha um digito, a fonte que chega tarde).
  useLayoutEffect(() => {
    const el = trilho.current;
    if (!el) return;
    const medir = () => {
      const alvo = el.querySelector<HTMLElement>(`[data-aba="${ativa}"]`);
      if (alvo) setPino({ left: alvo.offsetLeft, width: alvo.offsetWidth });
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ativa, abas]);

  return (
    <div ref={trilho} className="abas-pilula" role="tablist" aria-label={rotulo}>
      {pino && <span className="abas-pilula-pino" aria-hidden="true"
        style={{ transform: `translateX(${pino.left}px)`, width: pino.width }} />}
      {abas.map(a => (
        <button key={a.id} type="button" role="tab" data-aba={a.id}
          aria-selected={a.id === ativa}
          className={`aba-pilula${a.id === ativa ? ' ativa' : ''}`}
          onClick={() => onTrocar(a.id)}>
          {a.rotulo}
          {a.conta != null && <span className="aba-pilula-conta"><ContaAnimada valor={a.conta} /></span>}
        </button>
      ))}
    </div>
  );
}
