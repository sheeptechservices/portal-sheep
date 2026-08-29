import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Submission, StatusConfig, SubmissionDetail, Evento, EtapaArquivo, FormArquivo, Pendencia } from './types';
import { useToast, useAuth, iniciais, nomeCurto } from './AdminApp';
import { DatePicker } from '../components/DatePicker';
import { ExecutionDateModal } from '../components/ExecutionDateModal';
import { maskCNPJ } from '../lib/masks';
import { IconEye, IconDownload, IconClip, IconDoc, IconImage, IconLink, IconZip, IconX, IconPlus, IconSpinner, IconInbox } from '../components/icons';
import { SegSwitch } from '../components/SegSwitch';
import { CategoriaTag, ANEXO_CATEGORIAS, normalizaCategoria } from '../components/CategoriaTag';
import { distribuirParcelas } from '../lib/parcelas';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { definirImagemArrasto } from '../lib/dragImage';
import { buildDepsReportHTML, depsPortalLink as depsLinkDoRaw, depsDataConsulta } from '../lib/depsReport';
import { DepsPanel, DepsPreviewModal } from '../components/DepsPanel';
import { PRODUTOS_DEPS } from '../lib/depsProdutos';

const LIQUIDEZ_OPTIONS = ['Interno', 'Atlas', 'FIDC'] as const;

