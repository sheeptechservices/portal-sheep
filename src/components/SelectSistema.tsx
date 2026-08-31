import { useState, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

// Select PADRÃO do sistema (substitui o <select> nativo) - gatilho .liquidez-trigger
// + dropdown .status-select-dropdown num portal (não é cortado por overflow).
// Sem opção vazia: o campo é obrigatório.
export function SelectSistema<T extends string>({ valor, onChange, opcoes, minWidth, placeholder }: {
  valor: T;
  onChange: (v: T) => void;
  /** `logo` troca o texto da opção pela marca. `label` continua obrigatório:
   *  vira o `alt` da imagem e o texto de quem não tem logo. `escurecer` é para
   *  a marca desenhada em branco, que sumiria no fundo claro. */
  opcoes: {
    valor: T;
    label: string;
    logo?: { src: string; altura: number; escurecer?: boolean; cor?: string; proporcao?: number };
    /** Desenho ao lado do rótulo. Diferente de `logo`, que o substitui. */
    icone?: ReactNode;
  }[];
  minWidth?: number;
  /** Texto do gatilho enquanto nada foi escolhido. Fica fora da lista: é
   *  convite a escolher, e não uma opção que se possa selecionar. */
  placeholder?: string;
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

  /** A altura vem da tabela óptica das marcas, reduzida para caber na linha:
   *  altura igual para todas deixaria assinatura larga minúscula ao lado de
   *  selo quadrado. */
  const marca = (o: {
    label: string;
    logo?: { src: string; altura: number; escurecer?: boolean; cor?: string; proporcao?: number };
    icone?: ReactNode;
  }) => {
    if (o.logo) {
      const h = Math.min(24, Math.round(o.logo.altura * 0.52));
      // Logo de uma cor só é pintada, e não achatada: mostra a cor da marca em
      // vez do cinza que a silhueta produziria.
      if (o.logo.cor && o.logo.proporcao) {
        return (
          <span className="marca-tingida" role="img" aria-label={o.label} title={o.label}
            style={{
              height: h, width: Math.round(h * o.logo.proporcao),
              '--marca': `url(${o.logo.src})`, '--marca-cor': o.logo.cor,
            } as CSSProperties} />
        );
      }
      return (
        <img className="select-logo" src={o.logo.src} alt={o.label} title={o.label}
          data-escurecer={o.logo.escurecer ? '' : undefined}
          style={{ height: h }} />
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {o.icone}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
      </span>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        className="liquidez-trigger"
        // Mesma métrica de `.form-input`: 14px de texto com 10px de folga em
        // cima e embaixo dão os 42px, e o raio é o `--radius-md` de lá. Campo
        // de texto e dropdown lado a lado precisam ler como a mesma família.
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0,
          height: 42, padding: '0 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}
      >
        {atual ? marca(atual) : <span style={{ color: 'var(--gray2)' }}>{placeholder ?? ''}</span>}
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
              {marca(o)}
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
