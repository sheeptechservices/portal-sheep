import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A dica rica: um cartao de vidro que abre sobre a peca com o ponteiro em cima
 * e explica o que ela resume - a lista por tras do numero, a composicao da
 * barra, o detalhe da linha.
 *
 * E um gancho, e nao um invólucro, porque a peca que dispara pode ser qualquer
 * coisa - um cartao, uma linha de grade, um botao - e embrulhar quebraria o
 * layout dela. Quem usa espalha `gatilho` na peca e poe `dica` em qualquer
 * lugar da arvore: o cartao mora num portal no `body`, fora de todo `overflow`.
 *
 * O movimento: abre depois de uma intencao curta (atravessar a tela com o
 * mouse nao acende dicas pelo caminho), nasce crescendo a partir da peca e,
 * com `seguir`, desliza acompanhando o ponteiro ao longo dela. Ao sair, ele
 * encolhe antes de desmontar - sem corte.
 */
const INTENCAO_MS = 140;
const FECHAR_MS = 90;
const SAIDA_MS = 160;
const MARGEM = 10;

interface Posicao { x: number; y: number; acima: boolean }

export function useDicaRica<T extends HTMLElement>(
  conteudo: () => ReactNode,
  { largura = 300, seguir = false }: { largura?: number; seguir?: boolean } = {},
) {
  const ref = useRef<T | null>(null);
  const [pos, setPos] = useState<Posicao | null>(null);
  const [saindo, setSaindo] = useState(false);
  const timers = useRef<number[]>([]);
  const limpar = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => limpar, []);

  const posicionar = useCallback((ponteiroX?: number) => {
    const el = ref.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const acima = r.top > 260;
    const centro = seguir && ponteiroX != null ? ponteiroX : r.left + r.width / 2;
    const meia = largura / 2 + MARGEM;
    const x = Math.min(Math.max(centro, meia), window.innerWidth - meia);
    return { x, y: acima ? r.top - 10 : r.bottom + 10, acima };
  }, [largura, seguir]);

  const abrir = (e?: { clientX: number }) => {
    limpar();
    setSaindo(false);
    if (pos) return;
    timers.current.push(window.setTimeout(() => setPos(posicionar(e?.clientX)), INTENCAO_MS));
  };
  const fechar = () => {
    limpar();
    timers.current.push(window.setTimeout(() => {
      setSaindo(true);
      timers.current.push(window.setTimeout(() => { setPos(null); setSaindo(false); }, SAIDA_MS));
    }, FECHAR_MS));
  };

  // Rolar a pagina tira a peca de baixo da dica: ela fecha, em vez de boiar.
  useEffect(() => {
    if (!pos) return;
    const sair = () => { limpar(); setPos(null); setSaindo(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') sair(); };
    window.addEventListener('scroll', sair, true);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('scroll', sair, true); window.removeEventListener('keydown', tecla); };
  }, [!!pos]);

  const quadro = useRef(0);
  const gatilho = {
    ref: (el: T | null) => { ref.current = el; },
    onMouseEnter: (e: React.MouseEvent) => abrir(e),
    onMouseLeave: fechar,
    onFocus: () => abrir(),
    onBlur: fechar,
    onMouseMove: seguir ? (e: React.MouseEvent) => {
      if (!pos) return;
      const x = e.clientX;
      cancelAnimationFrame(quadro.current);
      quadro.current = requestAnimationFrame(() => setPos(p => (p ? { ...p, x: posicionar(x)?.x ?? p.x } : p)));
    } : undefined,
  };

  const dica = pos ? createPortal(
    <div role="tooltip"
      className={`dica-rica${pos.acima ? ' acima' : ' abaixo'}${saindo ? ' saindo' : ''}`}
      style={{ left: pos.x, top: pos.y, width: largura }}>
      <div className="dica-rica-corpo">{conteudo()}</div>
    </div>,
    document.body,
  ) : null;

  return { gatilho, dica, aberta: !!pos && !saindo };
}

/** O cabecalho da dica: rotulo em caixa alta e o numero grande. */
export function DicaTopo({ rotulo, valor, nota }: { rotulo: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="dica-topo">
      <span className="dica-rotulo">{rotulo}</span>
      <span className="dica-valor">{valor}{nota && <span className="dica-nota">{nota}</span>}</span>
    </div>
  );
}

/** Uma barra feita de fatias, com a legenda embaixo: a composicao de um total. */
export function DicaComposicao({ fatias }: { fatias: { rotulo: string; valor: number; cor: string }[] }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  return (
    <div className="dica-composicao">
      <div className="dica-composicao-barra">
        {fatias.filter(f => f.valor > 0).map((f, i) => (
          <span key={f.rotulo} style={{ width: `${(f.valor / total) * 100}%`, background: f.cor, animationDelay: `${80 + i * 60}ms` }} />
        ))}
      </div>
      <div className="dica-legenda">
        {fatias.map(f => (
          <span key={f.rotulo} className="dica-legenda-item">
            <span className="dica-legenda-ponto" style={{ background: f.cor }} />
            <span className="dica-legenda-nome">{f.rotulo}</span>
            <strong>{f.valor}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
