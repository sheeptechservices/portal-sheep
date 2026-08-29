import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

// Select PADRÃO do sistema (substitui o <select> nativo) - gatilho .liquidez-trigger
// + dropdown .status-select-dropdown num portal (não é cortado por overflow).
// Sem opção vazia: o campo é obrigatório.
export function SelectSistema<T extends string>({ valor, onChange, opcoes, minWidth }: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
  minWidth?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const atual = opcoes.find(o => o.valor === valor);

  function abrir() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const altura = Math.min(8 + opcoes.length * 36, 320);
    const espacoAbaixo = window.innerHeight - rect.bottom - 8;
    const paraCima = espacoAbaixo < altura && rect.top > altura;
    setPos({
      top: paraCima ? rect.top - altura - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, minWidth ?? 180),
    });
    setAberto(o => !o);
  }

  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        className="liquidez-trigger"
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0,
          height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
          fontSize: 13.5, fontWeight: 500, background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}
      >
        <span>{atual?.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ transition: 'transform .15s', transform: aberto ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10000 }}>
          {opcoes.map(o => (
            <div
              key={o.valor}
              className={`status-select-option${valor === o.valor ? ' active' : ''}`}
              onClick={() => { onChange(o.valor); setAberto(false); }}
            >
              <span>{o.label}</span>
              {valor === o.valor && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
