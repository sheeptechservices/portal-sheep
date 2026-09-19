// ─────────────────────────────────────────────────────────────────────────────
//  O marco de status: a bolha na cor do status, com o desenho dele, que é ela
//  mesma o seletor - clicar abre a lista, e o escolhido fica ali.
//
//  Nasceu na entrega (`MarcoEntrega`, na tela de Projetos) e saiu de lá quando
//  os objetivos da semana ganharam status: é a mesma peça nos dois, com as
//  etapas, as cores e os desenhos de cada um.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';

type Desenho = (p: { size?: number }) => JSX.Element;

export interface OpcaoDoMarco {
  valor: string;
  /** O que a lista mostra, quando não é o próprio valor. */
  rotulo?: string;
  /** Uma linha miúda embaixo do rótulo, para a opção que pede explicação. */
  nota?: string;
}

export function MarcoDeStatus({ status, opcoes, cores, icones, nome, somenteLeitura, desabilitado, onEscolher }: {
  status: string;
  opcoes: OpcaoDoMarco[];
  cores: Record<string, string>;
  icones: Record<string, Desenho>;
  /** De que é o status, para o leitor de tela: "Etapa da entrega". */
  nome: string;
  /** Só a bolha, sem lista: quem vê não muda. */
  somenteLeitura?: boolean;
  /** A lista não abre - a linha ainda não tem o que marcar. */
  desabilitado?: boolean;
  onEscolher?: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const Icone = icones[status] ?? Object.values(icones)[0];
  const cor = { '--mc': cores[status] ?? 'var(--gray2)' } as CSSProperties;

  function abrir() {
    setPos(ancorar(triggerRef.current!, opcoes.length, 200));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  if (somenteLeitura) {
    return (
      <span className="marco-bolha" style={cor} title={`${nome}: ${status}`} role="img"
        aria-label={`${nome}: ${status}`}>
        <Icone size={14} />
      </span>
    );
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="marco-entrega" onClick={abrir}
        disabled={desabilitado} aria-haspopup="listbox" aria-expanded={aberto}
        title={`${nome}: ${status}`} aria-label={`${nome}: ${status}`} style={cor}>
        <Icone size={14} />
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown" role="listbox"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10050 }}>
          {opcoes.map(op => {
            const Desenho = icones[op.valor] ?? Icone;
            return (
              <div key={op.valor} role="option" aria-selected={op.valor === status}
                className={`status-select-option${op.valor === status ? ' active' : ''}`}
                onClick={() => { setAberto(false); onEscolher?.(op.valor); }}>
                <span className="marco-bolha" style={{ '--mc': cores[op.valor] } as CSSProperties}>
                  <Desenho size={14} />
                </span>
                <span>
                  {op.rotulo ?? op.valor}
                  {op.nota && (
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)' }}>
                      {op.nota}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
