import { useLayoutEffect, useRef, useState } from 'react';

// Switcher segmentado PADRÃO do sistema - pílula branca que desliza medindo a
// posição real de cada opção (lida com rótulos de larguras diferentes, sem
// depender de "1/N" fixo). Use este componente em todo switcher para consistência.
export function SegSwitch<T extends string>({ valor, onChange, opcoes, pequeno, full }: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
  pequeno?: boolean;   // fonte/padding menores
  full?: boolean;      // ocupa 100% da largura, dividindo igualmente
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const botoesRef = useRef<Array<HTMLButtonElement | null>>([]);
  const [pilula, setPilula] = useState<{ left: number; width: number } | null>(null);
  const chave = opcoes.map(o => o.valor).join('|');

  // Mede antes da pintura para a pílula não aparecer fora do lugar no 1º frame.
  useLayoutEffect(() => {
    function medir() {
      const i = opcoes.findIndex(o => o.valor === valor);
      const btn = botoesRef.current[i];
      if (btn) setPilula({ left: btn.offsetLeft, width: btn.offsetWidth });
    }
    medir();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor, chave, pequeno, full]);

  return (
    <div
      ref={wrapRef}
      className="scope-switch"
      style={full ? { display: 'flex', width: '100%' } : { width: 'fit-content' }}
    >
      {pilula && (
        <div
          className="scope-switch-pill"
          style={{
            left: pilula.left,
            width: pilula.width,
            transition: 'left .22s cubic-bezier(0.4,0,0.2,1), width .22s cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      )}
      {opcoes.map((o, i) => (
        <button
          key={o.valor}
          ref={el => { botoesRef.current[i] = el; }}
          type="button"
          className={valor === o.valor ? 'active' : ''}
          onClick={() => onChange(o.valor)}
          style={pequeno ? { fontSize: 11, padding: '4px 12px' } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