// Seletor de produto/módulo DEPS - dropdown customizado (padrão do sistema, via portal).
function DepsProdutoSelect({ value, onChange, disabled }: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const current = PRODUTOS_DEPS.find(p => p.id === value);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const dropH = Math.min(8 + PRODUTOS_DEPS.length * 36, 300);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  return (
    <>
      <button ref={triggerRef} type="button" className="deps-select-trigger" disabled={disabled}
        title="Produto DEPS" onClick={openDropdown}>
        <span>{current?.nome ?? 'Selecionar módulo'}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10001 }}>
          {PRODUTOS_DEPS.map(p => (
            <div key={p.id} className={`status-select-option${value === p.id ? ' active' : ''}`}
              onClick={() => { onChange(p.id); setOpen(false); }}>
              <span>{p.nome}</span>
              {value === p.id && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── FormSelect ───────────────────────────────────────
function FormSelect({ value, onChange, options, placeholder = '- Não definido -' }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, flipUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const dropH = Math.min(8 + (options.length + 1) * 36, 320);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 180), flipUp });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="liquidez-trigger"
        style={{ width: '100%', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, borderColor: open ? 'var(--yellow)' : undefined, boxShadow: open ? '0 0 0 4px var(--yd)' : undefined }}
      >
        <span style={{ color: current ? 'var(--gray)' : 'var(--gray2)' }}>{current?.label ?? placeholder}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10000 }}>
          <div className={`status-select-option${!value ? ' active' : ''}`} onClick={() => { onChange(''); setOpen(false); }}>
            <span style={{ color: 'var(--gray2)' }}>{placeholder}</span>
            {!value && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          {options.map(opt => (
            <div key={opt.value} className={`status-select-option${value === opt.value ? ' active' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
              <span>{opt.label}</span>
              {value === opt.value && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Liquidez Select ──────────────────────────────────
function LiquidezSelect({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 140) });
    setOpen(true);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  return (
    <>
      <button ref={triggerRef} className="liquidez-trigger" onClick={openDropdown} type="button">
        <span>{value ?? '-'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          <div className={`status-select-option${!value ? ' active' : ''}`} onClick={() => { onChange(''); setOpen(false); }}>
            <span style={{ color: 'var(--gray2)' }}>-</span>
            {!value && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
          </div>
          {LIQUIDEZ_OPTIONS.map(opt => (
            <div key={opt} className={`status-select-option${value === opt ? ' active' : ''}`} onClick={() => { onChange(opt); setOpen(false); }}>
              <span>{opt}</span>
              {value === opt && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Categoria de anexo Select (padrão do sistema) ────
function CategoriaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const dropH = Math.min(ANEXO_CATEGORIAS.length * 34 + 8, 300);
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 130) });
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    }
    // Ao rolar qualquer container, o dropdown (position: fixed) descolaria do gatilho - então fecha.
    function handleScroll(e: Event) {
      if (dropRef.current?.contains(e.target as Node)) return; // rolar dentro da própria lista não fecha
      setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handle);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="anexo-cat-trigger"
        title="Categoria"
        onClick={e => { e.stopPropagation(); openDropdown(); }}
      >
        <span>{value}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10001 }}>
          {ANEXO_CATEGORIAS.map(c => (
            <div key={c} className={`status-select-option${value === c ? ' active' : ''}`} onClick={e => { e.stopPropagation(); onChange(c); setOpen(false); }}>
              <span>{c}</span>
              {value === c && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Pendências ───────────────────────────────────────
const PENDENCIA_CATEGORIAS = ['Documento', 'Aceite', 'Contrato', 'Outros'] as const;
const PEND_CAT_COLORS: Record<string, { bg: string; color: string }> = {
  Documento: { bg: 'rgba(0,102,204,.12)', color: '#0066CC' },
  Aceite:    { bg: 'rgba(30,138,62,.12)', color: '#1E8A3E' },
  Contrato:  { bg: 'rgba(124,58,237,.12)', color: '#7C3AED' },
  Outros:    { bg: 'rgba(120,120,120,.12)', color: '#666666' },
};
const normPendCat = (c?: string | null) => (c && (PENDENCIA_CATEGORIAS as readonly string[]).includes(c) ? c : 'Outros');

function PendenciaTag({ categoria }: { categoria?: string | null }) {
  const cat = normPendCat(categoria);
  const c = PEND_CAT_COLORS[cat];
  return <span className="categoria-tag categoria-tag-xs" style={{ background: c.bg, color: c.color }}>{cat}</span>;
}

// Dropdown de categoria de pendência (padrão do sistema, via portal)
function PendCatSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const dropH = PENDENCIA_CATEGORIAS.length * 34 + 8;
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 130) });
    setOpen(o => !o);
  }
  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) { if (!triggerRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false); }
    function s(e: Event) { if (dropRef.current?.contains(e.target as Node)) return; setOpen(false); }
    document.addEventListener('mousedown', h);
    window.addEventListener('scroll', s, true);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', s, true); };
  }, [open]);

  return (
    <>
      <button ref={triggerRef} type="button" className="anexo-cat-trigger" title="Categoria" onClick={e => { e.stopPropagation(); openDropdown(); }}>
        <span>{value || 'Outros'}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10002 }}>
          {PENDENCIA_CATEGORIAS.map(c => (
            <div key={c} className={`status-select-option${value === c ? ' active' : ''}`} onClick={e => { e.stopPropagation(); onChange(c); setOpen(false); }}>
              <span>{c}</span>
              {value === c && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// Modal obrigatório ao mover para uma etapa que exige pendências.
// Se o card já tem pendências abertas, o modal vem PRÉ-PREENCHIDO com elas: o
// usuário pode seguir com as existentes, editá-las ou adicionar novas.
type PendItem = { id?: number; descricao: string; categoria: string };
export function PendenciaMoveModal({ statusName, saving, existentes, onConfirm, onCancel }: {
  statusName: string; saving?: boolean;
  existentes?: PendItem[];
  onConfirm: (itens: PendItem[]) => void; onCancel: () => void;
}) {
  const temExistentes = !!existentes && existentes.length > 0;
  const [itens, setItens] = useState<PendItem[]>(
    temExistentes ? existentes!.map(e => ({ ...e })) : [{ descricao: '', categoria: 'Documento' }]
  );
  const valid = itens.some(i => i.descricao.trim());
  const set = (i: number, patch: Partial<PendItem>) =>
    setItens(prev => prev.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const enviar = () => onConfirm(itens.filter(x => x.descricao.trim()));

  return createPortal(
    <div className="admin-modal-overlay" style={{ zIndex: 1200, alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div className="delete-confirm-modal" style={{ width: 'min(500px, 96vw)', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">Registrar pendências</p>
        <p className="delete-confirm-desc">
          {temExistentes ? (
            <>Este card já tem <strong>{existentes!.length} pendência{existentes!.length > 1 ? 's' : ''}</strong> registrada{existentes!.length > 1 ? 's' : ''}.
            Você pode seguir com {existentes!.length > 1 ? 'elas' : 'ela'}, editar ou adicionar novas antes de mover para <strong>{statusName}</strong>.</>
          ) : (
            <>Antes de mover para <strong>{statusName}</strong>, informe o que está pendente. Pelo menos uma é obrigatória.</>
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0' }}>
          {itens.map((it, i) => (
            <div key={it.id ?? `novo-${i}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="Descreva a pendência…" value={it.descricao}
                autoFocus={i === 0 && !it.id} onChange={e => set(i, { descricao: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter' && valid) enviar(); }} />
              <PendCatSelect value={it.categoria} onChange={c => set(i, { categoria: c })} />
              {itens.length > 1 && (
                <button className="file-delete-btn" title="Remover" aria-label="Remover" onClick={() => setItens(prev => prev.filter((_, idx) => idx !== i))}><IconX size={13} /></button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start', fontSize: 12, padding: '5px 10px' }}
            onClick={() => setItens(prev => [...prev, { descricao: '', categoria: 'Documento' }])}>+ Adicionar pendência</button>
        </div>
        <div className="delete-confirm-actions">
          <button className="delete-confirm-cancel" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="delete-confirm-ok" style={{ background: 'var(--yellow)', borderColor: 'var(--yellow)', color: '#000' }}
            disabled={!valid || saving} onClick={enviar}>
            {saving ? 'Movendo…' : 'Confirmar e mover'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Seção de pendências (checklist) no drawer
function PendenciaSection({ pendencias, onToggle, onDelete, onUpdateCat, onAdd }: {
  pendencias: Pendencia[];
  onToggle: (id: number, resolvida: boolean) => void;
  onDelete: (id: number) => void;
  onUpdateCat: (id: number, categoria: string) => void;
  onAdd: (descricao: string, categoria: string) => Promise<void>;
}) {
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState('Documento');
  const [adding, setAdding] = useState(false);
  const abertas = pendencias.filter(p => !p.resolvida).length;

  async function add() {
    if (!desc.trim() || adding) return;
    setAdding(true);
    try { await onAdd(desc.trim(), cat); setDesc(''); }
    finally { setAdding(false); }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="admin-section-title" style={{ marginBottom: 0 }}>
          Pendências
          {pendencias.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 99,
              background: abertas > 0 ? 'rgba(180,83,9,.14)' : 'rgba(30,138,62,.15)', color: abertas > 0 ? '#B45309' : '#1E8A3E' }}>
              {abertas > 0 ? `${abertas} aberta(s)` : 'resolvidas'}
            </span>
          )}
        </p>
      </div>
      {pendencias.length === 0 && <p style={{ fontSize: 12, color: 'var(--gray2)', margin: '0 0 10px' }}>Nenhuma pendência registrada.</p>}
      {pendencias.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {pendencias.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--gray3)', borderRadius: 10, background: p.resolvida ? 'var(--bg)' : 'var(--white)' }}>
              <input type="checkbox" checked={!!p.resolvida} onChange={e => onToggle(p.id, e.target.checked)}
                style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--green)' }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, wordBreak: 'break-word',
                textDecoration: p.resolvida ? 'line-through' : 'none', color: p.resolvida ? 'var(--gray2)' : 'var(--black)' }}>{p.descricao}</span>
              <PendCatSelect value={normPendCat(p.categoria)} onChange={c => onUpdateCat(p.id, c)} />
              <button className="file-delete-btn" title="Excluir pendência" onClick={() => onDelete(p.id)}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Nova pendência…" value={desc}
          onChange={e => setDesc(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <PendCatSelect value={cat} onChange={setCat} />
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 12px', flexShrink: 0 }} onClick={add} disabled={!desc.trim() || adding}>
          {adding ? '…' : 'Adicionar'}
        </button>
      </div>
    </section>
  );
}

// ── Status Select ────────────────────────────────────
function StatusSelect({
  statuses, currentId, disabled, onChange,
}: {
  statuses: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
  currentId: number | null | undefined;
  disabled: boolean;
  onChange: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const current = statuses.find(s => Number(s.id) === currentId);

  function openDropdown() {
    if (disabled) return;
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 200) });
    setOpen(true);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  return (
    <>
      <button
        ref={triggerRef}
        className="status-select-trigger"
        style={{ '--sc': current?.cor ?? '#aaa' } as any}
        onClick={openDropdown}
        disabled={disabled}
        type="button"
      >
        <span className="status-select-dot" style={{ background: current?.cor ?? '#aaa' }} />
        <span>{current?.nome ?? 'Sem etapa'}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
        >
          {statuses.map(st => {
            const isActive = Number(st.id) === currentId;
            return (
              <div
                key={st.id}
                className={`status-select-option${isActive ? ' active' : ''}`}
                onClick={() => { onChange(Number(st.id)); setOpen(false); }}
              >
                <span className="status-select-dot" style={{ background: st.cor }} />
                <span>{st.nome}</span>
                {isActive && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto', color: st.cor }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Filter Dropdown (multi-select) ───────────────────
function FilterDropdown({
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
    setOpen(true);
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

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

// Formata uma duração em ms de forma amigável (min / h / dias)
function fmtDuracao(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '-';
  const min = ms / 60000;
  if (min < 60) return `${Math.round(min)}min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  const d = h / 24;
  return `${d.toFixed(d < 10 ? 1 : 0)}d`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}


function formatPrazo(iso: string | null | undefined) {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatSize(b: number) {
  return b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
}

type PreviewFile = { base64: string; nome: string; tipo: string };
type PreviewState = { nome: string; tipo: string; base64: string | null };

function FilePreviewModal({ state, onClose, onDownload }: {
  state: PreviewState;
  onClose: () => void;
  onDownload: () => void;
}) {
  const loading = state.base64 === null;
  const isImg = state.tipo.startsWith('image/');
  const isPdf = state.tipo === 'application/pdf';
  const dataUrl = state.base64
    ? (state.base64.startsWith('data:') ? state.base64 : `data:${state.tipo};base64,${state.base64}`)
    : '';

  // Chrome blocks PDF data URLs in iframes - convert to blob URL instead
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isPdf || !dataUrl) { setPdfBlobUrl(null); return; }
    const base64Data = dataUrl.split(',')[1];
    const bytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [dataUrl, isPdf]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="file-preview-backdrop" onClick={onClose}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">{state.nome}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!loading && (
              <button className="file-preview-action" onClick={onDownload}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15V3M7 10l5 5 5-5M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Baixar
              </button>
            )}
            <button className="file-preview-close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="file-preview-body">
          {loading && <div className="file-preview-spinner" />}
          {!loading && isImg && <img src={dataUrl} alt={state.nome} className="file-preview-img" />}
          {!loading && isPdf && pdfBlobUrl && <iframe src={pdfBlobUrl} className="file-preview-iframe" title={state.nome} />}
          {!loading && isPdf && !pdfBlobUrl && <div className="file-preview-spinner" />}
          {!loading && !isImg && !isPdf && (
            <div className="file-preview-unsupported">
              <p>Visualização não disponível para este formato.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onDownload}>Baixar arquivo</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function DecisionCard({ question, answer, files, onDownload, onFetchBase64, onRename }: {
  question: string;
  answer?: boolean;
  files: Array<{ id: number; nome: string; tipo: string; tamanho: number }>;
  onDownload: (id: number, nome: string) => void;
  onFetchBase64: (id: number) => Promise<{ base64: string; nome: string }>;
  onRename: (id: number, nome: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [localNames, setLocalNames] = useState<Record<number, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const hasFiles = files.length > 0;

  async function openPreview(f: { id: number; nome: string; tipo: string }) {
    const displayName = localNames[f.id] ?? f.nome;
    setPreviewState({ nome: displayName, tipo: f.tipo, base64: null });
    const data = await onFetchBase64(f.id);
    setPreviewState({ nome: displayName, tipo: f.tipo, base64: data.base64 });
  }

  function startEdit(f: { id: number; nome: string }) {
    setEditingId(f.id);
    setEditValue(localNames[f.id] ?? f.nome);
    setTimeout(() => editRef.current?.select(), 0);
  }

  async function commitEdit(id: number) {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (localNames[id] ?? files.find(f => f.id === id)?.nome)) {
      setLocalNames(prev => ({ ...prev, [id]: trimmed }));
      await onRename(id, trimmed);
    }
    setEditingId(null);
  }

  const canPreview = (tipo: string) => tipo.startsWith('image/') || tipo === 'application/pdf';

  return (
    <>
      <div className={`detail-decision-card${open ? ' open' : ''}`}>
        <div
          className="detail-decision-row"
          style={hasFiles ? { cursor: 'pointer' } : undefined}
          onClick={hasFiles ? () => setOpen(v => !v) : undefined}
        >
          <p className="detail-decision-question">{question}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {hasFiles && (
              <span className="decision-file-badge">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.41 17.41a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {files.length}
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .15s' }}
                >
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
            )}
            {answer !== undefined ? (
              <span className={`detail-decision-answer${answer ? ' sim' : ' nao'}`}>
                {answer ? 'SIM' : 'NÃO'}
              </span>
            ) : !hasFiles ? (
              <span style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, padding: '2px 8px', background: 'var(--gray3)', borderRadius: 99 }}>Nenhum</span>
            ) : null}
          </div>
        </div>

        {open && hasFiles && (
          <div className="decision-files-inner">
            {files.map(f => {
              const displayName = localNames[f.id] ?? f.nome;
              const isEditing = editingId === f.id;
              return (
                <div key={f.id} className="decision-file-item">
                  <span style={{ fontSize: 14 }}>{f.tipo === 'application/pdf' ? <IconDoc size={15} /> : <IconImage size={15} />}</span>
                  {isEditing ? (
                    <input
                      ref={editRef}
                      className="file-name-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(f.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(f.id); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="decision-file-name editable"
                      title="Clique para renomear"
                      onClick={e => { e.stopPropagation(); startEdit(f); }}
                    >
                      {displayName}
                    </span>
                  )}
                  <span className="decision-file-size">{formatSize(f.tamanho)}</span>
                  {canPreview(f.tipo) && (
                    <button className="file-eye-btn" title="Visualizar" onClick={e => { e.stopPropagation(); openPreview(f); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                      </svg>
                    </button>
                  )}
                  <button className="admin-file-download" title="Baixar" onClick={e => { e.stopPropagation(); onDownload(f.id, displayName); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewState && (
        <FilePreviewModal
          state={previewState}
          onClose={() => setPreviewState(null)}
          onDownload={() => {
            if (!previewState.base64) return;
            const link = document.createElement('a');
            link.href = previewState.base64.startsWith('data:') ? previewState.base64 : `data:${previewState.tipo};base64,${previewState.base64}`;
            link.download = previewState.nome;
            link.click();
          }}
        />
      )}
    </>
  );
}

// ── API helper ──────────────────────────────────────
export function useApi(token: string) {
  const { onSessionExpired } = useAuth();
  return useCallback(async (path: string, method = 'GET', body?: any) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);
}

// ── Comment input box ────────────────────────────────
function CommentInput({ placeholder, onSend, autoFocus, fetchMentions, statuses }: {
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  autoFocus?: boolean;
  fetchMentions?: () => Promise<import('./types').SlackUser[]>;
  statuses?: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [slackUsers, setSlackUsers] = useState<import('./types').SlackUser[]>([]);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [stageQuery, setStageQuery] = useState<string | null>(null);
  const [stageStart, setStageStart] = useState(0);
  const [stageIdx, setStageIdx] = useState(0);
  const [dropPos, setDropPos] = useState({ bottom: 0, left: 0, width: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filtered = mentionQuery !== null
    ? slackUsers.filter(u =>
        !mentionQuery ||
        u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.username.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const filteredStages = stageQuery !== null && statuses
    ? statuses.filter(s => !stageQuery || s.nome.toLowerCase().includes(stageQuery.toLowerCase())).slice(0, 6)
    : [];

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    await onSend(text);
    setText('');
    setSending(false);
    setMentionQuery(null);
    setStageQuery(null);
  }

  function selectMention(user: import('./types').SlackUser) {
    const before = text.slice(0, mentionStart);
    const after = text.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const newText = `${before}@${user.username} ${after}`;
    setText(newText);
    setMentionQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + user.username.length + 2;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    }, 0);
  }

  function selectStage(stage: Pick<StatusConfig, 'id' | 'nome' | 'cor'>) {
    const before = text.slice(0, stageStart);
    const after = text.slice(stageStart + 1 + (stageQuery?.length ?? 0));
    const newText = `${before}#[${stage.nome}] ${after}`;
    setText(newText);
    setStageQuery(null);
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = before.length + stage.nome.length + 4;
        textareaRef.current.selectionStart = pos;
        textareaRef.current.selectionEnd = pos;
        textareaRef.current.focus();
      }
    }, 0);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const atMatch = fetchMentions ? before.match(/@([\w.]*)$/) : null;
    const hashMatch = statuses ? before.match(/#(\w*)$/) : null;
    if (atMatch) {
      const start = cursor - atMatch[0].length;
      setMentionStart(start);
      setMentionQuery(atMatch[1]);
      setMentionIdx(0);
      setStageQuery(null);
      if (slackUsers.length === 0) fetchMentions!().then(setSlackUsers);
      const rect = textareaRef.current!.getBoundingClientRect();
      setDropPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width });
    } else if (hashMatch) {
      const start = cursor - hashMatch[0].length;
      setStageStart(start);
      setStageQuery(hashMatch[1]);
      setStageIdx(0);
      setMentionQuery(null);
      const rect = textareaRef.current!.getBoundingClientRect();
      setDropPos({ bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width });
    } else {
      setMentionQuery(null);
      setStageQuery(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (mentionQuery !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); selectMention(filtered[mentionIdx]); return; }
      if (e.key === 'Escape') { setMentionQuery(null); return; }
    }
    if (stageQuery !== null && filteredStages.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setStageIdx(i => Math.min(i + 1, filteredStages.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setStageIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); selectStage(filteredStages[stageIdx]); return; }
      if (e.key === 'Escape') { setStageQuery(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  return (
    <div className="comment-input-row">
      <textarea
        ref={textareaRef}
        className="comment-textarea"
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        rows={1}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <button className="comment-send-btn" onClick={submit} disabled={!text.trim() || sending}>
        {sending ? '…' : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {mentionQuery !== null && filtered.length > 0 && createPortal(
        <div className="mention-dropdown" style={{ bottom: dropPos.bottom, left: dropPos.left, minWidth: dropPos.width }}>
          {filtered.map((u, i) => (
            <div
              key={u.id}
              className={`mention-option${i === mentionIdx ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); selectMention(u); }}
            >
              {u.avatar
                ? <img src={u.avatar} alt="" className="mention-avatar" />
                : <div className="mention-avatar">{u.name[0]}</div>
              }
              <div>
                <p className="mention-name">{u.name}</p>
                <p className="mention-handle">@{u.username}</p>
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}

      {stageQuery !== null && filteredStages.length > 0 && createPortal(
        <div className="mention-dropdown" style={{ bottom: dropPos.bottom, left: dropPos.left, minWidth: dropPos.width }}>
          {filteredStages.map((s, i) => (
            <div
              key={s.id}
              className={`mention-option${i === stageIdx ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); selectStage(s); }}
            >
              <div className="mention-avatar" style={{ background: `${s.cor}20`, border: `2px solid ${s.cor}`, width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.cor }} />
              </div>
              <p className="mention-name">{s.nome}</p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Render comment text with @user and #[stage] badges ──
function renderCommentText(text: string, statuses?: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[]) {
  const regex = /@([\w.]+)|#\[([^\]]+)\]|(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      parts.push(<span key={key++} className="comment-at-mention">@{match[1]}</span>);
    } else if (match[2]) {
      const stage = statuses?.find(s => s.nome === match![2]);
      const color = stage?.cor ?? '#888888';
      parts.push(<span key={key++} className="comment-stage-mention" style={{ background: `${color}18`, color, borderColor: `${color}50` }}>#{match[2]}</span>);
    } else if (match[3]) {
      // Remove pontuação final acidental (ex.: "link." ou "link)")
      let url = match[3];
      let trailing = '';
      const m = url.match(/[.,;:!?)\]]+$/);
      if (m) { trailing = m[0]; url = url.slice(0, -trailing.length); }
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer" className="comment-link" onClick={e => e.stopPropagation()}>
          {url}
        </a>
      );
      if (trailing) parts.push(trailing);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

// ── Autoria de um evento ─────────────────────────────
// Sem autor gravado (evento anterior ao login individual, ou gerado pela
// própria plataforma) a linha vira "Sistema", em vez de sumir: o histórico fica
// legível e fica claro que ninguém assinou aquilo.
function Autoria({ nome, foto }: { nome: string | null; foto?: string | null }) {
  const semPessoa = !nome;
  const rotulo = nome ?? 'Sistema';
  // A foto pode falhar ao carregar (URL do Google expira, rede caiu): nesse
  // caso volta para as iniciais, que sempre existem.
  const [semFoto, setSemFoto] = useState(false);
  const mostraFoto = !!foto && !semPessoa && !semFoto;
  return (
    <span className="autoria" title={rotulo}>
      <span className={`autoria-marca${semPessoa ? ' autoria-sistema' : ''}`} aria-hidden="true">
        {mostraFoto
          ? <img src={foto!} alt="" referrerPolicy="no-referrer" onError={() => setSemFoto(true)} />
          : (semPessoa ? '-' : iniciais(rotulo))}
      </span>
      <span className="autoria-nome">{semPessoa ? rotulo : nomeCurto(rotulo)}</span>
    </span>
  );
}

// ── Single comment with replies ──────────────────────
function CommentItem({ ev, replies, onReply, onDelete, fetchMentions, statuses }: {
  ev: Evento;
  replies: Evento[];
  onReply: (parentId: number, text: string) => Promise<void>;
  onDelete: (id: number) => void;
  fetchMentions: () => Promise<import('./types').SlackUser[]>;
  statuses?: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
}) {
  const [showReply, setShowReply] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

  return (
    <div className="comment-item">
      <div className="comment-bubble">
        <p className="comment-text">{renderCommentText(ev.descricao ?? '', statuses)}</p>
        <div className="comment-meta">
          <Autoria nome={ev.autor_nome} foto={ev.autor_foto} />
          <span className="comment-time">{formatDate(ev.criado_em)}</span>
          <button className="comment-reply-btn" onClick={() => setShowReply(v => !v)}>
            {showReply ? 'Cancelar' : 'Responder'}
          </button>
          <button className="comment-delete-btn" title="Excluir comentário" onClick={() => onDelete(ev.id)}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {replies.length > 0 && (
            <button className="comment-replies-toggle" onClick={() => setShowReplies(v => !v)}>
              {replies.length} {replies.length === 1 ? 'resposta' : 'respostas'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transform: showReplies ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>

        {replies.length > 0 && showReplies && (
          <div className="comment-replies-inline">
            {replies.map(r => (
              <div key={r.id} className="comment-reply-bubble">
                <p className="comment-text">{renderCommentText(r.descricao ?? '', statuses)}</p>
                <div className="comment-meta" style={{ marginTop: 4 }}>
                  <Autoria nome={r.autor_nome} foto={r.autor_foto} />
                  <span className="comment-time">{formatDate(r.criado_em)}</span>
                  <button className="comment-delete-btn" title="Excluir resposta" onClick={() => onDelete(r.id)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showReply && (
        <div className="comment-reply-input">
          <CommentInput
            placeholder="Escreva uma resposta…"
            autoFocus
            fetchMentions={fetchMentions}
            statuses={statuses}
            onSend={async (text) => { await onReply(ev.id, text); setShowReply(false); setShowReplies(true); }}
          />
        </div>
      )}
    </div>
  );
}

// ── Comments section ─────────────────────────────────
function CommentsSection({ eventos, onSend, onDelete, onFileUpload, fetchMentions, statuses }: {
  eventos: Evento[];
  onSend: (text: string, parentId?: number) => Promise<void>;
  onDelete: (id: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fetchMentions: () => Promise<import('./types').SlackUser[]>;
  statuses?: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
}) {
  const comments = eventos.filter(e => e.tipo === 'comentario');
  const roots = comments.filter(c => !c.parent_id);
  const repliesOf = (id: number) => comments.filter(c => c.parent_id === id);

  return (
    <section className="comments-section">
      <p className="admin-section-title">Comentários {comments.length > 0 && `(${comments.length})`}</p>

      {roots.length === 0 && (
        <p className="comments-empty">Nenhum comentário ainda.</p>
      )}

      <div className="comments-list">
        {roots.map(ev => (
          <CommentItem
            key={ev.id}
            ev={ev}
            replies={repliesOf(ev.id)}
            fetchMentions={fetchMentions}
            statuses={statuses}
            onReply={(parentId, text) => onSend(text, parentId)}
            onDelete={onDelete}
          />
        ))}
      </div>

      <div className="comments-new">
        <div className="comment-new-row">
          <CommentInput
            placeholder="Escreva um comentário… (@ para mencionar, # para etapa)"
            fetchMentions={fetchMentions}
            statuses={statuses}
            onSend={text => onSend(text)}
          />
        </div>
      </div>
    </section>
  );
}

// ── Currency helpers (edit form) ─────────────────────
function maskCurrencyBRL(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10) / 100;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function parseCurrencyBRL(masked: string): number {
  return parseFloat((masked || '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
}

// ── EditField ─────────────────────────────────────────
function EditField({ label, value, onChange, type = 'text', readOnly = false, loading = false, hint }: { label: string; value: string; onChange?: (v: string) => void; type?: string; readOnly?: boolean; loading?: boolean; hint?: string }) {
  return (
    <div className="form-group">
      <label className="form-label">
        {label}
        {readOnly && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '.04em' }}>· automático</span>}
        {loading && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--yellow)' }}>consultando…</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={readOnly}
        placeholder={readOnly && !value ? (loading ? 'Consultando Receita…' : 'Preenchido pelo CNPJ') : undefined}
        className="form-input"
        style={readOnly ? { background: 'var(--bg)', color: 'var(--gray)', cursor: 'default' } : undefined}
      />
      {hint && <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

// ── CedenteSearch ─────────────────────────────────────
interface CedenteOpt { id: string | number; nome: string; cnpj_cpf: string | null }

function CedenteSearch({ token, value, onChange }: {
  token: string;
  value: CedenteOpt | null;
  onChange: (c: CedenteOpt | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<CedenteOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { onSessionExpired } = useAuth();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || options.length > 0) return;
    setLoading(true);
    fetch('/api/admin-data?action=list_cedentes', { headers: { 'x-admin-session': token } })
      .then(r => { if (r.status === 401) { onSessionExpired(); throw new Error('401'); } return r.json(); })
      .then(d => setOptions((d.cedentes ?? []).map((c: any) => ({ id: c.id, nome: c.nome, cnpj_cpf: c.cnpj_cpf ?? null }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, options.length, token, onSessionExpired]);

  const qDigits = query.replace(/\D/g, '');
  const filtered = query.trim()
    ? options.filter(o =>
        o.nome.toLowerCase().includes(query.toLowerCase()) ||
        (qDigits.length > 0 && (o.cnpj_cpf ?? '').replace(/\D/g, '').includes(qDigits))
      )
    : options;

  function handleOpen() { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }
  function select(c: CedenteOpt) { onChange(c); setOpen(false); setQuery(''); }
  function clear() { onChange(null); setQuery(''); }

  const cnpjFmt = (v: string | null) => {
    if (!v) return '';
    const d = v.replace(/\D/g, '');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return v;
  };

  return (
    <div className="form-group">
      <label className="form-label">Cedente *</label>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 11px',
            borderRadius: 8, border: '1.5px solid var(--yellow)', background: 'var(--white)',
            boxShadow: '0 0 0 3px rgba(169,224,62,0.12)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{value.nome}</span>
              {value.cnpj_cpf && <span style={{ fontSize: 11.5, color: 'var(--gray2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{cnpjFmt(value.cnpj_cpf)}</span>}
            </div>
            <button type="button" onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={handleOpen}
              onClick={handleOpen}
              placeholder="Buscar por nome ou CNPJ…"
              className="form-input"
              style={{ paddingLeft: 30 }}
            />
          </div>
        )}

        {open && !value && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--white)',
            border: '1.5px solid var(--gray3)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 200, maxHeight: 220, overflowY: 'auto' }}>
            {loading && <div className="dux-spinner-row" style={{ padding: '14px' }}><span className="dux-spinner sm" /></div>}
            {!loading && filtered.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--gray2)', padding: '12px 14px', margin: 0 }}>Nenhum cedente encontrado</p>}
            {!loading && filtered.map(c => (
              <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); select(c); }}
                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{c.nome}</span>
                {c.cnpj_cpf && <span style={{ fontSize: 11.5, color: 'var(--gray2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{cnpjFmt(c.cnpj_cpf)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SacadoSearch ──────────────────────────────────────
interface SacadoOpt { id: string; razao_social: string | null; cnpj_cpf: string | null }

function SacadoSearch({ token, value, onChange }: {
  token: string;
  value: SacadoOpt | null;
  onChange: (s: SacadoOpt | null) => void;
}) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SacadoOpt[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { onSessionExpired } = useAuth();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || options.length > 0) return;
    setLoading(true);
    fetch('/api/admin-data?action=list_sacados', { headers: { 'x-admin-session': token } })
      .then(r => { if (r.status === 401) { onSessionExpired(); throw new Error('401'); } return r.json(); })
      .then(d => setOptions((d.sacados ?? []).map((c: any) => ({ id: String(c.id), razao_social: c.razao_social ?? null, cnpj_cpf: c.cnpj_cpf ?? null }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, options.length, token, onSessionExpired]);

  const cnpjFmt = (v: string | null) => {
    if (!v) return '';
    const d = v.replace(/\D/g, '');
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return v;
  };

  const qDigits = query.replace(/\D/g, '');
  const filtered = query.trim()
    ? options.filter(o =>
        (o.razao_social ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (qDigits.length > 0 && (o.cnpj_cpf ?? '').replace(/\D/g, '').includes(qDigits))
      )
    : options;
  const exactCnpj = options.find(o => (o.cnpj_cpf ?? '').replace(/\D/g, '') === qDigits);
  const canAddNew = qDigits.length === 14 && !exactCnpj;

  function handleOpen() { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }
  function select(s: SacadoOpt) { onChange(s); setOpen(false); setQuery(''); }
  function clear() { onChange(null); setQuery(''); }

  async function addNew() {
    setAdding(true);
    try {
      // Busca a razão social na Receita (1x) e cria/vincula o sacado no cadastro
      let razao = '';
      try {
        const rc = await fetch(`/api/cnpj-lookup?cnpj=${qDigits}`);
        if (rc.ok) { const d = await rc.json(); razao = d.razao_social ?? d.nome_fantasia ?? d.nome ?? ''; }
      } catch { /* segue sem razão - backend salva o que der */ }
      const res = await fetch('/api/admin-data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'create_sacado', cnpj: qDigits, razao_social: razao }),
      });
      const data = await res.json();
      if (!res.ok || !data?.sacado) { toast('error', 'Erro ao adicionar sacado', data?.error); return; }
      const novo: SacadoOpt = { id: String(data.sacado.id), razao_social: data.sacado.razao_social ?? razao, cnpj_cpf: data.sacado.cnpj_cpf ?? qDigits };
      setOptions(prev => [novo, ...prev.filter(o => o.id !== novo.id)]);
      select(novo);
    } catch (e: any) {
      toast('error', 'Erro ao adicionar sacado', e?.message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">Sacado *</label>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {value ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 38, padding: '0 11px',
            borderRadius: 8, border: '1.5px solid var(--yellow)', background: 'var(--white)', boxShadow: '0 0 0 3px rgba(169,224,62,0.12)' }}>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, overflow: 'hidden' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{value.razao_social ?? cnpjFmt(value.cnpj_cpf)}</span>
              {value.cnpj_cpf && value.razao_social && <span style={{ fontSize: 11.5, color: 'var(--gray2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{cnpjFmt(value.cnpj_cpf)}</span>}
            </div>
            <button type="button" onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onFocus={handleOpen} onClick={handleOpen}
              placeholder="Buscar por razão social ou CNPJ…" className="form-input" style={{ paddingLeft: 30 }} />
          </div>
        )}

        {open && !value && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, background: 'var(--white)',
            border: '1.5px solid var(--gray3)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, maxHeight: 240, overflowY: 'auto' }}>
            {loading && <div className="dux-spinner-row" style={{ padding: '14px' }}><span className="dux-spinner sm" /></div>}
            {!loading && filtered.map(c => (
              <button key={c.id} type="button" onMouseDown={e => { e.preventDefault(); select(c); }}
                style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 6 }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 1 }}>{c.razao_social ?? cnpjFmt(c.cnpj_cpf)}</span>
                {c.cnpj_cpf && <span style={{ fontSize: 11.5, color: 'var(--gray2)', whiteSpace: 'nowrap', flexShrink: 0 }}>{cnpjFmt(c.cnpj_cpf)}</span>}
              </button>
            ))}
            {!loading && canAddNew && (
              <button type="button" onMouseDown={e => { e.preventDefault(); addNew(); }} disabled={adding}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: '1px solid var(--gray3)', background: 'var(--yd)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--black)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  {adding ? <IconSpinner size={13} /> : <IconPlus size={13} />}
                  {adding ? 'Adicionando…' : `Adicionar sacado ${cnpjFmt(qDigits)} (busca na Receita)`}
                </span>
              </button>
            )}
            {!loading && filtered.length === 0 && !canAddNew && (
              <p style={{ fontSize: 12.5, color: 'var(--gray2)', padding: '12px 14px', margin: 0 }}>
                {qDigits.length > 0 && qDigits.length < 14 ? 'Digite o CNPJ completo para adicionar um novo sacado.' : 'Nenhum sacado encontrado.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Create Modal ─────────────────────────────────────
const MAX_FILE_MB = 3;

function CreateModal({ statuses, token, onClose, onCreated }: {
  statuses: StatusConfig[];
  token: string;
  onClose: () => void;
  onCreated: (sub: Submission) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();

  const [selectedCedente, setSelectedCedente] = useState<CedenteOpt | null>(null);
  const [selectedSacado, setSelectedSacado] = useState<SacadoOpt | null>(null);
  const [isParcelas, setIsParcelas] = useState(false);
  const [valor, setValor] = useState('');
  const [prazoLimite, setPrazoLimite] = useState('');
  const [numParcelas, setNumParcelas] = useState(1);
  const [parcelas, setParcelas] = useState<Array<{ valor: string; valorNumerico: number; vencimento: string }>>(
    [{ valor: '', valorNumerico: 0, vencimento: '' }]
  );
  // Parcelas iguais (distribuídas pelo sistema) × variáveis (manual)
  const [parcelaMode, setParcelaMode] = useState<'iguais' | 'variaveis'>('iguais');
  const [totalParcelado, setTotalParcelado] = useState('');
  const [periodicidade, setPeriodicidade] = useState<'mensal' | 'quinzenal' | 'bimestral' | 'personalizada'>('mensal');
  const [intervaloDias, setIntervaloDias] = useState(30);
  const [primeiroVenc, setPrimeiroVenc] = useState('');
  const [fimType, setFimType] = useState<number | ''>('');
  // Padrão = etapa de entrada configurada (Configurações → Etapas); sem marcação, a primeira
  const [statusId, setStatusId] = useState<number | ''>(
    statuses.find(s => s.is_entrada)?.id ?? statuses[0]?.id ?? ''
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [savingLabel, setSavingLabel] = useState('Criando…');

  // Em "parcelas iguais", o sistema distribui o total automaticamente
  useEffect(() => {
    if (!isParcelas || parcelaMode !== 'iguais') return;
    setParcelas(distribuirParcelas(parseCurrencyBRL(totalParcelado), numParcelas, primeiroVenc, periodicidade, intervaloDias));
  }, [isParcelas, parcelaMode, totalParcelado, numParcelas, primeiroVenc, periodicidade, intervaloDias]);

  function changeNumParcelas(delta: number) {
    const next = Math.max(1, Math.min(12, numParcelas + delta));
    setNumParcelas(next);
    setParcelas(prev => {
      if (next > prev.length)
        return [...prev, ...Array.from({ length: next - prev.length }, () => ({ valor: '', valorNumerico: 0, vencimento: '' }))];
      return prev.slice(0, next);
    });
  }

  function updateParcelaValor(i: number, raw: string) {
    const masked = maskCurrencyBRL(raw);
    setParcelas(prev => { const n = [...prev]; n[i] = { ...n[i], valor: masked, valorNumerico: parseCurrencyBRL(masked) }; return n; });
  }

  function updateParcelaVencimento(i: number, v: string) {
    setParcelas(prev => { const n = [...prev]; n[i] = { ...n[i], vencimento: v }; return n; });
  }

  function addFiles(incoming: File[]) {
    setFileError('');
    const oversized = incoming.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized.length > 0) setFileError(`Arquivo(s) maiores que ${MAX_FILE_MB}MB foram ignorados.`);
    const valid = incoming.filter(f => f.size <= MAX_FILE_MB * 1024 * 1024);
    setPendingFiles(prev => [...prev, ...valid]);
  }


  async function handleCreate() {
    if (!selectedCedente) { toast('error', 'Selecione o cedente'); return; }
    const nomeContratado = selectedCedente.nome;
    const cnpjContratado = selectedCedente.cnpj_cpf ?? '';
    setSaving(true);
    try {
      let finalValor = valor || null;
      let finalValorNumerico: number | null = null;
      let finalPrazo: string | null = prazoLimite || null;
      let finalParcelas: Array<{ valor: string; valorNumerico: number; vencimento: string }> | null = null;

      if (isParcelas) {
        const total = parcelas.reduce((acc, p) => acc + p.valorNumerico, 0);
        finalValor = total > 0 ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;
        finalValorNumerico = total || null;
        finalParcelas = parcelas;
        finalPrazo = null;
      } else {
        finalValorNumerico = parseCurrencyBRL(valor) || null;
      }

      setSavingLabel('Criando…');
      const res = await api('', 'POST', {
        action: 'create_submission',
        cedente_id: selectedCedente.id,
        nome_contratado: nomeContratado || null,
        cnpj_contratado: cnpjContratado || null,
        sacado_id: selectedSacado?.id ?? null,
        nome_sacado: selectedSacado?.razao_social ?? null,
        cnpj_sacado: selectedSacado?.cnpj_cpf ?? null,
        valor: finalValor,
        valor_numerico: finalValorNumerico,
        prazo_limite: finalPrazo,
        parcelas: finalParcelas,
        fim_type: fimType !== '' ? Number(fimType) : null,
        status_id: statusId !== '' ? Number(statusId) : null,
      });
      if (res?.error) throw new Error(res.error);
      if (!res?.submission?.id) throw new Error('Resposta inválida do servidor (sessão pode ter expirado). Faça login novamente.');

      const newId: string = res.submission.id;
      let enviados = 0;
      const falhas: string[] = [];
      if (pendingFiles.length > 0) {
        setSavingLabel(`Enviando anexos…`);
        for (const file of pendingFiles) {
          try {
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            const fileRes = await fetch('/api/submit-file', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                solicitacaoId: newId,
                arquivo: { categoria: 'Documento', nome: file.name, tipo: file.type, tamanho: file.size, base64 },
              }),
            });
            if (fileRes.ok) enviados++;
            else falhas.push(file.name);
          } catch {
            falhas.push(file.name);
          }
        }
      }

      if (falhas.length > 0) {
        toast('error', `${falhas.length} anexo(s) não enviado(s)`, `Verifique o tamanho (máx. 5 MB): ${falhas.join(', ')}`);
      } else {
        toast('success', 'Solicitação criada');
      }
      const sub = res.submission as Submission;
      onCreated({ ...sub, arquivo_count: enviados });
    } catch (e: any) {
      console.error('[create_submission]', e);
      toast('error', 'Erro ao criar solicitação', e?.message ?? 'Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  const totalParcelas = parcelas.reduce((acc, p) => acc + p.valorNumerico, 0);

  return createPortal(
    <div className="admin-modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>

        <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nova solicitação</p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>Criar manualmente</h3>
            </div>
            <button className="admin-modal-close" aria-label="Fechar" onClick={onClose}><IconX size={16} /></button>
          </div>
        </div>

        <div className="admin-modal-body">

          {/* Cedente */}
          <section>
            <p className="admin-section-title">Cedente (Contratado)</p>
            <CedenteSearch token={token} value={selectedCedente} onChange={setSelectedCedente} />
          </section>

          {/* Sacado */}
          <section>
            <p className="admin-section-title">Sacado (Contratante)</p>
            <SacadoSearch token={token} value={selectedSacado} onChange={setSelectedSacado} />
          </section>

          {/* Dados da operação */}
          <section>
            <p className="admin-section-title">Dados da operação</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'var(--gray3)', borderRadius: 10, padding: 4 }}>
              {(['único', 'parcelado'] as const).map(mode => {
                const active = mode === 'parcelado' ? isParcelas : !isParcelas;
                return (
                  <button key={mode} type="button" onClick={() => setIsParcelas(mode === 'parcelado')}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: 'pointer', border: 'none', background: active ? 'var(--white)' : 'transparent', color: active ? 'var(--black)' : 'var(--gray2)', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.15s' }}>
                    {mode === 'único' ? 'Pagamento único' : 'Parcelado'}
                  </button>
                );
              })}
            </div>

            {!isParcelas ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <EditField label="Valor" value={valor} onChange={v => setValor(maskCurrencyBRL(v))} />
                <div className="form-group">
                  <label className="form-label">Vencimento</label>
                  <DatePicker value={prazoLimite} onChange={setPrazoLimite} compact />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Modo: iguais (distribui) × variáveis (manual) */}
                <SegSwitch
                  valor={parcelaMode}
                  onChange={setParcelaMode}
                  full
                  opcoes={[
                    { valor: 'iguais', label: 'Parcelas iguais' },
                    { valor: 'variaveis', label: 'Parcelas variáveis' },
                  ]}
                />

                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <p className="admin-info-label">Número de parcelas</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    <button type="button" onClick={() => changeNumParcelas(-1)} disabled={numParcelas <= 1}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{numParcelas}</span>
                    <button type="button" onClick={() => changeNumParcelas(1)} disabled={numParcelas >= 12}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>

                {parcelaMode === 'iguais' ? (
                  <>
                    <EditField label="Valor total" value={totalParcelado} onChange={v => setTotalParcelado(maskCurrencyBRL(v))} />
                    <div className="form-group">
                      <label className="form-label">Periodicidade</label>
                      <FormSelect
                        value={periodicidade}
                        onChange={v => setPeriodicidade(v as any)}
                        options={[
                          { value: 'mensal', label: 'Mensal' },
                          { value: 'quinzenal', label: 'Quinzenal' },
                          { value: 'bimestral', label: 'Bimestral' },
                          { value: 'personalizada', label: 'Personalizada (dias)' },
                        ]}
                      />
                    </div>
                    {periodicidade === 'personalizada' && (
                      <div className="form-group">
                        <label className="form-label">Intervalo entre parcelas (dias)</label>
                        <input type="number" min={1} value={intervaloDias} onChange={e => setIntervaloDias(Math.max(1, Number(e.target.value) || 1))} className="form-input" />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Primeiro vencimento</label>
                      <DatePicker value={primeiroVenc} onChange={setPrimeiroVenc} compact />
                    </div>
                    {parcelas.length > 0 && parcelas[0].valorNumerico > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <p style={{ fontSize: 11, color: 'var(--gray2)', margin: 0, lineHeight: 1.35 }}>
                          As datas seguem a periodicidade escolhida - você pode ajustar qualquer vencimento manualmente.
                        </p>
                        {parcelas.map((p, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray2)', minWidth: 22 }}>{i + 1}ª</span>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 96 }}>{p.valor || '-'}</span>
                            <div style={{ flex: 1 }}>
                              <DatePicker value={p.vencimento} onChange={v => updateParcelaVencimento(i, v)} compact />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  parcelas.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray2)', paddingBottom: 8, minWidth: 22 }}>{i + 1}ª</span>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Valor</label>
                        <input type="text" inputMode="numeric" value={p.valor} onChange={e => updateParcelaValor(i, e.target.value)} className="form-input" />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Vencimento</label>
                        <DatePicker value={p.vencimento} onChange={v => updateParcelaVencimento(i, v)} compact />
                      </div>
                    </div>
                  ))
                )}
                {totalParcelas > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--gray3)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}>Total</span>
                    <strong style={{ fontSize: 12 }}>{totalParcelas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  </div>
                )}
              </div>
            )}

            <div className="form-group" style={{ marginTop: 10 }}>
              <label className="form-label">Fluxo de pagamento</label>
              <FormSelect
                value={String(fimType)}
                onChange={v => setFimType(v === '' ? '' : Number(v))}
                options={FIM_SELECT_OPTIONS}
              />
            </div>
          </section>

          {/* Status inicial */}
          <section>
            <p className="admin-section-title">Status inicial</p>
            <FormSelect
              value={String(statusId)}
              onChange={v => setStatusId(v === '' ? '' : Number(v))}
              options={statuses.map(s => ({ value: String(s.id), label: s.nome }))}
              placeholder="- Sem status -"
            />
          </section>

          {/* Anexos */}
          <section>
            <p className="admin-section-title">Anexos</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.zip"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = ''; }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1.5px dashed var(--gray3)', background: 'none', cursor: 'pointer', color: 'var(--gray2)', width: '100%', justifyContent: 'center', transition: 'background 0.15s, border-color 0.15s, color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(169,224,62,0.08)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--yellow)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--black)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--gray3)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--gray2)'; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Adicionar arquivo · PDF, JPG, PNG ou ZIP · máx. {MAX_FILE_MB}MB
            </button>
            {fileError && <p style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{fileError}</p>}
            {pendingFiles.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {pendingFiles.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--gray3)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--black)' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--gray2)', flexShrink: 0 }}>
                      {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)} KB` : `${(f.size / (1024 * 1024)).toFixed(1)} MB`}
                    </span>
                    <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray3)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button type="button" onClick={onClose} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', color: 'var(--gray)' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleCreate} disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: 'var(--yellow)', color: '#000', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? savingLabel : 'Criar solicitação'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ── Edit Modal ────────────────────────────────────────
const DECISION_LABELS_EDIT: Record<string, string> = {
  node5: 'Contrato assinado?',
  nodeB: 'Conta escrow?',
  nodeA: 'Nota emitida?',
  nodeA1: 'Anuência do sacado?',
  nodeA2: 'Escrow na nota + aceite do sacado?',
  nodeConvergente: 'Mudança de domicílio bancário?',
};

function EditModal({
  detail,
  token,
  onClose,
  onSaved,
}: {
  detail: SubmissionDetail;
  token: string;
  onClose: () => void;
  onSaved: (fields: Partial<Submission>) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const s = detail.submission;

  const initialParcelas: Array<{ valor: string; valorNumerico: number; vencimento: string }> | null = (() => {
    try { return s.parcelas ? JSON.parse(String(s.parcelas)) : null; } catch { return null; }
  })();
  const initialDecisions: Record<string, boolean> = (() => {
    try { return s.decisions ? JSON.parse(String(s.decisions)) : {}; } catch { return {}; }
  })();
  const hasParcelas = initialParcelas && initialParcelas.length > 1;

  // Cedente e sacado são selecionados do cadastro (fonte da verdade) - razão social/CNPJ vêm da FK
  const [selectedCedente, setSelectedCedente] = useState<CedenteOpt | null>(
    s.cedente_id ? { id: s.cedente_id, nome: s.nome_contratado ?? '', cnpj_cpf: s.cnpj_contratado ?? null } : null
  );
  const [selectedSacado, setSelectedSacado] = useState<SacadoOpt | null>(
    s.sacado_id ? { id: String(s.sacado_id), razao_social: s.nome_sacado ?? null, cnpj_cpf: s.cnpj_sacado ?? null } : null
  );

  const [isParcelas, setIsParcelas] = useState(!!hasParcelas);
  const [valor, setValor] = useState(s.valor ?? '');
  const [prazoLimite, setPrazoLimite] = useState(s.prazo_limite ?? '');
  const [numParcelas, setNumParcelas] = useState(hasParcelas ? initialParcelas!.length : 1);
  const [parcelas, setParcelas] = useState<Array<{ valor: string; valorNumerico: number; vencimento: string }>>(
    hasParcelas ? initialParcelas! : [{ valor: '', valorNumerico: 0, vencimento: '' }]
  );

  const [decisions, setDecisions] = useState<Record<string, boolean>>(initialDecisions);
  const [fimType, setFimType] = useState<number | string>(s.fim_type ?? '');
  const [saving, setSaving] = useState(false);

  function changeNumParcelas(delta: number) {
    const next = Math.max(1, Math.min(12, numParcelas + delta));
    setNumParcelas(next);
    setParcelas(prev => {
      if (next > prev.length)
        return [...prev, ...Array.from({ length: next - prev.length }, () => ({ valor: '', valorNumerico: 0, vencimento: '' }))];
      return prev.slice(0, next);
    });
  }

  function updateParcelaValor(i: number, raw: string) {
    const masked = maskCurrencyBRL(raw);
    setParcelas(prev => { const n = [...prev]; n[i] = { ...n[i], valor: masked, valorNumerico: parseCurrencyBRL(masked) }; return n; });
  }

  function updateParcelaVencimento(i: number, v: string) {
    setParcelas(prev => { const n = [...prev]; n[i] = { ...n[i], vencimento: v }; return n; });
  }

  function setDecisionVal(key: string, val: boolean | undefined) {
    setDecisions(prev => {
      const n = { ...prev };
      if (val === undefined) delete n[key];
      else n[key] = val;
      return n;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      let finalValor = valor || null;
      let finalValorNumerico: number | null = null;
      let finalPrazo: string | null = prazoLimite || null;
      let finalParcelas: Array<{ valor: string; valorNumerico: number; vencimento: string }> | null = null;

      if (isParcelas) {
        const total = parcelas.reduce((acc, p) => acc + p.valorNumerico, 0);
        finalValor = total > 0 ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : (valor || null);
        finalValorNumerico = total || null;
        finalParcelas = parcelas;
        finalPrazo = null;
      } else {
        finalValorNumerico = parseCurrencyBRL(valor) || null;
      }

      const fields = {
        cedente_id: selectedCedente ? String(selectedCedente.id) : null,
        nome_contratado: selectedCedente?.nome || null,
        cnpj_contratado: (selectedCedente?.cnpj_cpf ?? '').replace(/\D/g, '') || null,
        situacao_contratado: null,
        sacado_id: selectedSacado ? String(selectedSacado.id) : null,
        nome_sacado: selectedSacado?.razao_social || null,
        cnpj_sacado: (selectedSacado?.cnpj_cpf ?? '').replace(/\D/g, '') || null,
        situacao_sacado: null,
        valor: finalValor,
        valor_numerico: finalValorNumerico,
        prazo_limite: finalPrazo,
        parcelas: finalParcelas,
        decisions: Object.keys(decisions).length > 0 ? decisions : null,
        fim_type: fimType !== '' ? Number(fimType) : null,
      };

      const res = await api('', 'POST', { action: 'update_submission', id: s.id, ...fields });
      if (res?.error) throw new Error(res.error);
      toast('success', 'Solicitação atualizada');
      onSaved({
        nome_contratado: fields.nome_contratado,
        cnpj_contratado: fields.cnpj_contratado,
        nome_sacado: fields.nome_sacado,
        cnpj_sacado: fields.cnpj_sacado,
        cedente_id: fields.cedente_id,
        sacado_id: fields.sacado_id,
        valor: fields.valor,
        prazo_limite: fields.prazo_limite ?? undefined,
        fim_type: fields.fim_type,
      });
    } catch {
      toast('error', 'Erro ao salvar alterações');
    } finally {
      setSaving(false);
    }
  }

  const totalParcelas = parcelas.reduce((acc, p) => acc + p.valorNumerico, 0);

  return createPortal(
    <div className="admin-modal-overlay" style={{ zIndex: 1050 }} onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>

        <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Editando</p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{s.nome_contratado ?? '-'}</h3>
            </div>
            <button className="admin-modal-close" aria-label="Fechar" onClick={onClose}><IconX size={16} /></button>
          </div>
        </div>

        <div className="admin-modal-body">

          {/* Cedente */}
          <section>
            <p className="admin-section-title">Cedente (Contratado)</p>
            <CedenteSearch token={token} value={selectedCedente} onChange={setSelectedCedente} />
            <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 6 }}>Razão social e CNPJ vêm do cadastro do cedente.</p>
          </section>

          {/* Sacado */}
          <section>
            <p className="admin-section-title">Sacado (Contratante)</p>
            <SacadoSearch token={token} value={selectedSacado} onChange={setSelectedSacado} />
            <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 6 }}>Selecione um sacado do cadastro ou adicione pelo CNPJ.</p>
          </section>

          {/* Dados da operação */}
          <section>
            <p className="admin-section-title">Dados da operação</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, background: 'var(--gray3)', borderRadius: 10, padding: 4 }}>
              {(['único', 'parcelado'] as const).map(mode => {
                const active = mode === 'parcelado' ? isParcelas : !isParcelas;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setIsParcelas(mode === 'parcelado')}
                    style={{
                      flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 700,
                      borderRadius: 7, cursor: 'pointer', border: 'none',
                      background: active ? 'var(--white)' : 'transparent',
                      color: active ? 'var(--black)' : 'var(--gray2)',
                      boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {mode === 'único' ? 'Pagamento único' : 'Parcelado'}
                  </button>
                );
              })}
            </div>

            {!isParcelas ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <EditField label="Valor" value={valor} onChange={v => setValor(maskCurrencyBRL(v))} />
                <div className="form-group">
                  <label className="form-label">Vencimento</label>
                  <DatePicker value={prazoLimite} onChange={setPrazoLimite} compact />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <p className="admin-info-label">Número de parcelas</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    <button type="button" onClick={() => changeNumParcelas(-1)} disabled={numParcelas <= 1}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <span style={{ fontSize: 14, fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{numParcelas}</span>
                    <button type="button" onClick={() => changeNumParcelas(1)} disabled={numParcelas >= 12}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  </div>
                </div>
                {parcelas.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray2)', paddingBottom: 8, minWidth: 22 }}>{i + 1}ª</span>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Valor</label>
                      <input type="text" inputMode="numeric" value={p.valor} onChange={e => updateParcelaValor(i, e.target.value)} className="form-input" />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="form-label">Vencimento</label>
                      <DatePicker value={p.vencimento} onChange={v => updateParcelaVencimento(i, v)} compact />
                    </div>
                  </div>
                ))}
                {totalParcelas > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--gray3)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}>Total</span>
                    <strong style={{ fontSize: 12 }}>{totalParcelas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Avaliação */}
          <section>
            <p className="admin-section-title">Avaliação da operação</p>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Fluxo de pagamento</label>
              <FormSelect
                value={String(fimType)}
                onChange={v => setFimType(v === '' ? '' : Number(v))}
                options={FIM_SELECT_OPTIONS}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {Object.entries(DECISION_LABELS_EDIT).map(([key, label]) => {
                const current = key in decisions ? decisions[key] : undefined;
                const isSim = current === true;
                const isNao = current === false;
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 10,
                    border: `1.5px solid ${isSim ? '#BBF7D0' : isNao ? '#FECACA' : 'var(--gray3)'}`,
                    background: isSim ? '#F0FDF4' : isNao ? '#FEF2F2' : 'var(--white)',
                    transition: 'all 0.15s',
                  }}>
                    {/* indicator dot */}
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: isSim ? '#22C55E' : isNao ? '#EF4444' : 'var(--gray3)',
                      transition: 'background 0.15s',
                    }} />
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: isSim ? '#166534' : isNao ? '#991B1B' : 'var(--gray)' }}>
                      {label}
                    </span>
                    {/* segmented control */}
                    <div style={{ display: 'flex', background: 'var(--gray3)', borderRadius: 8, padding: 3, gap: 2, flexShrink: 0 }}>
                      {([{ val: true, label: 'Sim' }, { val: false, label: 'Não' }] as const).map(opt => {
                        const active = current === opt.val;
                        return (
                          <button
                            key={String(opt.val)}
                            type="button"
                            onClick={() => setDecisionVal(key, active ? undefined : opt.val)}
                            style={{
                              padding: '3px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                              fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                              background: active ? (opt.val ? '#22C55E' : '#EF4444') : 'transparent',
                              color: active ? '#fff' : 'var(--gray2)',
                              boxShadow: active ? '0 1px 4px rgba(0,0,0,0.15)' : 'none',
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray3)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1.5px solid var(--gray3)', background: 'none', cursor: 'pointer', color: 'var(--gray)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', background: 'var(--yellow)', color: '#000', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ── Detail Panel ─────────────────────────────────────
export function DetailPanel({
  id, token, onClose, onMoved, onDelete, onEdited, prefetchCache, statuses = [],
}: {
  id: string; token: string; onClose: () => void; onMoved: (id: string, statusId: number) => void;
  onDelete?: (id: string) => void;
  onEdited?: (id: string, fields: Partial<Submission>) => void;
  prefetchCache?: React.RefObject<Map<string, any>>;
  statuses?: StatusConfig[];
}) {
  const api = useApi(token);
  const { toast } = useToast();
  // Quem está logado: usado para assinar o evento otimista antes de o servidor responder.
  const { usuario } = useAuth();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  // Relatórios DEPS salvos (por alvo) desta solicitação - para o link no balão da parte.
  const [depsSaved, setDepsSaved] = useState<Record<string, { nome: string | null; documento: string | null; norm: any; raw?: any; criado_em?: string } >>({});
  const [depsProduto, setDepsProduto] = useState<string>(PRODUTOS_DEPS[0].id);
  const [depsBusy, setDepsBusy] = useState<'ced' | 'sac' | null>(null);
  // Marca, por alvo, se o último relatório veio reaproveitado do histórico da DEPS (sem custo).
  const [depsReused, setDepsReused] = useState<Record<string, boolean>>({});
  // Preview embutido do relatório DEPS (modal).
  const [depsPreview, setDepsPreview] = useState<{ nome: string; url: string } | null>(null);
  const [depsConfirm, setDepsConfirm] = useState<'ced' | 'sac' | null>(null);
  // Consulta reaproveitável encontrada: pergunta ao usuário se reaproveita (grátis) ou
  // gera nova (com custo), mostrando a data da última consulta daquele CNPJ.
  const [depsReuse, setDepsReuse] = useState<{ alvo: 'ced' | 'sac'; dataConsulta: string; payload: any } | null>(null);
  const [movingTo, setMovingTo] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [pipelineLocalNames, setPipelineLocalNames] = useState<Record<number, string>>({});
  const [pipelineEditingId, setPipelineEditingId] = useState<number | null>(null);
  const [pipelineEditValue, setPipelineEditValue] = useState('');
  const [pipelinePreviewState, setPipelinePreviewState] = useState<PreviewState | null>(null);
  const pipelineEditRef = useRef<HTMLInputElement>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmNome, setDeleteConfirmNome] = useState('');
  const [deleteConfirmIsForm, setDeleteConfirmIsForm] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNome, setLinkNome] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<number | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [deleteSubmissionConfirm, setDeleteSubmissionConfirm] = useState(false);
  // Feedback visual do botão "copiar link de compartilhamento"
  const [copied, setCopied] = useState(false);
  // Seção "Avaliação da operação" retrátil - recolhida por padrão.
  const [showAvaliacao, setShowAvaliacao] = useState(false);
  // Etapa de conversão pendente: exige registrar a data de execução no modal antes de mover
  const [pendingConversion, setPendingConversion] = useState<number | null>(null);
  // Etapa que exige pendências: statusId aguardando registro das pendências antes de mover
  const [pendingPendencia, setPendingPendencia] = useState<number | null>(null);
  const [savingPendMove, setSavingPendMove] = useState(false);
  // Confirmar mover p/ conversão após registrar a data de execução direto
  const [pendingAutoConv, setPendingAutoConv] = useState<number | null>(null);
  // Confirmar sair da conversão (limpa a data de execução registrada)
  const [pendingExecClear, setPendingExecClear] = useState<number | null>(null);


  async function load() {
    const data = await api(`?action=detail&id=${id}`);
    setDetail(data);
    // Relatórios DEPS salvos desta solicitação (best-effort).
    api(`?action=deps_by_solicitacao&solicitacao_id=${id}`).then(r => setDepsSaved(r?.deps ?? {})).catch(() => {});
  }

  // Link do relatório no portal da DEPS (consulta compartilhada: público, sem
  // login). Vem no payload bruto da consulta como `linkCompartilhamento`.
  // Consultas anteriores à coluna raw_json não têm o link - nesse caso cai no
  // relatório resumido montado a partir do normalizado.
  function depsPortalLink(alvo: 'ced' | 'sac'): string | null {
    return depsLinkDoRaw(depsSaved[alvo]?.raw);
  }

  function depsNome(alvo: 'ced' | 'sac'): string {
    return depsSaved[alvo]?.nome ?? (alvo === 'ced' ? 'Cedente' : 'Sacado');
  }

  // Abre o relatório do portal no preview embutido. Sem link (consulta antiga),
  // cai no relatório resumido em nova aba.
  function openDepsReport(alvo: 'ced' | 'sac') {
    const url = depsPortalLink(alvo);
    if (url) { setDepsPreview({ nome: depsNome(alvo), url }); return; }
    openDepsResumoNovaAba(alvo);
  }

  // Atalho do balão da parte: vai direto para a nova aba, sem passar pelo preview.
  function openDepsReportTab(alvo: 'ced' | 'sac') {
    const url = depsPortalLink(alvo);
    if (url) { window.open(url, '_blank', 'noopener'); return; }
    openDepsResumoNovaAba(alvo);
  }

  // Fallback para consultas sem link do portal: relatório resumido a partir do
  // normalizado, servido por blob URL (sobrevive a reload e imprime direito).
  function openDepsResumoNovaAba(alvo: 'ced' | 'sac') {
    const d = depsSaved[alvo];
    if (!d?.norm) { toast('error', 'Relatório DEPS não disponível'); return; }
    const html = buildDepsReportHTML(alvo, {
      norm: d.norm, nome: d.nome ?? '', documento: d.documento ?? '',
      linkPortal: depsLinkDoRaw(d.raw), dataConsulta: depsDataConsulta(d.raw),
    });
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const w = window.open(url, '_blank');
    if (!w) { URL.revokeObjectURL(url); toast('error', 'Bloqueado pelo navegador', 'Libere pop-ups para abrir o relatório.'); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast('info', 'Relatório resumido', 'Esta consulta é anterior ao link do portal. Atualize a DEPS para ver o relatório completo.');
  }

  // Persiste um resultado DEPS já obtido e atualiza o balão na hora.
  async function saveDeps(alvo: 'ced' | 'sac', payload: { norm: any; nome: string; doc: string; raw: any; reutilizou: boolean }) {
    const { norm, nome, doc, raw, reutilizou } = payload;
    const saveRes = await api('', 'POST', { action: 'save_solicitacao_deps', solicitacao_id: id, alvo, nome, documento: doc, norm, raw });
    if (saveRes?.error) { toast('error', 'Não foi possível salvar o relatório DEPS', saveRes.error); return; }
    // Atualiza o balão imediatamente (sem depender da releitura, que pode ter lag).
    setDepsSaved(prev => ({ ...prev, [alvo]: { nome, documento: doc, norm, raw, criado_em: new Date().toISOString() } }));
    setDepsReused(prev => ({ ...prev, [alvo]: !!reutilizou }));
    toast('success', `DEPS ${alvo === 'ced' ? 'cedente' : 'sacado'} (${reutilizou ? 'reaproveitada' : 'nova'})`, norm.resumo || 'Relatório atualizado.');
    api(`?action=deps_by_solicitacao&solicitacao_id=${id}`)
      .then(r => { if (r?.deps && Object.keys(r.deps).length) setDepsSaved(prev => ({ ...prev, ...r.deps })); })
      .catch(() => {});
  }

  // Gera/atualiza a DEPS de uma parte direto do card. forcarNova=false primeiro tenta
  // reaproveitar (grátis): se houver consulta válida, pergunta ao usuário (mostrando a
  // data) se reaproveita ou gera nova (paga); se não houver, sinaliza needsNew.
  async function gerarDeps(alvo: 'ced' | 'sac', forcarNova: boolean) {
    const s0 = detail?.submission;
    const doc = String((alvo === 'ced' ? s0?.cnpj_contratado : s0?.cnpj_sacado) ?? '').replace(/\D/g, '');
    if (doc.length !== 11 && doc.length !== 14) { toast('error', 'CNPJ/CPF da parte não disponível'); return; }
    setDepsConfirm(null);
    setDepsReuse(null);
    setDepsBusy(alvo);
    try {
      const res = await fetch('/api/deps-consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ documento: doc, identificadorProduto: depsProduto, reutilizarDadosExistentes: !forcarNova }),
      });
      const data = await res.json().catch(() => null);
      if (data?.needsNew) { setDepsBusy(null); setDepsConfirm(alvo); return; } // sem recente → confirmar consulta paga
      if (!res.ok || !data?.success) {
        toast('error', 'Falha na consulta DEPS', data?.detalhe?.message ?? data?.error ?? `Erro ${res.status}`);
        return;
      }
      const { normalizeDepsMix } = await import('../lib/depsParser');
      const norm = normalizeDepsMix(data.resultado);
      const nome = norm.empresa?.razao ?? String((alvo === 'ced' ? s0?.nome_contratado : s0?.nome_sacado) ?? '');
      const payload = { norm, nome, doc, raw: data.resultado, reutilizou: !!data.reutilizou };
      // Reaproveitável (não forçamos nova): pergunta antes de gravar, mostrando a data da consulta.
      if (!forcarNova && data.reutilizou) {
        const dataConsulta = depsDataConsulta(data.resultado);
        setDepsBusy(null);
        setDepsReuse({ alvo, dataConsulta, payload });
        return;
      }
      // Consulta nova (paga) → grava direto.
      await saveDeps(alvo, payload);
    } catch (e: any) {
      toast('error', 'Erro na consulta DEPS', e?.message);
    } finally {
      setDepsBusy(null);
    }
  }

  // Painel de DEPS dentro do balão da parte (ver relatório salvo + gerar/atualizar).
  function depsControl(alvo: 'ced' | 'sac') {
    const d = depsSaved[alvo];
    const busy = depsBusy === alvo;
    const score = d?.norm?.deps?.score ?? '';
    const risco = d?.norm?.deps?.class ?? '';
    // Data real da consulta na DEPS (do payload); cai para a data de gravação se não houver.
    const dataConsulta = d?.raw ? depsDataConsulta(d.raw) : '';
    const dateStr = dataConsulta || (d?.criado_em ? new Date(d.criado_em).toLocaleDateString('pt-BR') : '');
    return (
      <DepsPanel
        score={score}
        sub={[risco && `risco ${risco}`, dateStr].filter(Boolean).join(' · ')}
        temRelatorio={!!d}
        reutilizou={!!depsReused[alvo]}
        busy={busy}
        onVer={() => openDepsReport(alvo)}
        onNovaAba={() => openDepsReportTab(alvo)}
        onAtualizar={() => setDepsConfirm(alvo)}
        onGerar={() => gerarDeps(alvo, false)}
        produtoSelect={<DepsProdutoSelect value={depsProduto} onChange={setDepsProduto} disabled={busy} />}
      />
    );
  }

  // Copia um link direto para este card (?solicitacao=<id>) - compartilhável com
  // qualquer pessoa que tenha acesso à plataforma. Feedback visual + toast.
  async function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?solicitacao=${id}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopied(true);
      toast('success', 'Link copiado', 'Compartilhe com quem tem acesso à plataforma.');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('error', 'Não foi possível copiar o link', url);
    }
  }

  useEffect(() => {
    const cached = prefetchCache?.current?.get(id);
    if (cached) {
      setDetail(cached);
      prefetchCache!.current!.delete(id);
      return;
    }
    load();
  }, [id]);

  // Mantém o card (kanban/lista) em sincronia com a contagem de anexos/comentários
  // sempre que o detalhe é (re)carregado após inserir/excluir.
  const anexoTotal = (detail?.form_arquivos?.length ?? 0) + (detail?.etapa_arquivos?.length ?? 0);
  const comentarioTotal = detail?.eventos.filter(ev => ev.tipo === 'comentario').length ?? 0;
  const pendAbertaTotal = detail?.pendencias?.filter(p => !p.resolvida).length ?? 0;
  const pendTotal = detail?.pendencias?.length ?? 0;
  useEffect(() => {
    if (!detail) return;
    onEdited?.(id, { arquivo_count: anexoTotal, comentario_count: comentarioTotal, pendencia_aberta_count: pendAbertaTotal, pendencia_total_count: pendTotal });
  }, [anexoTotal, comentarioTotal, pendAbertaTotal, pendTotal]);

  async function sendComment(texto: string, parentId?: number) {
    if (!texto.trim()) return;
    await api('', 'POST', { action: 'comment', solicitacao_id: id, texto: texto.trim(), parent_id: parentId ?? null });
    await load();
  }

  async function deleteComment(commentId: number) {
    await api('', 'POST', { action: 'delete_comment', id: commentId });
    setDeleteCommentId(null);
    await load();
  }

  async function patchLiquidez(value: string) {
    setDetail(prev => prev ? { ...prev, submission: { ...prev.submission, liquidez: value || null } } : prev);
    await api('', 'POST', { action: 'patch_submission', id, field: 'liquidez', value: value || null });
  }

  // Grava a data (otimista + backend), sem efeitos de status
  async function saveExecField(field: 'previsao_execucao' | 'data_execucao', value: string) {
    setDetail(prev => prev ? { ...prev, submission: { ...prev.submission, [field]: value || null } } : prev);
    onEdited?.(id, { [field]: value || null }); // avisa o pai (ex.: Liquidez reagrupa por semana na hora)
    try {
      await api('', 'POST', { action: 'patch_submission', id, field, value: value || null });
    } catch {
      toast('error', 'Erro ao salvar a data');
    }
  }

  async function patchExecField(field: 'previsao_execucao' | 'data_execucao', value: string) {
    await saveExecField(field, value);
    // Ao registrar a DATA DE EXECUÇÃO fora da conversão, confirma o move para a etapa de conversão
    if (field === 'data_execucao' && (value || '').trim()) {
      const convSt = statuses.find(st => st.is_conversion);
      const scEvts = detail?.eventos.filter(ev => ev.tipo === 'status_change') ?? [];
      const curId = scEvts[scEvts.length - 1]?.status_id;
      if (convSt && Number(curId) !== Number(convSt.id)) {
        setPendingAutoConv(Number(convSt.id));
      }
    }
  }

  async function confirmAutoConv() {
    if (pendingAutoConv == null) return;
    const sid = pendingAutoConv;
    setPendingAutoConv(null);
    await performMove(sid);
  }

  async function confirmExecClear() {
    if (pendingExecClear == null) return;
    const sid = pendingExecClear;
    setPendingExecClear(null);
    await saveExecField('data_execucao', ''); // limpa a data de execução
    await performMove(sid);
  }

  async function handleDeleteSubmission() {
    await api('', 'POST', { action: 'delete_submission', id });
    setDeleteSubmissionConfirm(false);
    toast('success', 'Solicitação excluída');
    onDelete?.(id);
    onClose();
  }

  async function performMove(statusId: number) {
    const st = detail?.statuses?.find(s => Number(s.id) === statusId);
    const statusName = st?.nome;
    // Otimista: reflete o novo status na hora (board + pill do drawer), rede em segundo plano
    onMoved(id, statusId);
    setDetail(prev => prev ? {
      ...prev,
      eventos: [...prev.eventos, {
        id: -Date.now(), solicitacao_id: id, tipo: 'status_change',
        status_id: statusId, status_nome: statusName ?? null, status_cor: (st as any)?.cor ?? null,
        descricao: null, parent_id: null, criado_em: new Date().toISOString(),
        autor_id: usuario?.id ?? null, autor_nome: usuario?.nome ?? null, autor_foto: usuario?.foto_url ?? null,
      }],
    } : prev);
    toast('success', statusName ? `Movido para "${statusName}"` : 'Status atualizado');
    setMovingTo(statusId);
    try {
      await api('', 'POST', { action: 'move', solicitacao_id: id, status_id: statusId });
      await load();
    } finally {
      setMovingTo(null);
    }
  }

  async function moveToStatus(statusId: number) {
    const cfg = statuses.find(st => Number(st.id) === Number(statusId));
    // Status atual = último evento de status_change (o detalhe não tem current_status_id)
    const scEvts = detail?.eventos.filter(ev => ev.tipo === 'status_change') ?? [];
    const curId = scEvts[scEvts.length - 1]?.status_id;
    const currentCfg = statuses.find(st => Number(st.id) === Number(curId));
    // Sair da etapa de conversão com data de execução registrada → confirmar limpeza
    if (currentCfg?.is_conversion && !cfg?.is_conversion && detail?.submission.data_execucao) {
      setPendingExecClear(statusId);
      return;
    }
    // Mover para a etapa de conversão exige registrar a data de execução primeiro.
    if (cfg?.is_conversion) {
      setPendingConversion(statusId);
      return;
    }
    // Etapa que exige pendências → registrar antes de mover.
    if (cfg?.requires_pendencia && Number(curId) !== Number(statusId)) {
      setPendingPendencia(statusId);
      return;
    }
    await performMove(statusId);
  }

  async function confirmPendencia(itens: PendItem[]) {
    const statusId = pendingPendencia;
    if (statusId == null) return;
    setSavingPendMove(true);
    try {
      const orig = new Map((detail?.pendencias ?? []).map(p => [p.id, p]));
      const novas = itens.filter(i => !i.id && i.descricao.trim()).map(i => ({ descricao: i.descricao.trim(), categoria: i.categoria }));
      const editadas = itens.filter(i => i.id && (orig.get(i.id)?.descricao !== i.descricao.trim() || normPendCat(orig.get(i.id)?.categoria) !== i.categoria));
      if (novas.length) await api('', 'POST', { action: 'add_pendencias', solicitacao_id: id, status_id: statusId, itens: novas });
      for (const e of editadas) await api('', 'POST', { action: 'update_pendencia', id: e.id, descricao: e.descricao.trim(), categoria: e.categoria });
      setPendingPendencia(null);
      await performMove(statusId);
    } finally {
      setSavingPendMove(false);
    }
  }

  async function confirmConversion(date: string) {
    const statusId = pendingConversion;
    if (statusId == null) return;
    await saveExecField('data_execucao', date);
    setPendingConversion(null);
    await performMove(statusId);
  }

  async function downloadFile(fileId: number, isStage: boolean, nome: string) {
    const action = isStage ? 'get_file_base64' : 'get_form_file_base64';
    const data = await api('', 'POST', { action, id: fileId });
    if (data.base64) {
      const a = document.createElement('a');
      a.href = data.base64;
      a.download = nome;
      a.click();
    }
  }

  // Abre um anexo do tipo "link" (a URL está em base64, buscada sob demanda).
  async function openLink(f: { id: number; tipo: string }, isStage: boolean) {
    const action = isStage ? 'get_file_base64' : 'get_form_file_base64';
    const data = await api('', 'POST', { action, id: f.id });
    if (data.base64) window.open(data.base64, '_blank', 'noopener');
    else toast('error', 'Link indisponível');
  }

  const canPreviewPipeline = (tipo: string) => tipo.startsWith('image/') || tipo === 'application/pdf';

  async function openPipelinePreview(f: { id: number; nome: string; tipo: string }, isForm = false) {
    const displayName = pipelineLocalNames[f.id] ?? f.nome;
    setPipelinePreviewState({ nome: displayName, tipo: f.tipo, base64: null });
    const data = await api('', 'POST', { action: isForm ? 'get_form_file_base64' : 'get_file_base64', id: f.id });
    setPipelinePreviewState({ nome: displayName, tipo: f.tipo, base64: data.base64 });
  }

  function startPipelineEdit(f: { id: number; nome: string }) {
    setPipelineEditingId(f.id);
    setPipelineEditValue(pipelineLocalNames[f.id] ?? f.nome);
    setTimeout(() => pipelineEditRef.current?.select(), 0);
  }

  async function deleteFile(fileId: number) {
    const nome = deleteConfirmNome;
    const action = deleteConfirmIsForm ? 'delete_form_file' : 'delete_file';
    setDeleteConfirmId(null);
    try {
      await api('', 'POST', { action, id: fileId });
      toast('success', 'Anexo excluído', nome || undefined);
      await load();
    } catch {
      toast('error', 'Erro ao excluir anexo', nome || undefined);
    }
  }

  // Abre o modal de confirmação de exclusão de um anexo.
  function askDeleteFile(fileId: number, nome: string, isForm: boolean) {
    setDeleteConfirmIsForm(isForm);
    setDeleteConfirmNome(nome);
    setDeleteConfirmId(fileId);
  }

  async function commitPipelineEdit(id: number, originalNome: string) {
    const trimmed = pipelineEditValue.trim();
    if (trimmed && trimmed !== (pipelineLocalNames[id] ?? originalNome)) {
      setPipelineLocalNames(prev => ({ ...prev, [id]: trimmed }));
      await api('', 'POST', { action: 'rename_file', id, nome: trimmed });
    }
    setPipelineEditingId(null);
  }

  // ── Pendências (checklist) ──
  async function togglePendencia(pid: number, resolvida: boolean) {
    setDetail(prev => prev ? { ...prev, pendencias: prev.pendencias.map(p => p.id === pid ? { ...p, resolvida: resolvida ? 1 : 0, resolvido_em: resolvida ? new Date().toISOString() : null } : p) } : prev);
    try { await api('', 'POST', { action: 'toggle_pendencia', id: pid, resolvida }); }
    catch { toast('error', 'Erro ao atualizar pendência'); await load(); }
  }
  async function deletePendencia(pid: number) {
    setDetail(prev => prev ? { ...prev, pendencias: prev.pendencias.filter(p => p.id !== pid) } : prev);
    try { await api('', 'POST', { action: 'delete_pendencia', id: pid }); }
    catch { toast('error', 'Erro ao excluir pendência'); await load(); }
  }
  async function updatePendCategoria(pid: number, categoria: string) {
    setDetail(prev => prev ? { ...prev, pendencias: prev.pendencias.map(p => p.id === pid ? { ...p, categoria } : p) } : prev);
    try { await api('', 'POST', { action: 'update_pendencia', id: pid, categoria }); }
    catch { toast('error', 'Erro ao atualizar pendência'); await load(); }
  }
  async function addPendencia(descricao: string, categoria: string) {
    const scEvts = detail?.eventos.filter(ev => ev.tipo === 'status_change') ?? [];
    const currentStatusId = scEvts[scEvts.length - 1]?.status_id ?? null;
    await api('', 'POST', { action: 'add_pendencias', solicitacao_id: id, status_id: currentStatusId, itens: [{ descricao, categoria }] });
    await load();
  }

  async function downloadAll() {
    if (!detail || downloadingAll) return;
    setDownloadingAll(true);
    const all: Array<{ id: number; isStage: boolean; nome: string }> = [
      ...detail.form_arquivos.map(f => ({ id: f.id, isStage: false, nome: f.nome })),
      ...detail.etapa_arquivos.map(f => ({ id: f.id, isStage: true, nome: f.nome })),
    ];
    for (const f of all) {
      await downloadFile(f.id, f.isStage, f.nome);
      await new Promise(r => setTimeout(r, 400));
    }
    setDownloadingAll(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !detail) return;
    e.target.value = '';

    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast('error', `Arquivo muito grande (máx. ${MAX_MB} MB)`, 'Anexe um link (Google Drive, etc.) no campo abaixo.');
      setShowLinkForm(true);
      return;
    }

    const scEvts = detail.eventos.filter(ev => ev.tipo === 'status_change');
    const currentStatusId = scEvts[scEvts.length - 1]?.status_id;
    if (!currentStatusId) return;

    // O upload continua mesmo se o drawer for fechado (o fetch não é abortado no unmount)
    // e o toast final é disparado pelo contexto (que vive acima do drawer).
    setUploadingNames(n => [...n, file.name]);
    const finish = () => setUploadingNames(n => { const i = n.indexOf(file.name); if (i < 0) return n; const c = [...n]; c.splice(i, 1); return c; });

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api('', 'POST', {
          action: 'upload_file',
          solicitacao_id: id,
          status_id: currentStatusId,
          arquivo: { nome: file.name, tipo: file.type, tamanho: file.size, base64: reader.result, categoria: 'Outros' },
        });
        toast('success', 'Anexo adicionado', file.name);
        await load();
      } catch (err: any) {
        toast('error', 'Erro ao adicionar anexo', file.name);
      } finally {
        finish();
      }
    };
    reader.onerror = () => {
      toast('error', 'Erro ao ler o arquivo', file.name);
      finish();
    };
    reader.readAsDataURL(file);
  }

  // Anexa um LINK (ex.: Google Drive) como anexo - para arquivos grandes demais.
  async function addLink() {
    if (!detail) return;
    let url = linkUrl.trim();
    if (!url) { toast('error', 'Informe o link'); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const scEvts = detail.eventos.filter(ev => ev.tipo === 'status_change');
    const currentStatusId = scEvts[scEvts.length - 1]?.status_id;
    if (!currentStatusId) return;
    setSavingLink(true);
    try {
      await api('', 'POST', {
        action: 'upload_file',
        solicitacao_id: id,
        status_id: currentStatusId,
        arquivo: { nome: linkNome.trim() || url, tipo: 'link', tamanho: 0, base64: url, categoria: 'Outros' },
      });
      toast('success', 'Link anexado');
      setLinkUrl(''); setLinkNome(''); setShowLinkForm(false);
      await load();
    } catch (e: any) {
      toast('error', 'Erro ao anexar link', e?.message);
    } finally {
      setSavingLink(false);
    }
  }

  // Recategoriza um anexo (form ou etapa) - atualização otimista + persistência
  async function updateCategoria(fileId: number, isStage: boolean, categoria: string) {
    setDetail(prev => {
      if (!prev) return prev;
      if (isStage) {
        return { ...prev, etapa_arquivos: prev.etapa_arquivos.map(f => f.id === fileId ? { ...f, categoria } : f) };
      }
      return { ...prev, form_arquivos: prev.form_arquivos.map(f => f.id === fileId ? { ...f, categoria } : f) };
    });
    try {
      await api('', 'POST', { action: 'update_arquivo_categoria', id: fileId, is_stage: isStage, categoria });
    } catch {
      toast('error', 'Não foi possível alterar a categoria.');
      await load();
    }
  }

  const s = detail?.submission;
  const _scEvts = detail?.eventos.filter(ev => ev.tipo === 'status_change') ?? [];
  const currentStatusId = _scEvts[_scEvts.length - 1]?.status_id;
  const fim = s?.fim_type ? FIM_LABELS[s.fim_type as number] : null;


  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {/* Row 1: label + actions + close */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Solicitação
              </p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{s?.nome_contratado ?? '…'}</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {detail && (
                <>
                  <button
                    className="admin-toolbar-btn"
                    title={copied ? 'Link copiado!' : 'Copiar link de compartilhamento'}
                    onClick={copyShareLink}
                    style={{ width: 30, height: 30, color: copied ? '#1E8A3E' : undefined, borderColor: copied ? 'rgba(30,138,62,.4)' : undefined }}
                  >
                    {copied ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                  <button
                    className="admin-toolbar-btn"
                    title="Editar solicitação"
                    onClick={() => setShowEdit(true)}
                    style={{ width: 30, height: 30 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                  <button
                    className="admin-toolbar-btn"
                    title="Excluir solicitação"
                    onClick={() => setDeleteSubmissionConfirm(true)}
                    style={{ width: 30, height: 30, color: '#D93025' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </>
              )}
              <button className="admin-modal-close" aria-label="Fechar" onClick={onClose}><IconX size={16} /></button>
            </div>
          </div>
          {/* Row 2: status select + download all + drive link */}
          {detail && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusSelect
                statuses={detail.statuses}
                currentId={currentStatusId}
                disabled={movingTo !== null}
                onChange={moveToStatus}
              />
              {(detail.form_arquivos.length + detail.etapa_arquivos.length) > 0 && (
                <button
                  className="download-all-btn"
                  onClick={downloadAll}
                  disabled={downloadingAll}
                  title="Baixar todos os arquivos"
                >
                  {downloadingAll ? (
                    <>
                      <div className="download-all-spinner" />
                      Baixando…
                    </>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Baixar todos ({detail.form_arquivos.length + detail.etapa_arquivos.length})
                    </>
                  )}
                </button>
              )}
              {detail.submission.cedente_link_drive && (
                <a
                  href={String(detail.submission.cedente_link_drive)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cedente-drive-link"
                  style={{ marginLeft: 'auto' }}
                >
                  <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3L28 48.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                    <path d="M43.65 25L29.35 0c-1.35.8-2.5 1.9-3.3 3.3L1.2 44.3C.4 45.7 0 47.25 0 48.8h28z" fill="#00ac47"/>
                    <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.1 57.3c.8-1.4 1.2-2.95 1.2-4.5H59.3l5.9 12.4z" fill="#ea4335"/>
                    <path d="M43.65 25L57.95 0H29.35z" fill="#00832d"/>
                    <path d="M59.3 48.8h28L73.55 20.3c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.3 48.8z" fill="#2684fc"/>
                    <path d="M13.8 76.8c1.35.8 2.9 1.2 4.5 1.2h50.7c1.6 0 3.15-.45 4.5-1.2L57.95 48.8H28z" fill="#ffba00"/>
                  </svg>
                </a>
              )}
            </div>
          )}
        </div>

        {!detail ? (
          <DetailSkeleton />
        ) : (
          <div className="admin-modal-body">

            {/* Liquidez */}
            <section>
              <p className="admin-info-label" style={{ marginBottom: 6 }}>Liquidez</p>
              <LiquidezSelect
                value={s!.liquidez ? String(s!.liquidez) : null}
                onChange={patchLiquidez}
              />
            </section>

            {/* Partes */}
            <section>
              <p className="admin-section-title">Partes envolvidas</p>
              <div className="detail-party-grid">
                <div className="detail-party-card detail-party-cedente">
                  <p className="detail-party-role">Cedente (Contratado)</p>
                  <p className="detail-party-name">{s!.nome_contratado ?? '-'}</p>
                  <p className="detail-party-cnpj">{s!.cnpj_contratado ?? '-'}</p>
                  {s!.situacao_contratado && (
                    <span className={`detail-party-badge${String(s!.situacao_contratado).toUpperCase().includes('ATIVA') ? ' ativa' : ' inativa'}`}>
                      {s!.situacao_contratado}
                    </span>
                  )}
                  {depsControl('ced')}
                </div>
                <div className="detail-party-arrow">→</div>
                <div className="detail-party-card detail-party-sacado">
                  <p className="detail-party-role">Sacado (Contratante)</p>
                  <p className="detail-party-name">{s!.nome_sacado ?? '-'}</p>
                  <p className="detail-party-cnpj">{s!.cnpj_sacado ?? '-'}</p>
                  {s!.situacao_sacado && (
                    <span className={`detail-party-badge${String(s!.situacao_sacado).toUpperCase().includes('ATIVA') ? ' ativa' : ' inativa'}`}>
                      {s!.situacao_sacado}
                    </span>
                  )}
                  {depsControl('sac')}
                </div>
              </div>
            </section>

            {/* Operação */}
            <section>
              <p className="admin-section-title">Dados da operação</p>
              {(() => {
                let parcelas: Array<{ valor: string; valorNumerico: number; vencimento: string }> | null = null;
                try { parcelas = s!.parcelas ? JSON.parse(String(s!.parcelas)) : null; } catch {}
                return (
                  <>
                    <div className="detail-op-grid">
                      <div className="detail-op-item">
                        <p className="admin-info-label">Valor total</p>
                        <p className="detail-op-value">{s!.valor ?? '-'}</p>
                      </div>
                      {parcelas ? (
                        <div className="detail-op-item">
                          <p className="admin-info-label">Parcelas</p>
                          <p className="detail-op-value">{parcelas.length}x</p>
                        </div>
                      ) : (
                        <div className="detail-op-item">
                          <p className="admin-info-label">Vencimento</p>
                          <p className="detail-op-value">{formatPrazo(s!.prazo_limite as string)}</p>
                        </div>
                      )}
                      {fim && (
                        <div className="detail-op-item detail-op-fluxo">
                          <p className="admin-info-label">Fluxo de pagamento</p>
                          <span className="admin-badge" style={{ background: fim.bg, color: fim.color, marginTop: 4, display: 'inline-block', fontSize: 12 }}>
                            {fim.label}
                          </span>
                        </div>
                      )}
                    </div>
                    {parcelas && (
                      <div className="parcelas-detail-table">
                        <div className="parcelas-detail-header">
                          <span>#</span>
                          <span>Valor</span>
                          <span>Vencimento</span>
                        </div>
                        {parcelas.map((p, i) => (
                          <div key={i} className="parcelas-detail-row">
                            <span className="parcelas-detail-num">{i + 1}ª</span>
                            <span className="parcelas-detail-valor">{p.valor}</span>
                            <span className="parcelas-detail-venc">{formatPrazo(p.vencimento)}</span>
                          </div>
                        ))}
                        <div className="parcelas-detail-footer">
                          <span>Total</span>
                          <strong>{s!.valor ?? '-'}</strong>
                          <span />
                        </div>
                      </div>
                    )}
                    {/* Execução - datas de sistema (não vêm do formulário) */}
                    <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                      <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
                        <label className="form-label">Previsão de execução</label>
                        <DatePicker
                          value={s!.previsao_execucao ? String(s!.previsao_execucao) : ''}
                          onChange={v => patchExecField('previsao_execucao', v)}
                          compact
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
                        <label className="form-label">Data da execução</label>
                        <DatePicker
                          value={s!.data_execucao ? String(s!.data_execucao) : ''}
                          onChange={v => patchExecField('data_execucao', v)}
                          compact
                          allowPast
                        />
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>

            {/* Lead time por etapa */}
            {(() => {
              const changes = detail.eventos
                .filter(e => e.tipo === 'status_change' && e.status_nome)
                .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
              if (changes.length === 0) return null;
              const now = new Date().toISOString();
              const lastChange = changes[changes.length - 1];
              const currentNome = lastChange?.status_nome;
              // Etapa atual marcada como conversão/desconsiderada → o card fica ali
              // permanentemente; congela o relógio (não conta o intervalo em aberto).
              const currentCfg = statuses.find(st => Number(st.id) === Number(detail.submission.current_status_id))
                ?? (lastChange ? statuses.find(st => st.nome === lastChange.status_nome) : undefined);
              const clockStopped = !!(currentCfg && (currentCfg.is_conversion || currentCfg.is_excluded));
              // Accumulate ms per stage name
              const acc: Record<string, { nome: string; cor: string; ms: number }> = {};
              changes.forEach((ev, i) => {
                const isLast = i === changes.length - 1;
                const start = new Date(ev.criado_em).getTime();
                const end = isLast && clockStopped ? start : new Date(changes[i + 1]?.criado_em ?? now).getTime();
                const ms = end - start;
                const key = String(ev.status_nome);
                if (acc[key]) {
                  acc[key].ms += ms;
                } else {
                  acc[key] = { nome: key, cor: String(ev.status_cor ?? '#888'), ms };
                }
              });
              const formatMs = (ms: number) => {
                const totalMinutes = Math.floor(ms / 60000);
                const days = Math.floor(totalMinutes / 1440);
                const hours = Math.floor((totalMinutes % 1440) / 60);
                const mins = totalMinutes % 60;
                return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;
              };
              const stages = Object.values(acc).map(s => {
                const isCurrent = s.nome === currentNome;
                const frozen = isCurrent && clockStopped;
                return { ...s, label: frozen ? '-' : formatMs(s.ms), isCurrent, frozen };
              });
              const maxMs = Math.max(...stages.map(s => s.ms), 1);
              return (
                <section>
                  <p className="admin-section-title">Lead time por etapa</p>
                  <div className="lead-time-list">
                    {stages.map((st, i) => (
                      <div key={i} className="lead-time-row">
                        <div className="lead-time-name">
                          <span className="lead-time-dot" style={{ background: st.cor }} />
                          <span>{st.nome}</span>
                          {st.isCurrent && <span className="lead-time-current">{st.frozen ? 'final' : 'atual'}</span>}
                        </div>
                        <div className="lead-time-bar-wrap">
                          <div
                            className="lead-time-bar"
                            style={{ width: `${Math.max((st.ms / maxMs) * 100, 2)}%`, background: st.cor + '55', borderColor: st.cor }}
                          />
                        </div>
                        <span className="lead-time-value">{st.label}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })()}

            {/* Avaliação */}
            {s!.decisions && (() => {
              let dec: Record<string, boolean> = {};
              try { dec = JSON.parse(String(s!.decisions)); } catch {}
              const QUESTIONS: Array<{ key: string; question: string; fileCategoria?: string }> = [
                { key: 'node5',           question: 'Essa operação já tem contrato assinado?',                                                              fileCategoria: 'contrato' },
                { key: 'nodeB',           question: 'Podemos sinalizar a conta escrow na operação?' },
                { key: 'nodeA',           question: 'A nota já foi emitida?',                                                                               fileCategoria: 'nota_fiscal' },
                { key: 'nodeA1',          question: 'É possível a anuência do sacado para pagamento direto para a DUX?' },
                { key: 'nodeA2',          question: 'É possível sinalizar a conta escrow na descrição da nota e buscar aceite do sacado via e-mail?' },
                { key: 'nodeConvergente', question: 'É possível sinalizar mudança de domicílio bancário para conta escrow e receber aceite do sacado por e-mail?' },
              ];
              const answered = QUESTIONS.filter(q => q.key in dec);
              if (!answered.length) return null;
              // Anexos do formulário agora aparecem na seção "Anexos" - a avaliação mostra só o Q&A.
              return (
                <section>
                  <button type="button" onClick={() => setShowAvaliacao(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <span className="admin-section-title" style={{ marginBottom: 0 }}>Avaliação da operação</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--gray2)' }}>
                      {answered.length} {answered.length === 1 ? 'resposta' : 'respostas'}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .15s', transform: showAvaliacao ? 'rotate(180deg)' : 'none' }}>
                        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                  </button>
                  {showAvaliacao && (
                    <div className="detail-decisions" style={{ marginTop: 10 }}>
                      {answered.map(q => (
                        <DecisionCard
                          key={q.key}
                          question={q.question}
                          answer={dec[q.key]}
                          files={[]}
                          onDownload={(id, nome) => downloadFile(id, false, nome)}
                          onFetchBase64={async (id) => {
                            const data = await api('', 'POST', { action: 'get_form_file_base64', id });
                            return data;
                          }}
                          onRename={async (id, nome) => {
                            await api('', 'POST', { action: 'rename_form_file', id, nome });
                          }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })()}

            {/* Pendências (checklist) */}
            <PendenciaSection
              pendencias={detail.pendencias ?? []}
              onToggle={togglePendencia}
              onDelete={deletePendencia}
              onUpdateCat={updatePendCategoria}
              onAdd={addPendencia}
            />

            {/* Anexos - inclui TODOS os arquivos do formulário (contrato, nota fiscal, docs
               adicionais e gerais), além dos anexados nas etapas. */}
            {(() => {
            // Mapeia as categorias internas do formulário para as categorias de exibição.
            const FORM_CAT_MAP: Record<string, string> = {
              contrato: 'Contrato',
              nota_fiscal: 'Financeiro',
              docs_adicionais: 'Outros',
            };
            const catDe = (f: any, isStage: boolean) =>
              normalizaCategoria(!isStage ? (FORM_CAT_MAP[f.categoria] ?? f.categoria) : f.categoria);
            const totalAnexos = detail.form_arquivos.length + detail.etapa_arquivos.length;
            // Lista unificada (form + etapa), agrupada por categoria.
            type AnexoItem = { f: any; isStage: boolean; cat: string };
            const itens: AnexoItem[] = [
              ...detail.form_arquivos.map(f => ({ f, isStage: false, cat: catDe(f, false) })),
              ...detail.etapa_arquivos.map(f => ({ f, isStage: true, cat: catDe(f, true) })),
            ];
            const grupos = ANEXO_CATEGORIAS
              .map(cat => ({ cat, itens: itens.filter(i => i.cat === cat) }))
              .filter(g => g.itens.length > 0);

            const iconClass = (f: any) => f.tipo === 'application/pdf' ? 'pdf' : (f.tipo === 'application/zip' || f.nome?.endsWith('.zip')) ? 'zip' : 'img';
            const iconEmoji = (f: any) => f.tipo === 'application/pdf' ? <IconDoc size={15} /> : (f.tipo === 'application/zip' || f.nome?.endsWith('.zip')) ? <IconZip size={15} /> : <IconImage size={15} />;

            const CatSelect = ({ f, isStage }: { f: any; isStage: boolean }) => (
              <CategoriaSelect
                value={catDe(f, isStage)}
                onChange={c => updateCategoria(f.id, isStage, c)}
              />
            );

            const renderRow = ({ f, isStage }: AnexoItem) => {
              if (f.tipo === 'link') {
                return (
                  <div key={isStage ? f.id : `form-${f.id}`} className="admin-file-item">
                    <div className="detail-file-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconLink size={15} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="decision-file-name" style={{ fontSize: 12, fontWeight: 600, color: '#0066CC', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title="Abrir link" onClick={() => openLink(f, isStage)}>{f.nome}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 1 }}>Link externo</p>
                    </div>
                    <CatSelect f={f} isStage={isStage} />
                    <button className="file-eye-btn" title="Abrir link" onClick={() => openLink(f, isStage)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                    {isStage && (
                      <button className="file-delete-btn" title="Excluir anexo" onClick={() => askDeleteFile(f.id, f.nome, false)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              }
              if (!isStage) {
                return (
                  <div key={`form-${f.id}`} className="admin-file-item">
                    <div className={`detail-file-icon ${iconClass(f)}`}>{iconEmoji(f)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="decision-file-name" style={{ fontSize: 12, fontWeight: 600 }}>{f.nome}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 1 }}>{formatSize(f.tamanho)}</p>
                    </div>
                    <CatSelect f={f} isStage={false} />
                    {canPreviewPipeline(f.tipo) && (
                      <button className="file-eye-btn" title="Visualizar" onClick={() => openPipelinePreview(f, true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/>
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                        </svg>
                      </button>
                    )}
                    <button className="admin-file-download" title="Baixar" onClick={() => downloadFile(f.id, false, f.nome)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      </svg>
                    </button>
                    <button className="file-delete-btn" title="Excluir anexo" onClick={() => askDeleteFile(f.id, f.nome, true)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                        <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                );
              }
              const displayName = pipelineLocalNames[f.id] ?? f.nome;
              const isEditing = pipelineEditingId === f.id;
              return (
                <div key={f.id} className="admin-file-item">
                  <div className={`detail-file-icon ${iconClass(f)}`}>{iconEmoji(f)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isEditing ? (
                      <input
                        ref={pipelineEditRef}
                        className="file-name-input"
                        value={pipelineEditValue}
                        onChange={e => setPipelineEditValue(e.target.value)}
                        onBlur={() => commitPipelineEdit(f.id, f.nome)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitPipelineEdit(f.id, f.nome); }
                          if (e.key === 'Escape') setPipelineEditingId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <p
                        className="decision-file-name editable"
                        title="Clique para renomear"
                        style={{ fontSize: 12, fontWeight: 600 }}
                        onClick={() => startPipelineEdit(f)}
                      >
                        {displayName}
                      </p>
                    )}
                    <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 1 }}>{formatSize(f.tamanho)}</p>
                  </div>
                  <CatSelect f={f} isStage={true} />
                  {canPreviewPipeline(f.tipo) && (
                    <button className="file-eye-btn" title="Visualizar" onClick={() => openPipelinePreview(f)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                      </svg>
                    </button>
                  )}
                  <button className="admin-file-download" title="Baixar" onClick={() => downloadFile(f.id, true, displayName)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </button>
                  <button
                    className="file-delete-btn"
                    title="Excluir anexo"
                    onClick={() => askDeleteFile(f.id, displayName, false)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                      <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              );
            };

            return (
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                <p className="admin-section-title" style={{ marginBottom: 0 }}>
                  Anexos
                  {totalAnexos > 0 && (
                    <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--gray3)', color: 'var(--gray)', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>
                      {totalAnexos}
                    </span>
                  )}
                </p>
                <label className="detail-attach-btn" title="Inserir anexo" style={{ cursor: 'pointer' }}>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,.zip" style={{ display: 'none' }} onChange={handleFileUpload} />
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.64 17.2a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </label>
              </div>
              {showLinkForm && (
                <div style={{ border: '1px solid var(--gray3)', borderRadius: 10, padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)' }}>
                  <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--gray)' }}><IconLink size={13} /> Anexar link (Google Drive, etc.)</p>
                  <input className="form-input" placeholder="https://drive.google.com/..." value={linkUrl}
                    onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLink(); }} autoFocus />
                  <input className="form-input" placeholder="Nome do documento (opcional)" value={linkNome}
                    onChange={e => setLinkNome(e.target.value)} />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkNome(''); }} disabled={savingLink}>Cancelar</button>
                    <button className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addLink} disabled={savingLink}>{savingLink ? 'Anexando…' : 'Anexar link'}</button>
                  </div>
                </div>
              )}
              {totalAnexos === 0 && uploadingNames.length === 0 && !showLinkForm && (
                <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, textAlign: 'center', padding: '8px 0' }}>Nenhum anexo enviado.</p>
              )}
              {uploadingNames.length > 0 && (
                <div className="admin-file-list" style={{ marginBottom: 12 }}>
                  {uploadingNames.map((nm, i) => (
                    <div key={`up-${i}`} className="admin-file-item" style={{ opacity: 0.85 }}>
                      <div className="detail-file-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span className="anexo-spinner" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="decision-file-name" style={{ fontSize: 12, fontWeight: 600 }}>{nm}</p>
                        <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 1 }}>Enviando…</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {grupos.map(g => (
                <div key={g.cat} style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' }}>
                    {g.cat}
                    <span style={{ marginLeft: 6, fontWeight: 600 }}>({g.itens.length})</span>
                  </p>
                  <div className="admin-file-list">
                    {g.itens.map(renderRow)}
                  </div>
                </div>
              ))}
            </section>
            );
            })()}

            {pipelinePreviewState && (
              <FilePreviewModal
                state={pipelinePreviewState}
                onClose={() => setPipelinePreviewState(null)}
                onDownload={() => {
                  if (!pipelinePreviewState.base64) return;
                  const link = document.createElement('a');
                  link.href = pipelinePreviewState.base64.startsWith('data:') ? pipelinePreviewState.base64 : `data:${pipelinePreviewState.tipo};base64,${pipelinePreviewState.base64}`;
                  link.download = pipelinePreviewState.nome;
                  link.click();
                }}
              />
            )}

            {deleteConfirmId !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirmId(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Excluir anexo?</p>
                  <p className="delete-confirm-desc">
                    <strong>{deleteConfirmNome}</strong> será excluído permanentemente e não poderá ser recuperado.
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setDeleteConfirmId(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" onClick={() => deleteFile(deleteConfirmId)}>Excluir</button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {deleteCommentId !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteCommentId(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Excluir comentário?</p>
                  <p className="delete-confirm-desc">
                    O comentário será excluído permanentemente. Respostas associadas também serão removidas.
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setDeleteCommentId(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" onClick={() => deleteComment(deleteCommentId)}>Excluir</button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {deleteSubmissionConfirm && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteSubmissionConfirm(false)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Excluir solicitação?</p>
                  <p className="delete-confirm-desc">
                    <strong>{detail?.submission.nome_contratado}</strong> será removida do sistema. Esta ação pode ser revertida pelo suporte, mas não pela interface.
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setDeleteSubmissionConfirm(false)}>Cancelar</button>
                    <button className="delete-confirm-ok" onClick={handleDeleteSubmission}>Excluir</button>
                  </div>
                </div>
              </div>,
              document.body
            )}




            {pendingConversion !== null && (
              <ExecutionDateModal
                statusName={statuses.find(st => Number(st.id) === Number(pendingConversion))?.nome}
                initialDate={detail?.submission.data_execucao ? String(detail.submission.data_execucao) : ''}
                onConfirm={confirmConversion}
                onCancel={() => setPendingConversion(null)}
              />
            )}

            {pendingPendencia !== null && (
              <PendenciaMoveModal
                statusName={statuses.find(st => Number(st.id) === Number(pendingPendencia))?.nome ?? 'esta etapa'}
                saving={savingPendMove}
                existentes={(detail?.pendencias ?? []).filter(p => !p.resolvida).map(p => ({ id: p.id, descricao: p.descricao, categoria: normPendCat(p.categoria) }))}
                onConfirm={confirmPendencia}
                onCancel={() => setPendingPendencia(null)}
              />
            )}

            {/* Preview embutido do relatório DEPS */}
            {depsPreview && (
              <DepsPreviewModal
                nome={depsPreview.nome}
                url={depsPreview.url}
                onClose={() => setDepsPreview(null)}
                onOpenTab={() => window.open(depsPreview.url, '_blank', 'noopener')}
              />
            )}

            {/* Consulta reaproveitável encontrada - reaproveitar (grátis) ou gerar nova (paga) */}
            {depsReuse !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1200, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDepsReuse(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Consulta DEPS encontrada</p>
                  <p className="delete-confirm-desc">
                    Há uma consulta deste CNPJ {depsReuse.dataConsulta
                      ? <>de <strong>{depsReuse.dataConsulta}</strong></>
                      : 'no histórico da DEPS'} para <strong>{depsReuse.alvo === 'ced' ? 'o cedente' : 'o sacado'}</strong>.
                    Deseja <strong>reaproveitá-la sem custo</strong> ou gerar uma <strong>nova consulta (com custo)</strong>?
                  </p>
                  <div className="delete-confirm-actions" style={{ flexWrap: 'wrap' }}>
                    <button className="delete-confirm-cancel" onClick={() => setDepsReuse(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" style={{ background: 'var(--yellow)', borderColor: 'var(--yellow)', color: '#000' }}
                      onClick={() => { const a = depsReuse.alvo; setDepsReuse(null); gerarDeps(a, true); }}>
                      Gerar nova (cobra)
                    </button>
                    <button className="delete-confirm-ok" style={{ background: '#1E8A3E', borderColor: '#1E8A3E', color: '#fff' }}
                      onClick={() => { const r = depsReuse; setDepsReuse(null); saveDeps(r.alvo, r.payload); }}>
                      Reaproveitar (grátis)
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Confirmar consulta DEPS nova (paga) - quando não há recente ou ao atualizar */}
            {depsConfirm !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1200, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDepsConfirm(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Gerar nova consulta DEPS?</p>
                  <p className="delete-confirm-desc">
                    Não há consulta recente reaproveitável para <strong>{depsConfirm === 'ced' ? 'o cedente' : 'o sacado'}</strong> (ou você optou por atualizar).
                    Gerar uma <strong>nova consulta DEPS é cobrado</strong>. Deseja continuar?
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setDepsConfirm(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" style={{ background: 'var(--yellow)', borderColor: 'var(--yellow)', color: '#000' }}
                      onClick={() => { const a = depsConfirm; setDepsConfirm(null); if (a) gerarDeps(a, true); }}>
                      Gerar nova (cobra)
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Confirmar mover p/ conversão após registrar a data de execução direto */}
            {pendingAutoConv !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setPendingAutoConv(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Mover para conversão?</p>
                  <p className="delete-confirm-desc">
                    A data de execução foi registrada. O status será alterado automaticamente para
                    <strong> {statuses.find(st => Number(st.id) === Number(pendingAutoConv))?.nome}</strong>. Deseja continuar?
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setPendingAutoConv(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" style={{ background: 'var(--yellow)', color: 'var(--on-yellow)' }} onClick={confirmAutoConv}>Confirmar</button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Confirmar sair da conversão (limpa a data de execução) */}
            {pendingExecClear !== null && createPortal(
              <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setPendingExecClear(null)}>
                <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
                  <p className="delete-confirm-title">Limpar data de execução?</p>
                  <p className="delete-confirm-desc">
                    Mover para <strong>{statuses.find(st => Number(st.id) === Number(pendingExecClear))?.nome}</strong> vai
                    <strong> limpar a data de execução</strong> registrada (a etapa deixa de ser de conversão). Deseja continuar?
                  </p>
                  <div className="delete-confirm-actions">
                    <button className="delete-confirm-cancel" onClick={() => setPendingExecClear(null)}>Cancelar</button>
                    <button className="delete-confirm-ok" onClick={confirmExecClear}>Confirmar</button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {showEdit && detail && (
              <EditModal
                detail={detail}
                token={token}
                onClose={() => setShowEdit(false)}
                onSaved={(fields) => {
                  setDetail(prev => prev ? { ...prev, submission: { ...prev.submission, ...fields } } : prev);
                  onEdited?.(id, fields);
                  setShowEdit(false);
                }}
              />
            )}

            {/* Comentários */}
            <CommentsSection
              eventos={detail.eventos}
              onSend={sendComment}
              onDelete={setDeleteCommentId}
              onFileUpload={handleFileUpload}
              statuses={detail.statuses}
              fetchMentions={async () => {
                const data = await fetch('/api/slack-users', { headers: { 'x-admin-session': token } }).then(r => r.json());
                return data.users ?? [];
              }}
            />

          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de anexos (pré-visualização + download) ───
type AnexoItem = { nome: string; tipo: string; tamanho: number; categoria?: string | null; url: string; isLink?: boolean };
function AnexosModal({ solicitacaoId, onClose }: { solicitacaoId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [itens, setItens] = useState<AnexoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<number | null>(null); // índice em pré-visualização (modal sobre modal)

  useEffect(() => {
    const token = localStorage.getItem('dux_admin_token') ?? '';
    let urls: string[] = [];
    fetch(`/api/admin-data?action=get_solicitacao_files&id=${encodeURIComponent(solicitacaoId)}`, {
      headers: { 'x-admin-session': token },
    })
      .then(r => r.json())
      .then(d => {
        const arqs: Array<{ nome: string; tipo: string; tamanho: number; categoria?: string | null; base64: string }> = d.arquivos ?? [];
        const mapped = arqs.map(a => {
          if (a.tipo === 'link') {
            return { nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, categoria: a.categoria, url: a.base64 || '', isLink: true };
          }
          const raw = a.base64?.includes(',') ? a.base64.split(',')[1] : a.base64;
          let url = '';
          try {
            const bytes = Uint8Array.from(atob(raw ?? ''), c => c.charCodeAt(0));
            url = URL.createObjectURL(new Blob([bytes], { type: a.tipo || 'application/octet-stream' }));
          } catch { url = ''; }
          return { nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, categoria: a.categoria, url, isLink: false };
        });
        urls = mapped.filter(m => !m.isLink).map(m => m.url).filter(Boolean);
        setItens(mapped);
      })
      .catch(() => toast('error', 'Erro ao carregar anexos'))
      .finally(() => setLoading(false));
    return () => { urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [solicitacaoId]);

  const baixar = (it: AnexoItem) => {
    if (!it.url) return;
    if (it.isLink) { window.open(it.url, '_blank', 'noopener'); return; }
    const a = document.createElement('a'); a.href = it.url; a.download = it.nome;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const baixarTodos = () => itens.forEach(it => it && baixar(it));

  const isPdf = (t: string) => (t || '').toLowerCase().includes('pdf');
  const isImg = (t: string) => (t || '').toLowerCase().startsWith('image/');
  const fmtKB = (n: number) => `${Math.max(1, Math.round((n || 0) / 1024))} KB`;
  const cur = preview != null ? itens[preview] : null;

  return createPortal(
    <div className="anexos-overlay" style={{ zIndex: 1060 }} onClick={onClose}>
      <div className="anexos-card" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3 style={{ fontSize: 16, fontWeight: 800 }}>Anexos da solicitação {loading ? '' : `(${itens.length})`}</h3>
          <button className="admin-modal-close" aria-label="Fechar" onClick={onClose}><IconX size={16} /></button>
        </div>

        {loading ? (
          <div className="dux-spinner-row" style={{ padding: 40 }}><span className="dux-spinner" /></div>
        ) : itens.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray)' }}>Nenhum anexo encontrado.</div>
        ) : (
          <div className="anexos-list" style={{ padding: '14px 20px' }}>
            {itens.map((it, i) => (
              <div key={i} className="anexos-row">
                <span className="anexos-row-ic">{it.isLink ? <IconLink size={15} /> : isPdf(it.tipo) ? <IconDoc size={15} /> : isImg(it.tipo) ? <IconImage size={15} /> : <IconClip size={15} />}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="anexos-row-name">{it.nome}</div>
                  <div className="anexos-row-meta">{it.isLink ? 'Link externo' : fmtKB(it.tamanho)}</div>
                </div>
                <CategoriaTag categoria={it.categoria} />
                {it.isLink ? (
                  <button className="anexos-mini" title="Abrir link" onClick={() => it.url && window.open(it.url, '_blank', 'noopener')}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                ) : (
                  <>
                    <button className="anexos-mini" title="Pré-visualizar" onClick={() => setPreview(i)}><IconEye /></button>
                    <button className="anexos-mini" title="Baixar" onClick={() => baixar(it)}><IconDownload /></button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && itens.length > 0 && (
          <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={baixarTodos}><IconDownload size={14} /> Baixar todos ({itens.length})</button>
          </div>
        )}
      </div>

      {/* Pré-visualização - modal sobre o modal */}
      {cur && createPortal(
        <div className="anexos-overlay" style={{ zIndex: 1080 }} onClick={() => setPreview(null)}>
          <div className="anexos-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur.nome}</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {cur.url && <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => window.open(cur.url, '_blank')}>Nova aba</button>}
                <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => baixar(cur)}><IconDownload size={13} /> Baixar</button>
                <button className="admin-modal-close" aria-label="Fechar" onClick={() => setPreview(null)}><IconX size={16} /></button>
              </div>
            </div>
            <div className="anexos-preview-body">
              {cur.url ? (
                isPdf(cur.tipo) ? (
                  <iframe title={cur.nome} src={cur.url} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8 }} />
                ) : isImg(cur.tipo) ? (
                  <img src={cur.url} alt={cur.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ textAlign: 'center', color: 'var(--gray)' }}>
                    <p style={{ marginBottom: 12 }}>Sem pré-visualização para este tipo de arquivo.</p>
                    <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => baixar(cur)}><IconDownload size={14} /> Baixar {cur.nome}</button>
                  </div>
                )
              ) : <div style={{ color: 'var(--gray)' }}>Arquivo indisponível.</div>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
}

// ── Kanban Card ─────────────────────────────────────
function KanbanCard({
  sub, onDragStart, onClick, color, onPrefetch, onCancelPrefetch, onDelete, hideAging,
}: {
  sub: Submission; onDragStart: (id: string) => void; onClick: (id: string) => void; color?: string;
  onPrefetch?: (id: string) => void; onCancelPrefetch?: (id: string) => void;
  onDelete?: (id: string) => void;
  // Em etapas de conversão/desconsideradas o card fica parado permanentemente,
  // então não faz sentido exibir o tempo acumulado ali.
  hideAging?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [showAnexos, setShowAnexos] = useState(false);
  const days = daysSince(sub.status_since);
  const fim = sub.fim_type ? FIM_LABELS[sub.fim_type] : null;

  return (
    <div
      className="kanban-card"
      style={{ '--col-color': color, position: 'relative' } as any}
      draggable={!confirmDel}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; definirImagemArrasto(e); onDragStart(sub.id); }}
      onClick={() => !confirmDel && onClick(sub.id)}
      onMouseEnter={() => { setHov(true); onPrefetch?.(sub.id); }}
      onMouseLeave={() => { setHov(false); onCancelPrefetch?.(sub.id); if (!confirmDel) setConfirmDel(false); }}
    >
      <p className="kanban-card-title">{sub.nome_contratado ?? '-'}</p>
      <p className="kanban-card-sub">{sub.nome_sacado ?? '-'}</p>
      <div className="kanban-card-meta">
        <span className="kanban-card-value">{sub.valor ?? '-'}</span>
        {!hideAging && days > 0 && (
          <span className={`kanban-card-days${days >= 7 ? ' late' : ''}`}>
            {days}d
          </span>
        )}
      </div>
      {fim && (
        <span className="admin-badge" style={{ background: fim.bg, color: fim.color, marginTop: 8, display: 'inline-block', fontSize: 10 }}>
          {fim.label}
        </span>
      )}
      {(sub.arquivo_count > 0 || (sub.comentario_count ?? 0) > 0 || (sub.pendencia_total_count ?? 0) > 0) && (
        <div className="kanban-card-footer">
          {sub.arquivo_count > 0 && (
            <button
              type="button"
              className="kanban-card-files kanban-card-files-btn"
              title="Ver anexos"
              onClick={e => { e.stopPropagation(); setShowAnexos(true); }}
            >
              <IconClip size={12} /> {sub.arquivo_count}
            </button>
          )}
          {(sub.comentario_count ?? 0) > 0 && (
            <span className="kanban-card-comments" title={`${sub.comentario_count} comentário(s)`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
                <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {sub.comentario_count}
            </span>
          )}
          {(sub.pendencia_total_count ?? 0) > 0 && (() => {
            const abertas = sub.pendencia_aberta_count ?? 0;
            const resolvido = abertas === 0;
            return (
              <span
                className="kanban-card-pend"
                title={resolvido ? 'Pendências resolvidas' : `${abertas} pendência(s) aberta(s)`}
                style={{ color: resolvido ? '#1E8A3E' : '#B45309', background: resolvido ? 'rgba(30,138,62,.12)' : 'rgba(180,83,9,.13)' }}
              >
                {resolvido ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ display: 'block' }}>
                    <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {resolvido ? '' : abertas}
              </span>
            );
          })()}
        </div>
      )}
      {showAnexos && (
        <div onClick={e => e.stopPropagation()}>
          <AnexosModal solicitacaoId={sub.id} onClose={() => setShowAnexos(false)} />
        </div>
      )}

      {/* ── Hover actions ── */}
      {(hov || confirmDel) && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: 8, right: 8,
            display: 'flex', gap: 4, animation: 'fadeIn 0.12s ease both',
          }}
        >
          {!confirmDel ? (
            <>
              {/* Editar */}
              <button
                type="button"
                title="Editar"
                onClick={e => { e.stopPropagation(); onClick(sub.id); }}
                style={{
                  width: 26, height: 26, borderRadius: 7, border: '1px solid var(--gray3)',
                  background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--yellow)'; e.currentTarget.style.color = 'var(--yellow)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray3)'; e.currentTarget.style.color = 'inherit'; }}
              >
                <svg width={12} height={12} viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {/* Excluir */}
              {onDelete && (
                <button
                  type="button"
                  title="Excluir"
                  onClick={e => { e.stopPropagation(); setConfirmDel(true); }}
                  style={{
                    width: 26, height: 26, borderRadius: 7, border: '1px solid rgba(220,38,38,0.25)',
                    background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = '#DC2626'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.25)'; }}
                >
                  <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                    <path d="M2 3h8M4.5 3V2h3v1M3.5 3l.6 7h3.8l.6-7" stroke="#DC2626" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </>
          ) : (
            /* mini confirm */
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'var(--white)', border: '1px solid var(--gray3)', borderRadius: 8, padding: '4px 8px', boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginRight: 2 }}>Excluir?</span>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete?.(sub.id); }}
                style={{ padding: '2px 8px', borderRadius: 5, border: 'none', background: '#DC2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              >Sim</button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setConfirmDel(false); }}
                style={{ padding: '2px 8px', borderRadius: 5, border: '1px solid var(--gray3)', background: 'none', color: 'var(--gray2)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >Não</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ───────────────────────────────────
/** Carência antes de uma etapa recolhida expandida voltar a recolher (ms). */
const COLLAPSED_STICKY_MS = 2000;
/** Tempo parado sobre a etapa recolhida antes dela expandir - evita que só
 *  atravessar o board com o mouse dispare a expansão (hover intent). */
const COLLAPSED_HOVER_INTENT_MS = 200;

function KanbanColumn({
  status, cards, onDragStart, onDrop, onClick, dragOver, setDragOver, onPrefetch, onCancelPrefetch, onDelete, isDragging, onToggleCollapsed,
}: {
  status: StatusConfig;
  cards: Submission[];
  onDragStart: (id: string) => void;
  onDrop: (statusId: number) => void;
  onClick: (id: string) => void;
  dragOver: number | null;
  setDragOver: (id: number | null) => void;
  onPrefetch?: (id: string) => void;
  onCancelPrefetch?: (id: string) => void;
  onDelete?: (id: string) => void;
  /** Há um card sendo arrastado no board - destaca as faixas recolhidas como alvo. */
  isDragging?: boolean;
  /** Marca/desmarca a etapa como pontual - fica recolhida no board mesmo com cards. */
  onToggleCollapsed?: (id: number, next: boolean) => void;
}) {
  const isOver = dragOver === status.id;

  // Etapa recolhida: abre só com intenção (mouse parado em cima por um tempo, ou
  // card arrastado até ela) e continua aberta por uma carência depois que a
  // interação termina - senão colunas vizinhas ficariam abrindo e fechando
  // conforme o mouse atravessa o board.
  const [openSticky, setOpenSticky] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearOpenTimer = () => { if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null; } };
  const clearCloseTimer = () => { if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; } };
  useEffect(() => () => { clearOpenTimer(); clearCloseTimer(); }, []);

  // Abre na hora e segura - usado pelo arraste, que não espera intenção
  function holdOpen() {
    clearOpenTimer();
    clearCloseTimer();
    setOpenSticky(true);
  }
  // Mouse chegou: só abre se ficar parado sobre a etapa pela carência de intenção
  function hoverEnter() {
    clearCloseTimer();
    if (openSticky) return;
    clearOpenTimer();
    openTimer.current = setTimeout(() => setOpenSticky(true), COLLAPSED_HOVER_INTENT_MS);
  }
  // Saiu: cancela uma abertura ainda pendente e agenda o fechamento
  function hoverLeave() {
    clearOpenTimer();
    scheduleClose();
  }
  // Fecha só depois da carência, contada a partir daqui
  function scheduleClose() {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpenSticky(false), COLLAPSED_STICKY_MS);
  }

  // Recolhe quando a etapa está vazia (padrão de todo o board) ou quando ela foi
  // marcada como pontual pelo botão do próprio cabeçalho - aí recolhe mesmo tendo cards.
  const collapsible = cards.length === 0 || !!status.always_collapsed;

  // Botão do cabeçalho: alterna a etapa pontual. Ao marcar, segura a coluna aberta
  // pela carência antes de ela recolher, para a mudança acontecer à vista.
  function toggleCollapsed(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !status.always_collapsed;
    onToggleCollapsed?.(Number(status.id), next);
    if (next) { holdOpen(); scheduleClose(); }
  }

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(status.id); if (collapsible) holdOpen(); },
    onDragLeave: () => { setDragOver(null); if (collapsible) scheduleClose(); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setDragOver(null); if (collapsible) scheduleClose(); onDrop(status.id); },
    ...(collapsible ? { onMouseEnter: hoverEnter, onMouseLeave: hoverLeave } : {}),
  };

  // Valor total das operações nesta etapa (usa valor_numerico; cai no parse da string BRL se ausente)
  const colTotal = cards.reduce((sum, c) => sum + (typeof c.valor_numerico === 'number' ? c.valor_numerico : parseCurrencyBRL(c.valor ?? '')), 0);
  // Na etapa de conversão (Executada), ordena pela data de execução - a última executada no topo.
  const orderedCards = status.is_conversion
    ? [...cards].sort((a, b) => String(b.data_execucao ?? '').localeCompare(String(a.data_execucao ?? '')))
    : cards;

  const classes = [
    'kanban-column',
    collapsible ? 'kanban-column-collapsible' : '',
    collapsible && openSticky ? 'is-open' : '',
    collapsible && isDragging ? 'drop-ready' : '',
    isOver ? 'drag-over' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{ '--col-color': status.cor } as any}
      {...dropHandlers}
    >
      {/* Trilho: o que sobra da coluna quando ela está recolhida */}
      {collapsible && (
        <div className="kanban-rail" aria-hidden="true">
          <span className="kanban-dot" style={{ background: status.cor }} />
          {cards.length > 0 && <span className="kanban-rail-count">{cards.length}</span>}
        </div>
      )}
      <div className="kanban-column-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="kanban-column-title">
            <span className="kanban-dot" style={{ background: status.cor }} />
            {status.nome}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {onToggleCollapsed && (
              <button
                className={`kanban-collapse-btn${status.always_collapsed ? ' is-on' : ''}`}
                onClick={toggleCollapsed}
                title={status.always_collapsed
                  ? 'Etapa pontual: fica recolhida no board. Clique para mantê-la sempre aberta.'
                  : 'Manter esta etapa recolhida no board, mesmo com cards dentro'}
              >
                {status.always_collapsed ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M9 7l-5 5 5 5M15 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M20 17l-5-5 5-5M4 7l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            )}
            <span className="kanban-count">{cards.length}</span>
          </div>
        </div>
        {colTotal > 0 && (
          <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gray)', letterSpacing: '-0.01em' }}>
            {colTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </div>
        )}
      </div>
      <div className="kanban-column-body">
        {orderedCards.map(sub => (
          <KanbanCard key={sub.id} sub={sub} onDragStart={onDragStart} onClick={onClick} color={status.cor} onPrefetch={onPrefetch} onCancelPrefetch={onCancelPrefetch} onDelete={onDelete} hideAging={!!(status.is_conversion || status.is_excluded)} />
        ))}
        {cards.length === 0 && (
          <div className="kanban-empty-slot">Arraste cards aqui</div>
        )}
      </div>
    </div>
  );
}

// ── Detail Skeleton ───────────────────────────────────
function DetailSkeleton() {
  return (
    <div className="admin-modal-body sk-wrap">
      {/* Partes envolvidas */}
      <section>
        <SkeletonBlock w={130} h={9} radius={4} />
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center' }}>
          <div style={{ background: 'var(--gray3)', borderRadius: 10, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonBlock w={55} h={8} radius={3} />
            <SkeletonBlock w="82%" h={13} radius={5} />
            <SkeletonBlock w="60%" h={10} radius={4} />
          </div>
          <span style={{ fontSize: 18, color: 'var(--gray2)', padding: '0 4px' }}>→</span>
          <div style={{ background: 'var(--gray3)', borderRadius: 10, padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SkeletonBlock w={55} h={8} radius={3} />
            <SkeletonBlock w="75%" h={13} radius={5} />
            <SkeletonBlock w="65%" h={10} radius={4} />
          </div>
        </div>
      </section>

      {/* Dados da operação */}
      <section>
        <SkeletonBlock w={145} h={9} radius={4} />
        <div style={{ marginTop: 12, display: 'flex', gap: 20 }}>
          {[1, 1, 1].map((_, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonBlock w="55%" h={8} radius={3} />
              <SkeletonBlock w="80%" h={14} radius={5} />
            </div>
          ))}
        </div>
      </section>

      {/* Avaliação da operação */}
      <section>
        <SkeletonBlock w={165} h={9} radius={4} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                border: '1.5px solid var(--gray3)',
                borderRadius: 10,
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                opacity: 1 - i * 0.18,
              }}
            >
              <SkeletonBlock w={`${58 - i * 4}%`} h={11} radius={4} />
              <SkeletonBlock w={40} h={22} radius={100} />
            </div>
          ))}
        </div>
      </section>

      {/* Anexos */}
      <section>
        <SkeletonBlock w={90} h={9} radius={4} />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1].map(i => (
            <div
              key={i}
              style={{
                border: '1px solid var(--gray3)',
                borderRadius: 10,
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                opacity: 1 - i * 0.25,
              }}
            >
              <SkeletonBlock w={34} h={34} radius={8} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SkeletonBlock w={`${65 - i * 10}%`} h={11} radius={4} />
                <SkeletonBlock w={48} h={9} radius={3} />
              </div>
              <SkeletonBlock w={70} h={22} radius={100} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────
function SkeletonBlock({ w, h, radius = 6 }: { w: string | number; h: string | number; radius?: number }) {
  return (
    <div className="sk-block" style={{ width: w, height: h, borderRadius: radius }} />
  );
}

function SolicitacoesSkeleton({ view }: { view: 'kanban' | 'lista' }) {
  if (view === 'kanban') {
    return (
      <div className="kanban-board sk-wrap">
        {[0, 1, 2, 3].map(col => (
          <div key={col} className="kanban-column" style={{ opacity: 1 - col * 0.12, pointerEvents: 'none' }}>
            <div className="kanban-column-header">
              <SkeletonBlock w={90} h={12} radius={6} />
              <SkeletonBlock w={22} h={22} radius={11} />
            </div>
            <div className="kanban-column-body">
              {Array.from({ length: 3 - (col % 2) }).map((_, i) => (
                <div key={i} className="kanban-card" style={{ pointerEvents: 'none', gap: 8 }}>
                  <SkeletonBlock w="65%" h={12} />
                  <SkeletonBlock w="85%" h={10} />
                  <SkeletonBlock w="50%" h={10} />
                  <SkeletonBlock w="90%" h={20} radius={100} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="admin-table-wrap sk-wrap">
      <table className="admin-table" style={{ tableLayout: 'fixed' }}>
        <thead>
          <tr>
            {[200, 150, 110, 100, 90, 70].map((w, i) => (
              <th key={i} style={{ width: w }}><SkeletonBlock w="70%" h={11} /></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} style={{ opacity: 1 - i * 0.12 }}>
              <td><div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><SkeletonBlock w="80%" h={12} /><SkeletonBlock w="50%" h={10} /></div></td>
              <td><SkeletonBlock w="75%" h={12} /></td>
              <td><SkeletonBlock w={80} h={22} radius={100} /></td>
              <td><SkeletonBlock w="65%" h={12} /></td>
              <td><SkeletonBlock w={70} h={22} radius={100} /></td>
              <td><SkeletonBlock w={28} h={28} radius={8} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────
export default function SolicitacoesPage({ token, openCard, onCardOpened }: {
  token: string;
  // Card vindo da busca rápida - abre o painel de detalhe ao entrar na página.
  openCard?: { id: string; nonce: number };
  onCardOpened?: () => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<StatusConfig[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [filterCedente, setFilterCedente] = useState<string[]>([]);
  const [filterSacado, setFilterSacado] = useState<string[]>([]);
  const [filterFluxo, setFilterFluxo] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  // Conversão pendente via drag-and-drop: exige registrar a data de execução
  const [pendingConv, setPendingConv] = useState<{ subId: string; statusId: number } | null>(null);
  // Sair da etapa de conversão pelo kanban (limpa a data de execução) → confirmação
  const [pendingClearExec, setPendingClearExec] = useState<{ subId: string; statusId: number } | null>(null);
  // Mover (kanban) para etapa que exige pendências → registrar antes
  const [pendingBoardPend, setPendingBoardPend] = useState<{ subId: string; statusId: number; existentes: PendItem[] } | null>(null);
  const [savingBoardPend, setSavingBoardPend] = useState(false);
  const prefetchCache = useRef<Map<string, any>>(new Map());
  const prefetchTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const boardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll horizontal suave enquanto arrasta um card até as bordas do board.
  useEffect(() => {
    if (!draggedId) return;
    const el = boardRef.current;
    if (!el) return;
    let raf = 0;
    let clientX = -1;
    const onOver = (e: DragEvent) => { clientX = e.clientX; };
    const onEnd = () => { setDraggedId(null); setDragOverCol(null); };
    const EDGE = 110;      // largura da zona sensível (px)
    const MAX_SPEED = 26;  // velocidade máxima por frame (px)
    const loop = () => {
      if (clientX >= 0) {
        const rect = el.getBoundingClientRect();
        const left = clientX - rect.left;
        const right = rect.right - clientX;
        let dx = 0;
        if (left < EDGE) dx = -MAX_SPEED * (1 - Math.max(0, left) / EDGE);
        else if (right < EDGE) dx = MAX_SPEED * (1 - Math.max(0, right) / EDGE);
        // Curva de aceleração (ease-in) para ficar mais natural perto da borda
        if (dx !== 0) el.scrollLeft += Math.sign(dx) * Math.pow(Math.abs(dx) / MAX_SPEED, 1.5) * MAX_SPEED;
      }
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragend', onEnd);
    window.addEventListener('drop', onEnd);
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragend', onEnd);
      window.removeEventListener('drop', onEnd);
      cancelAnimationFrame(raf);
    };
  }, [draggedId]);

  function prefetch(id: string) {
    if (prefetchCache.current.has(id)) return;
    // 300ms: só pré-carrega o detalhe de cards em que o mouse realmente pausa,
    // não dos que ele apenas atravessa. Corta buscas (e rows read) sem perder a
    // sensação de instantâneo ao abrir. Abaixo disso, varrer o board dispara um
    // fetch por card sob o cursor.
    const timer = setTimeout(() => {
      prefetchTimers.current.delete(id);
      fetch('/api/admin-data?action=detail&id=' + id, { headers: { 'x-admin-session': token } })
        .then(r => r.json())
        .then(data => prefetchCache.current.set(id, data))
        .catch(() => {});
    }, 300);
    prefetchTimers.current.set(id, timer);
  }

  function cancelPrefetch(id: string) {
    const timer = prefetchTimers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      prefetchTimers.current.delete(id);
    }
  }

  // Etapa pontual: recolhida no board mesmo com cards. Alternada pelo botão do
  // cabeçalho da própria coluna - otimista, com rollback se o servidor recusar.
  async function toggleAlwaysCollapsed(id: number, next: boolean) {
    setStatuses(prev => prev.map(s => Number(s.id) === id ? { ...s, always_collapsed: next ? 1 : 0 } : s));
    try {
      await api('', 'POST', { action: 'toggle_always_collapsed', id });
      toast('success', next ? 'Etapa ficará recolhida no board' : 'Etapa volta a aparecer expandida');
    } catch {
      setStatuses(prev => prev.map(s => Number(s.id) === id ? { ...s, always_collapsed: next ? 0 : 1 } : s));
      toast('error', 'Não foi possível alterar a etapa');
    }
  }

  async function loadBoard() {
    setLoading(true);
    try {
      const data = await api('?action=board');
      setStatuses(data.statuses ?? []);
      setSubmissions(data.submissions ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadBoard(); }, []);

  // Busca rápida pediu um card específico
  useEffect(() => {
    if (!openCard) return;
    setSelectedId(openCard.id);
    onCardOpened?.();
  }, [openCard?.nonce]);

  function commitMove(subId: string, statusId: number) {
    const statusName = statuses.find(s => Number(s.id) === statusId)?.nome;
    setSubmissions(prev => prev.map(s => s.id === subId
      ? { ...s, current_status_id: statusId, status_since: new Date().toISOString() }
      : s
    ));
    api('', 'POST', { action: 'move', solicitacao_id: subId, status_id: statusId });
    toast('success', statusName ? `Movido para "${statusName}"` : 'Status atualizado');
  }

  function handleDrop(statusId: number) {
    if (!draggedId) return;
    const sub = submissions.find(s => s.id === draggedId);
    if (!sub || sub.current_status_id === statusId) { setDraggedId(null); return; }
    const subId = draggedId;
    setDraggedId(null);
    const cfg = statuses.find(s => Number(s.id) === statusId);
    const curCfg = statuses.find(s => Number(s.id) === Number(sub.current_status_id));
    // Sair da etapa de conversão com data registrada → confirmar limpeza
    if (curCfg?.is_conversion && !cfg?.is_conversion && sub.data_execucao) {
      setPendingClearExec({ subId, statusId });
      return;
    }
    // Etapa de conversão: registra a data de execução antes de mover
    if (cfg?.is_conversion) {
      setPendingConv({ subId, statusId });
      return;
    }
    // Etapa que exige pendências: registrar antes de mover. Busca as pendências
    // abertas do card para pré-preencher o modal (segue com elas, edita ou adiciona).
    if (cfg?.requires_pendencia) {
      api(`?action=pendencias_by_solicitacao&solicitacao_id=${subId}`)
        .then(r => {
          const existentes: PendItem[] = (r?.pendencias ?? [])
            .filter((p: any) => !p.resolvida)
            .map((p: any) => ({ id: p.id, descricao: p.descricao, categoria: normPendCat(p.categoria) }));
          setPendingBoardPend({ subId, statusId, existentes });
        })
        .catch(() => setPendingBoardPend({ subId, statusId, existentes: [] }));
      return;
    }
    commitMove(subId, statusId);
  }

  async function confirmBoardPendencia(itens: PendItem[]) {
    if (!pendingBoardPend) return;
    const { subId, statusId, existentes } = pendingBoardPend;
    setSavingBoardPend(true);
    try {
      const orig = new Map(existentes.map(p => [p.id, p]));
      const novas = itens.filter(i => !i.id && i.descricao.trim()).map(i => ({ descricao: i.descricao.trim(), categoria: i.categoria }));
      const editadas = itens.filter(i => i.id && (orig.get(i.id)?.descricao !== i.descricao.trim() || orig.get(i.id)?.categoria !== i.categoria));
      if (novas.length) await api('', 'POST', { action: 'add_pendencias', solicitacao_id: subId, status_id: statusId, itens: novas });
      for (const e of editadas) await api('', 'POST', { action: 'update_pendencia', id: e.id, descricao: e.descricao.trim(), categoria: e.categoria });
      // Só as novas aumentam a contagem; as existentes já estavam contabilizadas.
      if (novas.length) setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, pendencia_aberta_count: (s.pendencia_aberta_count ?? 0) + novas.length, pendencia_total_count: (s.pendencia_total_count ?? 0) + novas.length } : s));
      setPendingBoardPend(null);
      commitMove(subId, statusId);
    } finally {
      setSavingBoardPend(false);
    }
  }

  async function confirmBoardConversion(date: string) {
    if (!pendingConv) return;
    const { subId, statusId } = pendingConv;
    await api('', 'POST', { action: 'patch_submission', id: subId, field: 'data_execucao', value: date });
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, data_execucao: date } : s));
    setPendingConv(null);
    commitMove(subId, statusId);
  }

  async function confirmBoardClearExec() {
    if (!pendingClearExec) return;
    const { subId, statusId } = pendingClearExec;
    setPendingClearExec(null);
    await api('', 'POST', { action: 'patch_submission', id: subId, field: 'data_execucao', value: null });
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, data_execucao: null } : s));
    commitMove(subId, statusId);
  }

  function handleMoved(id: string, statusId: number) {
    setSubmissions(prev => prev.map(s => s.id === id
      ? { ...s, current_status_id: statusId, status_since: new Date().toISOString() }
      : s
    ));
  }

  function handleDeleted(id: string) {
    setSubmissions(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
  }

  async function handleQuickDelete(id: string) {
    try {
      await api('', 'POST', { action: 'delete_submission', id });
      handleDeleted(id);
      toast('success', 'Solicitação excluída');
    } catch {
      toast('error', 'Erro ao excluir solicitação');
    }
  }

  function handleEdited(id: string, fields: Partial<Submission>) {
    // Atualização otimista - sem refetch (evita corrida com o move e sobrescrita de estado)
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s));
  }

  // Filter options derived from submissions
  const unique = <T,>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v != null && v !== ''))];

  const cedenteOptions = unique(submissions.map(s => s.nome_contratado))
    .map(v => ({ value: v, label: v }));
  const sacadoOptions = unique(submissions.map(s => s.nome_sacado))
    .map(v => ({ value: v, label: v }));
  const fluxoOptions = FIM_SELECT_OPTIONS;
  const statusOptions = statuses.map(s => ({ value: String(s.id), label: s.nome }));

  const hasFilter = filterCedente.length > 0 || filterSacado.length > 0 || filterFluxo.length > 0 || filterStatus.length > 0;

  function clearFilters() {
    setFilterCedente([]);
    setFilterSacado([]);
    setFilterFluxo([]);
    setFilterStatus([]);
  }

  // Filter
  const filtered = submissions.filter(s => {
    if (filterCedente.length > 0 && !filterCedente.includes(s.nome_contratado ?? '')) return false;
    if (filterSacado.length > 0 && !filterSacado.includes(s.nome_sacado ?? '')) return false;
    if (filterFluxo.length > 0 && !filterFluxo.includes(String(s.fim_type ?? ''))) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(String(s.current_status_id ?? ''))) return false;
    return true;
  });

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = [...filtered].sort((a, b) => {
    let va: any, vb: any;
    if (sortCol === 'created_at') { va = a.created_at; vb = b.created_at; }
    else if (sortCol === 'nome_contratado') { va = a.nome_contratado ?? ''; vb = b.nome_contratado ?? ''; }
    else if (sortCol === 'nome_sacado') { va = a.nome_sacado ?? ''; vb = b.nome_sacado ?? ''; }
    else if (sortCol === 'valor') {
      va = parseFloat((a.valor ?? '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
      vb = parseFloat((b.valor ?? '0').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    }
    else if (sortCol === 'prazo_limite') { va = a.prazo_limite ?? ''; vb = b.prazo_limite ?? ''; }
    else if (sortCol === 'status') {
      va = statuses.find(x => Number(x.id) === a.current_status_id)?.nome ?? '';
      vb = statuses.find(x => Number(x.id) === b.current_status_id)?.nome ?? '';
    }
    else if (sortCol === 'fim_type') { va = a.fim_type ?? 0; vb = b.fim_type ?? 0; }
    else if (sortCol === 'arquivo_count') { va = a.arquivo_count; vb = b.arquivo_count; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const statusByName = (name: string) => statuses.find(s => s.nome.toLowerCase() === name.toLowerCase());
  const countByStatus = (name: string) => {
    const st = statusByName(name);
    return st ? submissions.filter(s => s.current_status_id === Number(st.id)).length : 0;
  };
  const executadaSt = statusByName('Executada');
  const reprovadaSt = statusByName('Reprovada');
  const doneIds = new Set([executadaSt?.id, reprovadaSt?.id].filter(Boolean).map(Number));
  const pendentes = submissions.filter(s => !doneIds.has(s.current_status_id as number)).length;

  // Lead time médio: tempo de vida de cada solicitação (criação → conclusão, ou → agora se em aberto)
  const leadTimeMedioMs = (() => {
    if (submissions.length === 0) return 0;
    const now = Date.now();
    const total = submissions.reduce((acc, s) => {
      const start = s.created_at ? new Date(s.created_at).getTime() : now;
      const done = doneIds.has(s.current_status_id as number) && s.status_since ? new Date(s.status_since).getTime() : now;
      return acc + Math.max(0, done - start);
    }, 0);
    return total / submissions.length;
  })();

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Solicitações</h1>
          <p className="admin-page-desc">Gerencie e acompanhe todas as solicitações de operação recebidas.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button className="admin-toolbar-btn" onClick={loadBoard} title="Atualizar" disabled={loading}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              style={{ animation: loading ? 'spin 0.7s linear infinite' : undefined }}
            >
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}>
            + Nova solicitação
          </button>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="admin-stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="admin-stat-card-v2" style={{ '--accent-color': 'var(--gray3)', gap: 8, animationDelay: `${i * 0.05}s` } as any}>
              <SkeletonBlock w="55%" h={11} />
              <SkeletonBlock w={44} h={30} radius={6} />
              <SkeletonBlock w="70%" h={10} />
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-stats">
          <div className="admin-stat-card-v2" style={{ '--accent-color': 'var(--yellow)', animationDelay: '0s' } as any}>
            <p className="stat-v2-label">Total de solicitações</p>
            <p className="stat-v2-value">{submissions.length}</p>
            <p className="stat-v2-desc">recebidas no sistema</p>
          </div>
          <div className="admin-stat-card-v2" style={{ '--accent-color': '#6366F1', animationDelay: '0.05s' } as any}>
            <p className="stat-v2-label">Em andamento</p>
            <p className="stat-v2-value">{pendentes}</p>
            <p className="stat-v2-desc">aguardando resolução</p>
          </div>
          {executadaSt && (
            <div
              className={`admin-stat-card-v2${filterStatus.includes(String(executadaSt.id)) ? ' active-filter' : ''}`}
              style={{ '--accent-color': executadaSt.cor, animationDelay: '0.1s', cursor: 'pointer' } as any}
              onClick={() => setFilterStatus(filterStatus.includes(String(executadaSt.id)) ? filterStatus.filter(x => x !== String(executadaSt.id)) : [...filterStatus, String(executadaSt.id)])}
            >
              <p className="stat-v2-label">Executadas</p>
              <p className="stat-v2-value">{countByStatus('Executada')}</p>
              <p className="stat-v2-desc">operações concluídas</p>
            </div>
          )}
          {reprovadaSt && (
            <div
              className={`admin-stat-card-v2${filterStatus.includes(String(reprovadaSt.id)) ? ' active-filter' : ''}`}
              style={{ '--accent-color': reprovadaSt.cor, animationDelay: '0.15s', cursor: 'pointer' } as any}
              onClick={() => setFilterStatus(filterStatus.includes(String(reprovadaSt.id)) ? filterStatus.filter(x => x !== String(reprovadaSt.id)) : [...filterStatus, String(reprovadaSt.id)])}
            >
              <p className="stat-v2-label">Reprovadas</p>
              <p className="stat-v2-value">{countByStatus('Reprovada')}</p>
              <p className="stat-v2-desc">não prosseguiram</p>
            </div>
          )}
          <div className="admin-stat-card-v2" style={{ '--accent-color': '#0EA5E9', animationDelay: '0.2s' } as any}>
            <p className="stat-v2-label">Lead time médio</p>
            <p className="stat-v2-value">{fmtDuracao(leadTimeMedioMs)}</p>
            <p className="stat-v2-desc">da criação à conclusão</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!loading && <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filtrar</span>
        <FilterDropdown label="Cedente" values={filterCedente} options={cedenteOptions} onChange={setFilterCedente} />
        <FilterDropdown label="Sacado" values={filterSacado} options={sacadoOptions} onChange={setFilterSacado} />
        <FilterDropdown label="Tipo de pagamento" values={filterFluxo} options={fluxoOptions} onChange={setFilterFluxo} />
        <FilterDropdown label="Status" values={filterStatus} options={statusOptions} onChange={setFilterStatus} />
        {hasFilter && (
          <button
            style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}
            onClick={clearFilters}
          >
            Limpar
          </button>
        )}
        <div className="admin-toolbar-spacer" />
        <div className="view-toggle">
          <div className="view-toggle-pill" style={{ left: view === 'kanban' ? 3 : 35 }} />
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')} title="Kanban">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="3" width="7" height="11" rx="2" stroke="currentColor" strokeWidth="1.8"/></svg>
          </button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} title="Lista">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
      </div>}

      {loading ? (
        <SolicitacoesSkeleton view={view} />
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>Nenhuma solicitação encontrada</p>
        </div>
      ) : view === 'kanban' ? (
        <div className="kanban-board" ref={boardRef}>
          {statuses.map(st => (
            <KanbanColumn
              key={st.id}
              status={st}
              cards={filtered.filter(s => s.current_status_id === Number(st.id))}
              onDragStart={setDraggedId}
              onDrop={handleDrop}
              onClick={setSelectedId}
              dragOver={dragOverCol}
              setDragOver={setDragOverCol}
              onPrefetch={prefetch}
              onCancelPrefetch={cancelPrefetch}
              onDelete={handleQuickDelete}
              isDragging={draggedId !== null}
              onToggleCollapsed={toggleAlwaysCollapsed}
            />
          ))}
          {/* Unassigned column */}
          {filtered.some(s => !s.current_status_id) && (() => {
            const semEtapa = filtered.filter(s => !s.current_status_id);
            const total = semEtapa.reduce((sum, c) => sum + (typeof c.valor_numerico === 'number' ? c.valor_numerico : parseCurrencyBRL(c.valor ?? '')), 0);
            return (
            <div className="kanban-column" style={{ '--col-color': '#aaa' } as any}>
              <div className="kanban-column-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="kanban-column-title">
                    <span className="kanban-dot" style={{ background: '#aaa' }} />Sem etapa
                  </div>
                  <span className="kanban-count">{semEtapa.length}</span>
                </div>
                {total > 0 && (
                  <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--gray)', letterSpacing: '-0.01em' }}>
                    {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                )}
              </div>
              <div className="kanban-column-body">
                {semEtapa.map(sub => (
                  <KanbanCard key={sub.id} sub={sub} onDragStart={setDraggedId} onClick={setSelectedId} onPrefetch={prefetch} onCancelPrefetch={cancelPrefetch} />
                ))}
              </div>
            </div>
            );
          })()}
        </div>
      ) : (
        /* Lista */
        <div className="admin-table-wrap animate">
          <table className="admin-table">
            <thead>
              <tr>
                {([
                  ['created_at', 'Data'],
                  ['nome_contratado', 'Cedente'],
                  ['nome_sacado', 'Sacado'],
                  ['valor', 'Valor'],
                  ['prazo_limite', 'Prazo'],
                  ['status', 'Etapa'],
                  ['fim_type', 'Fluxo'],
                  ['arquivo_count', 'Arq.'],
                ] as [string, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    className={`sortable-th${sortCol === col ? ' sorted' : ''}`}
                    onClick={() => toggleSort(col)}
                  >
                    {label}
                    <span className="sort-arrow">
                      {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const st = statuses.find(x => Number(x.id) === s.current_status_id);
                const fim = s.fim_type ? FIM_LABELS[s.fim_type] : null;
                return (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{s.nome_contratado ?? '-'}</p>
                      <p className="admin-cell-sub">{s.cnpj_contratado ?? ''}</p>
                    </td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{s.nome_sacado ?? '-'}</p>
                      <p className="admin-cell-sub">{s.cnpj_sacado ?? ''}</p>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.valor ?? '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{formatPrazo(s.prazo_limite as string)}</td>
                    <td>
                      {st ? (
                        <span className="admin-badge" style={{ background: `${st.cor}18`, color: st.cor }}>{st.nome}</span>
                      ) : <span style={{ color: 'var(--gray2)', fontSize: 12 }}>-</span>}
                    </td>
                    <td>
                      {fim && <span className="admin-badge" style={{ background: fim.bg, color: fim.color }}>{fim.label}</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {s.arquivo_count > 0 ? <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconClip size={12} /> {s.arquivo_count}</span> : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <DetailPanel
          id={selectedId}
          token={token}
          onClose={() => setSelectedId(null)}
          onMoved={handleMoved}
          onDelete={handleDeleted}
          onEdited={handleEdited}
          prefetchCache={prefetchCache}
          statuses={statuses}
        />
      )}

      {showCreate && (
        <CreateModal
          statuses={statuses}
          token={token}
          onClose={() => setShowCreate(false)}
          onCreated={sub => {
            setSubmissions(prev => [sub, ...prev]);
            setShowCreate(false);
            setSelectedId(sub.id);
          }}
        />
      )}

      {pendingConv && (
        <ExecutionDateModal
          statusName={statuses.find(st => Number(st.id) === pendingConv.statusId)?.nome}
          initialDate={String(submissions.find(s => s.id === pendingConv.subId)?.data_execucao ?? '')}
          onConfirm={confirmBoardConversion}
          onCancel={() => setPendingConv(null)}
        />
      )}

      {pendingBoardPend && (
        <PendenciaMoveModal
          statusName={statuses.find(st => Number(st.id) === pendingBoardPend.statusId)?.nome ?? 'esta etapa'}
          saving={savingBoardPend}
          existentes={pendingBoardPend.existentes}
          onConfirm={confirmBoardPendencia}
          onCancel={() => setPendingBoardPend(null)}
        />
      )}

      {pendingClearExec && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setPendingClearExec(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Limpar data de execução?</p>
            <p className="delete-confirm-desc">
              Mover para <strong>{statuses.find(st => Number(st.id) === pendingClearExec.statusId)?.nome}</strong> vai
              <strong> limpar a data de execução</strong> registrada. Deseja continuar?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setPendingClearExec(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={confirmBoardClearExec}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
