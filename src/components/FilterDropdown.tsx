import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

// ── Filtro de múltipla escolha ───────────────────
export default function FilterDropdown({
  label, values, options, onChange,
}: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  }

  const hasSelection = values.length > 0;
  const btnLabel = hasSelection
    ? values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? label)
      : `${label} (${values.length})`
    : label;

  return (
    <>
      <button
        ref={triggerRef}
        className={`filter-dropdown-btn${hasSelection ? ' active' : ''}`}
        onClick={openDropdown}
        type="button"
      >
        <span>{btnLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left }}>
          {hasSelection && (
            <div className="filter-dropdown-clear" onClick={() => onChange([])}>
              Limpar seleção
            </div>
          )}
          {options.map(o => {
            const checked = values.includes(o.value);
            return (
              <div
                key={o.value}
                className={`filter-dropdown-option${checked ? ' active' : ''}`}
                onClick={() => toggle(o.value)}
              >
                <span className={`filter-check${checked ? ' checked' : ''}`}>
                  {checked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {o.label}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// Fluxo de pagamento (fim_type) - fonte única de opções + labels/cores
export const FIM_OPTIONS: { value: string; label: string; bg: string; color: string }[] = [
  { value: '1', label: 'Trava Perfeita (Escrow no Contrato)', bg: 'rgba(30,138,62,.12)', color: '#1E8A3E' },
  { value: '2', label: 'Anuência (Pgto direto)',              bg: 'rgba(0,102,204,.12)', color: '#0066CC' },
  { value: '3', label: 'Escrow na Nota',                      bg: 'rgba(122,86,0,.12)',  color: '#7A5600' },
  { value: '4', label: 'Repasse',                             bg: 'rgba(124,58,237,.12)', color: '#7C3AED' },
];
const FIM_LABELS: Record<number, { label: string; bg: string; color: string }> = Object.fromEntries(
  FIM_OPTIONS.map(o => [Number(o.value), { label: o.label, bg: o.bg, color: o.color }])
);
const FIM_SELECT_OPTIONS = FIM_OPTIONS.map(o => ({ value: o.value, label: o.label }));
