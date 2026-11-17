import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { IconAgrupar, IconCheck } from './icons';

// ─────────────────────────────────────────────────────────────────────────────
//  Agrupar a lista por um critério. Botão com rótulo, no desenho dos filtros
//  que moram ao lado dele na barra: "Agrupar" quando a lista está corrida,
//  "Agrupado: Status" quando ela está dividida. A lista de critérios abre num
//  portal, como a de todo filtro, e a primeira linha desfaz o agrupamento.
// ─────────────────────────────────────────────────────────────────────────────

export function AgruparPor<T extends string>({ valor, opcoes, onChange }: {
  /** O critério em uso; vazio é a lista sem grupos. */
  valor: T | '';
  opcoes: readonly { valor: T; label: string }[];
  onChange: (v: T | '') => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  const atual = opcoes.find(o => o.valor === valor);

  // A lista abre embaixo do botão e não passa da borda da janela: o botão
  // costuma morar no fim da barra, e abrir para a direita a cortaria.
  useLayoutEffect(() => {
    if (!aberto || !gatilho.current || !lista.current) return;
    const MARGEM = 8;
    const g = gatilho.current.getBoundingClientRect();
    const r = lista.current.getBoundingClientRect();
    const left = Math.max(MARGEM, Math.min(g.left, window.innerWidth - r.width - MARGEM));
    const top = g.bottom + 4;
    setPos(p => (Math.abs(p.top - top) < 1 && Math.abs(p.left - left) < 1 ? p : { top, left }));
  });

  function escolher(v: T | '') {
    onChange(v);
    setAberto(false);
  }

  const linhas: { valor: T | ''; label: string }[] = [{ valor: '', label: 'Sem agrupar' }, ...opcoes];

  return (
    <>
      <button ref={gatilho} type="button" className={`filter-dropdown-btn${atual ? ' active' : ''}`}
        aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        <IconAgrupar size={13} />
        <span>{atual ? `Agrupado: ${atual.label}` : 'Agrupar'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && createPortal(
        <div ref={lista} className="filter-dropdown-list agrupar-lista" role="listbox" aria-label="Agrupar por"
          style={{ top: pos.top, left: pos.left }}>
          {linhas.map(o => {
            const escolhido = o.valor === valor;
            return (
              <div key={o.valor || 'nenhum'} role="option" aria-selected={escolhido}
                className={`filter-dropdown-option agrupar-opcao${escolhido ? ' active' : ''}`}
                onClick={() => escolher(o.valor)}>
                <span className="filter-dropdown-texto">{o.label}</span>
                {escolhido && <span className="agrupar-marca" aria-hidden="true"><IconCheck size={13} /></span>}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
