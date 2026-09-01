// ─────────────────────────────────────────────────────────────────────────────
//  Abas do sistema.
//
//  O traço embaixo da aba ativa desliza até ela, em vez de apagar de um lado e
//  acender do outro: com o traço preso a cada botão, trocar de aba era um corte
//  seco, e nada dizia de onde para onde a atenção foi.
//
//  A posição é medida do botão de verdade, e não calculada por "1/N": os
//  rótulos têm larguras diferentes, e uma fração fixa deixaria o traço torto em
//  "Reuniões" ao lado de "Geral".
// ─────────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export function Abas<T extends string>({ valor, onChange, opcoes, style }: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
  style?: CSSProperties;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const botoesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [traco, setTraco] = useState<{ left: number; width: number } | null>(null);
  const chave = opcoes.map(o => o.valor).join('|');

  // Antes da pintura: medido depois, o traço apareceria uma vez no lugar errado.
  useLayoutEffect(() => {
    function medir() {
      const i = opcoes.findIndex(o => o.valor === valor);
      const btn = botoesRef.current[i];
      if (btn) setTraco({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
    medir();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, chave]);

  return (
    <div ref={wrapRef} className="config-tabs" style={style} role="tablist">
      {opcoes.map((o, i) => (
        <button
          key={o.valor}
          ref={el => { botoesRef.current[i] = el; }}
          type="button"
          role="tab"
          aria-selected={valor === o.valor}
          className={`config-tab${valor === o.valor ? ' active' : ''}`}
          onClick={() => onChange(o.valor)}
        >
          {o.label}
        </button>
      ))}
      {traco && (
        <span className="config-tab-traco" aria-hidden="true"
          style={{ left: traco.left, width: traco.width }} />
      )}
    </div>
  );
}

/** O painel da aba escolhida. Recebe `key={aba}` de quem o usa, para a entrada
 *  tocar de novo a cada troca - sem isso o conteúdo novo aparece de estalo. */
export function AbaPainel({ children, style }: {
  children: React.ReactNode;
  style?: CSSProperties;
}) {
  return <div className="aba-painel" style={style}>{children}</div>;
}
