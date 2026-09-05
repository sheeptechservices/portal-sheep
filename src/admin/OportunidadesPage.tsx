import { useState, useEffect, useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  Submission, StatusConfig, SubmissionDetail, Evento, EtapaArquivo, FormArquivo,
  Pendencia, ReuniaoDoCard,
} from './types';
import { useToast, useAuth } from './AdminApp';
import { DatePicker } from '../components/DatePicker';
import { ExecutionDateModal } from '../components/ExecutionDateModal';
import {
  IconAlert, IconBandeiraFinal, IconCalendario, IconChama, IconCheck, IconChevronDown, IconCiclo,
  IconClip, IconComentario, IconDoc, IconFloco, IconTermometro,
  IconDownload, IconEdit, IconExternal, IconEye, IconImage, IconInbox, IconLink,
  IconPlus, IconRecolher, IconRefresh, IconSearch, IconSpinner, IconTrash, IconVisaoLista,
  IconVisaoQuadro, IconX, IconZip, IconChevronUp, IconChevronUpDown,
} from '../components/icons';
import { SegSwitch } from '../components/SegSwitch';
import { EditorRico } from '../components/EditorRico';
import { TextoRico } from '../components/TextoRico';
import { CartaoKpi, CartoesKpiEsqueleto } from '../components/CartaoKpi';
import { CategoriaTag, ANEXO_CATEGORIAS, normalizaCategoria } from '../components/CategoriaTag';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useLarguraPainel } from '../lib/painelLateral';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import FilterDropdown from '../components/FilterDropdown';
import { Abas } from '../components/Abas';
import { Dialogo } from '../components/Dialogo';
import { dia as fmtDataBR, diaCurto as fmtDataCurta } from '../lib/datas';
import {
  Atividade, type ComentarioAtividade, type EventoAtividade,
} from '../components/Atividade';
import { SecaoReunioes, type Reuniao } from '../components/SecaoReunioes';
import { ChipReuniao } from '../components/VinculoReuniao';
import { ReuniaoModal } from '../components/ReuniaoModal';
import type { Pessoa } from './FormularioTarefa';

import { definirImagemArrasto } from '../lib/dragImage';
// ── FormSelect ───────────────────────────────────────
function FormSelect({ value, onChange, options, placeholder = '- Não definido -' }: {
  value: string;
  onChange: (v: string) => void;
  /** `icone` e `descricao` são opcionais: a maioria dos campos aqui é uma lista
   *  de palavras, e desenho em lista de palavras vira ruído. Entram onde a
   *  escolha é uma escala e a frase de apoio é a régua - temperatura e tipo de
   *  projeto -, do mesmo jeito que a urgência do cartão de chamados. */
  options: { value: string; label: string; icone?: ReactNode; descricao?: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, flipUp: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.value === value);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    // Com descrição a opção ocupa duas linhas, e é essa altura que decide se a
    // lista abre para cima.
    const alturaOpcao = options.some(o => o.descricao) ? 55 : 36;
    const dropH = Math.min(8 + (options.length + 1) * alturaOpcao, 320);
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 180), flipUp });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  // A altura de antes de montar é uma estimativa, e a opção com descrição tem
  // duas linhas: errando para mais, a lista que abre para cima nasce boiando
  // longe do campo. Medida de verdade, ela é reencostada no gatilho.
  useLayoutEffect(() => {
    if (!open || !dropRef.current || !triggerRef.current) return;
    const r = dropRef.current.getBoundingClientRect();
    const g = triggerRef.current.getBoundingClientRect();
    if (r.top >= g.top) return;
    const top = Math.max(8, g.top - 4 - r.height);
    if (Math.abs(top - r.top) < 1) return;
    setPos(p => ({ ...p, top }));
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="liquidez-trigger"
        style={{ width: '100%', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500, borderColor: open ? 'var(--yellow)' : undefined, boxShadow: open ? '0 0 0 4px var(--yd)' : undefined }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0,
          color: current ? 'var(--gray)' : 'var(--gray2)' }}>
          {current?.icone}
          {current?.label ?? placeholder}
        </span>
        <span style={{ display: 'inline-flex', transition: 'transform var(--transition)', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}><IconChevronDown size={10} /></span>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10000 }}>
          <div className={`status-select-option${!value ? ' active' : ''}`} onClick={() => { onChange(''); setOpen(false); }}>
            <span style={{ color: 'var(--gray2)' }}>{placeholder}</span>
            {!value && <span style={{ display: 'inline-flex', marginLeft: 'auto' }}><IconCheck size={12} /></span>}
          </div>
          {options.map(opt => (
            <div key={opt.value} className={`status-select-option${value === opt.value ? ' active' : ''}`} onClick={() => { onChange(opt.value); setOpen(false); }}>
              {/* Com duas linhas o desenho sobe para o topo: centrado ao lado
                  delas ele cai no meio das duas, longe do nome a que se refere. */}
              <span style={{
                display: 'inline-flex', gap: 9, minWidth: 0,
                alignItems: opt.descricao ? 'flex-start' : 'center',
              }}>
                {opt.icone && <span style={{ display: 'inline-flex', marginTop: opt.descricao ? 1 : 0 }}>{opt.icone}</span>}
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block' }}>{opt.label}</span>
                  {opt.descricao && <span className="select-opcao-descricao">{opt.descricao}</span>}
                </span>
              </span>
              {value === opt.value && <span style={{ display: 'inline-flex', marginLeft: 'auto' }}><IconCheck size={12} /></span>}
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
        <span style={{ display: 'inline-flex', transition: 'transform var(--transition)', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}><IconChevronDown size={9} /></span>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10001 }}>
          {ANEXO_CATEGORIAS.map(c => (
            <div key={c} className={`status-select-option${value === c ? ' active' : ''}`} onClick={e => { e.stopPropagation(); onChange(c); setOpen(false); }}>
              <span>{c}</span>
              {value === c && <span style={{ display: 'inline-flex', marginLeft: 'auto' }}><IconCheck size={12} /></span>}
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
        <span style={{ display: 'inline-flex', transition: 'transform var(--transition)', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}><IconChevronDown size={9} /></span>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10002 }}>
          {PENDENCIA_CATEGORIAS.map(c => (
            <div key={c} className={`status-select-option${value === c ? ' active' : ''}`} onClick={e => { e.stopPropagation(); onChange(c); setOpen(false); }}>
              <span>{c}</span>
              {value === c && <span style={{ display: 'inline-flex', marginLeft: 'auto' }}><IconCheck size={12} /></span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/** Ao mover uma oportunidade para uma etapa de descarte, pergunta por quê. Funil
 *  perdido sem motivo não ensina nada a quem for prospectar depois - e o
 *  motivo fica na ficha, à vista de quem reabrir a conversa. */
function MotivoPerdaModal({ statusName, inicial = '', onConfirm, onCancel }: {
  statusName: string;
  inicial?: string;
  onConfirm: (motivo: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState(inicial);
  // Confirmar e cancelar saem pela mesma animação, e quem cuida disso agora é o
  // diálogo da casa.

  return (
    <Dialogo
      titulo="Por que esta oportunidade se perdeu?"
      descricao={<>
        Para mover para <strong>{statusName}</strong>, conte em uma linha o que
        aconteceu: preço, prazo, concorrente, sumiu.
      </>}
      rotuloOk="Registrar perda" perigo={false} ocupado={!motivo.trim()}
      zIndex={1200}
      onFechar={onCancel}
      onConfirmar={() => void onConfirm(motivo.trim())}
    >
        <div className="form-group" style={{ margin: '16px 0 20px' }}>
          <textarea className="form-input" rows={3} value={motivo} autoFocus
            style={{ fontSize: 13, resize: 'none' }}
            placeholder="Achou caro e ficou com o fornecedor atual"
            onChange={e => setMotivo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && motivo.trim()) void onConfirm(motivo.trim()); }} />
        </div>
    </Dialogo>
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

  return (
    <Dialogo
      titulo="Registrar pendências"
      descricao={temExistentes ? (
        <>Este card já tem <strong>{existentes!.length} pendência{existentes!.length > 1 ? 's' : ''}</strong> registrada{existentes!.length > 1 ? 's' : ''}.
        Você pode seguir com {existentes!.length > 1 ? 'elas' : 'ela'}, editar ou adicionar novas antes de mover para <strong>{statusName}</strong>.</>
      ) : (
        <>Antes de mover para <strong>{statusName}</strong>, informe o que está pendente. Pelo menos uma é obrigatória.</>
      )}
      rotuloOk="Confirmar e mover" perigo={false}
      ocupado={!valid || saving} ocupadoRotulo={saving ? 'Movendo…' : undefined}
      zIndex={1200} largura={Math.min(500, typeof window === 'undefined' ? 500 : window.innerWidth - 32)}
      onFechar={onCancel}
      onConfirmar={enviar}
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '14px 0', textAlign: 'left' }}>
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
    </Dialogo>
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
              background: abertas > 0 ? 'rgba(180,83,9,.14)' : 'var(--green-soft)', color: abertas > 0 ? '#B45309' : 'var(--green)' }}>
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
                <IconTrash size={13} />
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
  statuses: Pick<StatusConfig, 'id' | 'nome' | 'cor' | 'descricao'>[];
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
    setOpen(o => !o);
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
        <IconChevronDown size={10} />
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
              // A descrição da etapa vira a dica: o nome cabe em duas palavras,
              // e o critério de quando usar cada uma nem sempre cabe.
              <div
                key={st.id}
                className={`status-select-option${isActive ? ' active' : ''}`}
                title={st.descricao ?? undefined}
                onClick={() => { onChange(Number(st.id)); setOpen(false); }}
              >
                <span className="status-select-dot" style={{ background: st.cor }} />
                <span>{st.nome}</span>
                {isActive && (
                  <span style={{ display: 'inline-flex', marginLeft: 'auto', color: st.cor }}><IconCheck size={12} /></span>
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

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Hoje em `YYYY-MM-DD`, para comparar com data guardada sem fuso. */
/** Da mais recente para a mais antiga, que é a ordem em que o servidor as
 *  entrega: uma reunião registrada agora sobre uma conversa de mês passado
 *  entra no lugar dela, e não no fim da lista. */
function ordenarReunioes(rs: Reuniao[]): Reuniao[] {
  return [...rs].sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
}

/** O diário da oportunidade em português. O funil registra outra coisa que a tarefa -
 *  aqui se move de etapa, se anexa arquivo e se edita a ficha -, e é por isso
 *  que a frase é montada de cada lado e não dentro do componente. */
function eventoDaOportunidade(e: Evento): EventoAtividade {
  const base = {
    id: e.id,
    usuario_nome: e.autor_nome ?? 'Alguém',
    criado_em: e.criado_em,
  };
  if (e.tipo === 'status_change') {
    return { ...base, texto: 'moveu', de: null, para: e.status_nome ?? 'outra etapa' };
  }
  if (e.tipo === 'arquivo') {
    // O que o servidor grava é "Arquivo: contrato.pdf"; a frase fica melhor com
    // o verbo na frente e o nome do arquivo destacado.
    const nome = (e.descricao ?? '').replace(/^Arquivo:\s*/, '');
    return { ...base, texto: 'anexou', alvo: nome || 'um arquivo', de: null, para: null };
  }
  if (e.tipo === 'edicao') {
    return { ...base, texto: e.descricao === 'Dados editados' ? 'editou a ficha' : (e.descricao ?? 'editou a oportunidade'), de: null, para: null };
  }
  return { ...base, texto: e.descricao ?? e.tipo, de: null, para: null };
}

/** Um comentário do funil no formato da conversa. As menções antigas viviam no
 *  texto (`@apelido`) e continuam sendo lidas de lá; o comentário da oportunidade não
 *  leva anexo, e por isso a lista vem vazia. */
function comentarioDaOportunidade(e: Evento): ComentarioAtividade {
  return {
    id: e.id,
    pai_id: e.parent_id,
    usuario_id: e.autor_id,
    usuario_nome: e.autor_nome ?? 'Alguém',
    foto_url: e.autor_foto ?? null,
    texto: e.descricao ?? '',
    criado_em: e.criado_em,
    editado_em: null,
    mencoes: [],
    anexos: [],
  };
}

/** Os ids marcados pela caixa de escrita, no formato que ela grava. */
const MARCA_NO_TEXTO = /@\[([^\]]+)\]\(([^)]+)\)/g;
const idsMarcados = (texto: string) =>
  [...new Set([...texto.matchAll(MARCA_NO_TEXTO)].map(m => m[2]))];

function hojeISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

/** O valor estimado da oportunidade. Sem valor, um traço: zero diria que a negociação
 *  não vale nada, e o que existe é a falta da informação. */
function fmtValor(v: number | null | undefined): string {
  if (v == null) return '-';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

/** `YYYY-MM-DD` em `dd/mm/aaaa`. */
/** De onde a oportunidade veio. Lista curta e fechada: origem digitada à mão vira dez
 *  grafias da mesma coisa e o filtro deixa de somar. */
export const ORIGENS_OPORTUNIDADE = [
  'Indicação', 'Prospecção ativa', 'Site', 'Evento', 'LinkedIn', 'Outro',
] as const;

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
                <IconDownload size={14} />
                Baixar
              </button>
            )}
            <button className="file-preview-close" onClick={onClose}>
              <IconX size={16} />
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
/** Percentual de 0 a 100, com uma casa depois da vírgula. Trava no 100 aqui, e
 *  não só na validação: um campo que aceita 250 e reclama depois faz a pessoa
 *  digitar duas vezes. */
function mascaraPorcento(raw: string): string {
  const limpo = raw.replace(/[^\d.,]/g, '').replace(',', '.');
  if (limpo === '') return '';
  const n = Number(limpo);
  if (!Number.isFinite(n)) return '';
  const preso = Math.min(100, Math.max(0, n));
  // Enquanto a pessoa digita "12." o número já é 12, e reescrever apagaria o
  // ponto que ela acabou de pôr.
  return limpo.endsWith('.') && preso === n ? limpo : String(preso);
}

// ── A oportunidade comercial ──────────────────────────────────────────────────────
//
//  Com quem se está falando, de onde veio, o que quer, quanto vale e qual é o
//  próximo passo. Os mesmos campos no cadastro e na edição - um formulário só,
//  usado pelos dois, para não existirem duas versões da mesma ficha.

/** O que uma empresa pode querer da casa. É o vocabulário dos projetos: a oportunidade
 *  que fecha vira projeto desse tipo, e duas listas diferentes obrigariam a
 *  traduzir na passagem. */
export const INTERESSES_OPORTUNIDADE = [
  'BI', 'SaaS', 'Automação', 'Integração', 'App', 'Site', 'Consultoria', 'Outro',
] as const;

/** O quanto a conversa está perto de virar negócio. Três degraus e nada entre
 *  eles: "meio quente" escrito à mão vira um quarto degrau que só quem escreveu
 *  entende, e a coluna deixa de servir para varrer o funil. */
export const TEMPERATURAS_OPORTUNIDADE = ['Quente', 'Morno', 'Frio'] as const;

/**
 * O que cada degrau quer dizer, e o desenho que o acompanha.
 *
 * A frase de apoio existe pelo mesmo motivo da urgência do cartão de chamados:
 * sem régua, "Quente" vira o padrão de todo mundo - quem cadastra está sempre
 * animado com a conversa que acabou de ter. Dizer que quente é quem já pediu
 * proposta dá o critério sem precisar de política.
 *
 * A cor vem de token e mora aqui, e não em cada uso, senão a lista e o gatilho
 * acabariam divergindo.
 */
export const TEMPERATURA_DETALHE: Record<string, { descricao: string; cor: string; icone: (p: { size?: number }) => JSX.Element }> = {
  'Quente': { descricao: 'Pediu proposta, decide em dias', cor: 'var(--red)', icone: IconChama },
  'Morno': { descricao: 'Conversa viva, sem data para decidir', cor: 'var(--amber)', icone: IconTermometro },
  'Frio': { descricao: 'Sem resposta ou sem prioridade agora', cor: 'var(--link)', icone: IconFloco },
};

/** Recorrente ou de escopo fechado. Muda o que a proposta é, e muda a conta: um
 *  contrato que se repete e uma entrega que acaba não se somam no mesmo lugar de
 *  um relatório. */
export const TIPOS_PROJETO_OPORTUNIDADE = ['Recorrente', 'Escopo fechado'] as const;

/** Os dois tipos, com o que separa um do outro: ter ou não ter linha de
 *  chegada. Sem cor - não é escala, são dois caminhos. */
export const TIPO_PROJETO_DETALHE: Record<string, { descricao: string; icone: (p: { size?: number }) => JSX.Element }> = {
  'Recorrente': { descricao: 'Cobra todo mês, sem data para acabar', icone: IconCiclo },
  'Escopo fechado': { descricao: 'Começo, meio e fim combinados', icone: IconBandeiraFinal },
};

/** As unidades da federação, na ordem em que se procura: pela sigla. Lista
 *  fechada porque estado é dado de agrupamento - "MG", "Minas" e "minas gerais"
 *  escritos à mão viram três praças diferentes no mesmo relatório. */
export const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE',
  'TO',
] as const;

/** Em que mercado a empresa atua. Diferente do interesse, que é o que ela quer
 *  da gente: uma transportadora pode querer BI. */
export const SEGMENTOS_OPORTUNIDADE = [
  'Indústria', 'Comércio', 'Serviços', 'Tecnologia', 'Saúde', 'Educação',
  'Financeiro', 'Logística', 'Agro', 'Construção', 'Varejo', 'Governo', 'Outro',
] as const;

export interface RascunhoOportunidade {
  empresa: string;
  cnpj: string;
  contato_nome: string;
  contato_cargo: string;
  contato_email: string;
  contato_telefone: string;
  cidade: string;
  estado: string;
  pais: string;
  origem: string;
  /** Quem apontou a oportunidade. Vale sobretudo quando a origem é indicação. */
  indicado_por: string;
  /** Chegou por um parceiro. */
  parceria: boolean;
  /** Quanto do negócio fica com quem trouxe, em porcento. Só com `parceria`. */
  parceria_percentual: string;
  /** Quente, Morno ou Frio. */
  temperatura: string;
  /** Recorrente ou de escopo fechado. */
  tipo_projeto: string;
  /** O mercado em que a empresa atua, e não o que ela quer da gente. */
  segmento: string;
  interesse: string;
  /** O entendimento inteiro: a operação, o problema, o que se propôs. */
  briefing: string;
  /** Guardado com máscara enquanto se digita; vira número no envio. */
  valor_estimado: string;
  responsavel_id: string;
  proxima_acao: string;
  proxima_acao_em: string;
  observacoes: string;
}

export const OPORTUNIDADE_VAZIA: RascunhoOportunidade = {
  empresa: '', cnpj: '', contato_nome: '', contato_cargo: '', contato_email: '',
  contato_telefone: '', cidade: '', estado: '',
  // Quase toda oportunidade é daqui; quem for de fora troca. Deixar em branco faria a
  // maioria preencher a mesma palavra toda vez.
  pais: 'Brasil',
  origem: '', indicado_por: '', parceria: false, parceria_percentual: '',
  temperatura: '', tipo_projeto: '', segmento: '',
  interesse: '', briefing: '', valor_estimado: '',
  responsavel_id: '', proxima_acao: '', proxima_acao_em: '', observacoes: '',
};

/** O corpo que o servidor espera, a partir do rascunho da tela. */
export function corpoDaOportunidade(r: RascunhoOportunidade) {
  return {
    empresa: r.empresa.trim(),
    cnpj: r.cnpj.trim() || null,
    contato_nome: r.contato_nome.trim() || null,
    contato_cargo: r.contato_cargo.trim() || null,
    contato_email: r.contato_email.trim() || null,
    contato_telefone: r.contato_telefone.trim() || null,
    cidade: r.cidade.trim() || null,
    estado: r.estado || null,
    pais: r.pais.trim() || null,
    origem: r.origem || null,
    indicado_por: r.indicado_por.trim() || null,
    // 0 ou 1, como a coluna guarda: o mesmo corpo vira `Partial<Submission>`
    // na tela, e um booleano ali seria um tipo a mais para a ficha conferir.
    parceria: r.parceria ? 1 : 0,
    segmento: r.segmento || null,
    interesse: r.interesse || null,
    briefing: r.briefing.trim() || null,
    temperatura: r.temperatura || null,
    tipo_projeto: r.tipo_projeto || null,
    // Sem parceria não vai percentual: o servidor limpa de qualquer forma, e
    // mandar o número aqui só faria a tela e o banco discordarem por um instante.
    parceria_percentual: r.parceria && r.parceria_percentual !== ''
      ? Number(r.parceria_percentual)
      : null,
    valor_estimado: parseCurrencyBRL(r.valor_estimado) || null,
    responsavel_id: r.responsavel_id || null,
    proxima_acao: r.proxima_acao.trim() || null,
    proxima_acao_em: r.proxima_acao_em || null,
    observacoes: r.observacoes.trim() || null,
  };
}

/** Telefone brasileiro enquanto se digita: (31) 99999-0000. */
function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** CNPJ enquanto se digita. */
function mascaraCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** A ficha da oportunidade. Serve ao cadastro e à edição: mesmos campos, mesma ordem,
 *  mesma validação - quem cadastra e quem edita olham para a mesma coisa. */
function CamposDaOportunidade({ r, set, token, pessoas }: {
  r: RascunhoOportunidade;
  set: <K extends keyof RascunhoOportunidade>(k: K, v: RascunhoOportunidade[K]) => void;
  token: string;
  pessoas: { id: string; nome: string }[];
}) {
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  // O último CNPJ consultado. Começa com o que já estava gravado: na edição,
  // passar pelo campo sem mexer nele não pode trocar o nome que a pessoa
  // ajustou à mão - só um CNPJ novo manda buscar.
  const cnpjBuscado = useRef(r.cnpj.replace(/\D/g, ''));

  /** O CNPJ preenche a empresa: quem cadastra uma oportunidade tem o cartão na mão, e
   *  digitar de novo o que a Receita já sabe é trabalho à toa. A razão social
   *  manda - se havia um apelido escrito ali, ele dá lugar ao nome de registro,
   *  que é o que vai no contrato e o que a busca vai procurar depois. */
  async function buscarCnpj(valor: string) {
    const digitos = valor.replace(/\D/g, '');
    if (digitos.length !== 14 || cnpjBuscado.current === digitos) return;
    cnpjBuscado.current = digitos;
    setBuscandoCnpj(true);
    try {
      const res = await fetch(`/api/cnpj-lookup?cnpj=${digitos}`, { headers: { 'x-admin-session': token } });
      if (!res.ok) return;
      const d = await res.json();
      const nome = d.razao_social ?? d.nome_fantasia ?? d.nome ?? '';
      if (nome) set('empresa', String(nome));
    } catch { /* sem internet ou Receita fora: a pessoa escreve o nome */ }
    finally { setBuscandoCnpj(false); }
  }

  return (
    <>
      <div className="oportunidade-campos">
        {/* O CNPJ abre o cadastro: com ele, o nome da empresa vem sozinho. A
            consulta dispara no 14º dígito, e não só ao sair do campo - quem
            colou o número não precisa de mais um gesto para ver o resultado. */}
        <div className="form-group" style={{ flex: '0 1 190px' }}>
          <label className="form-label">CNPJ</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" value={r.cnpj} autoFocus placeholder="00.000.000/0000-00"
              onChange={e => {
                const v = mascaraCnpj(e.target.value);
                set('cnpj', v);
                void buscarCnpj(v);
              }}
              onBlur={e => void buscarCnpj(e.target.value)} />
            {buscandoCnpj && <span className="dux-spinner sm" style={{ alignSelf: 'center' }} />}
          </div>
        </div>
        <div className="form-group" style={{ flex: '1 1 220px' }}>
          <label className="form-label">Empresa *</label>
          <input className="form-input" value={r.empresa}
            placeholder="Com quem estamos falando"
            onChange={e => set('empresa', e.target.value)} />
        </div>
      </div>

      <p className="oportunidade-secao">Contato</p>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label className="form-label">Nome</label>
          <input className="form-input" value={r.contato_nome}
            placeholder="Com quem se fala na empresa"
            onChange={e => set('contato_nome', e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '0 1 160px' }}>
          <label className="form-label">Cargo</label>
          <input className="form-input" value={r.contato_cargo} placeholder="Sócio, gerente…"
            onChange={e => set('contato_cargo', e.target.value)} />
        </div>
      </div>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label className="form-label">E-mail</label>
          <input className="form-input" type="email" value={r.contato_email}
            placeholder="para onde vai a proposta"
            onChange={e => set('contato_email', e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '0 1 170px' }}>
          <label className="form-label">Telefone</label>
          <input className="form-input" value={r.contato_telefone} placeholder="(00) 00000-0000"
            onChange={e => set('contato_telefone', mascaraTelefone(e.target.value))} />
        </div>
      </div>

      <p className="oportunidade-secao">Onde fica</p>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 180px' }}>
          <label className="form-label">Cidade</label>
          <input className="form-input" value={r.cidade} placeholder="Belo Horizonte"
            onChange={e => set('cidade', e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '0 1 110px' }}>
          <label className="form-label">Estado</label>
          <FormSelect value={r.estado} onChange={v => set('estado', v)}
            options={ESTADOS_BR.map(o => ({ value: o, label: o }))} />
        </div>
        <div className="form-group" style={{ flex: '0 1 150px' }}>
          <label className="form-label">País</label>
          <input className="form-input" value={r.pais} placeholder="Brasil"
            onChange={e => set('pais', e.target.value)} />
        </div>
      </div>

      <p className="oportunidade-secao">Negócio</p>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 160px' }}>
          <label className="form-label">Origem</label>
          <FormSelect value={r.origem} onChange={v => set('origem', v)}
            options={ORIGENS_OPORTUNIDADE.map(o => ({ value: o, label: o }))} />
        </div>
        <div className="form-group" style={{ flex: '1 1 180px' }}>
          <label className="form-label">Quem indicou</label>
          <input className="form-input" value={r.indicado_por}
            placeholder="Pessoa ou empresa que apontou"
            onChange={e => set('indicado_por', e.target.value)} />
        </div>
      </div>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 160px' }}>
          <label className="form-label">Segmento</label>
          <FormSelect value={r.segmento} onChange={v => set('segmento', v)}
            options={SEGMENTOS_OPORTUNIDADE.map(o => ({ value: o, label: o }))} />
        </div>
        <div className="form-group" style={{ flex: '1 1 160px' }}>
          <label className="form-label">Interesse</label>
          <FormSelect value={r.interesse} onChange={v => set('interesse', v)}
            options={INTERESSES_OPORTUNIDADE.map(o => ({ value: o, label: o }))} />
        </div>
      </div>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 160px' }}>
          <label className="form-label">Temperatura</label>
          <FormSelect value={r.temperatura} onChange={v => set('temperatura', v)}
            options={TEMPERATURAS_OPORTUNIDADE.map(o => ({
              value: o,
              label: o,
              descricao: TEMPERATURA_DETALHE[o].descricao,
              icone: (
                <span style={{ color: TEMPERATURA_DETALHE[o].cor, display: 'inline-flex' }}>
                  {TEMPERATURA_DETALHE[o].icone({ size: 15 })}
                </span>
              ),
            }))} />
        </div>
        <div className="form-group" style={{ flex: '1 1 160px' }}>
          <label className="form-label">Tipo de projeto</label>
          <FormSelect value={r.tipo_projeto} onChange={v => set('tipo_projeto', v)}
            options={TIPOS_PROJETO_OPORTUNIDADE.map(o => ({
              value: o,
              label: o,
              descricao: TIPO_PROJETO_DETALHE[o].descricao,
              icone: TIPO_PROJETO_DETALHE[o].icone({ size: 15 }),
            }))} />
        </div>
      </div>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '0 1 190px' }}>
          {/* Sim ou não à vista, e não uma caixinha para marcar: a pergunta é
              fechada, e ver as duas respostas é o que deixa claro que "não" foi
              escolhido, em vez de esquecido. */}
          <label className="form-label">Veio por parceria</label>
          <SegSwitch valor={r.parceria ? 'sim' : 'nao'}
            onChange={v => {
              set('parceria', v === 'sim');
              // Voltou para "não": o percentual sai junto. Guardá-lo escondido
              // faria a conta reaparecer sozinha na próxima vez que alguém
              // marcasse "sim", com um número que ninguém escolheu de novo.
              if (v === 'nao') set('parceria_percentual', '');
            }}
            opcoes={[{ valor: 'nao', label: 'Não' }, { valor: 'sim', label: 'Sim' }]}
            pequeno full />
        </div>
        {/* O percentual só existe com a parceria marcada, e nasce com o
            `.revelar`: aparecendo de estalo ele empurraria a linha inteira num
            quadro. O bloco fica montado - montado só enquanto aberto, ele
            animaria de nada para nada. */}
        <div className={`revelar${r.parceria ? ' aberto' : ''}`} style={{ flex: '0 1 150px' }}>
          <div>
            <div className="form-group">
              <label className="form-label">% da parceria</label>
              <input className="form-input" inputMode="decimal" value={r.parceria_percentual}
                placeholder="0"
                onChange={e => set('parceria_percentual', mascaraPorcento(e.target.value))} />
            </div>
          </div>
        </div>
      </div>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '0 1 150px' }}>
          <label className="form-label">Valor estimado</label>
          <input className="form-input" value={r.valor_estimado} placeholder="R$ 0,00"
            onChange={e => set('valor_estimado', maskCurrencyBRL(e.target.value))} />
        </div>
        <div className="form-group" style={{ flex: '1 1 200px' }}>
          <label className="form-label">Responsável</label>
          <FormSelect value={r.responsavel_id} onChange={v => set('responsavel_id', v)}
            options={pessoas.map(p => ({ value: p.id, label: p.nome }))} />
        </div>
      </div>

      <p className="oportunidade-secao">Próximo passo</p>
      <div className="oportunidade-campos">
        <div className="form-group" style={{ flex: '1 1 220px' }}>
          <label className="form-label">O que fazer</label>
          <input className="form-input" value={r.proxima_acao}
            placeholder="Ligar, enviar proposta, agendar reunião…"
            onChange={e => set('proxima_acao', e.target.value)} />
        </div>
        <div className="form-group" style={{ flex: '0 1 160px' }}>
          <label className="form-label">Quando</label>
          <DatePicker value={r.proxima_acao_em} onChange={v => set('proxima_acao_em', v)} compact />
        </div>
      </div>

      {/* O briefing é o único campo longo da ficha, e por isso é o único com
          editor: uma operação descrita sem lista e sem destaque vira parede de
          texto, e parede de texto ninguém relê. */}
      <div className="form-group">
        <label className="form-label">Briefing</label>
        <EditorRico
          className="form-input"
          valor={r.briefing}
          onMudar={v => set('briefing', v)}
          ariaLabel="Briefing da oportunidade"
          placeholder="O que a empresa faz, que problema ela tem, o que a gente propôs e o que ficou de fora"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Observações</label>
        <textarea className="form-input" rows={3} value={r.observacoes}
          style={{ fontSize: 13, resize: 'none' }}
          placeholder="O que foi conversado, o que a empresa faz, o que importa lembrar"
          onChange={e => set('observacoes', e.target.value)} />
      </div>
    </>
  );
}

/** Quem pode ficar responsável por uma oportunidade: o time do portal. */
function usePessoasDoPortal(token: string): Pessoa[] {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  useEffect(() => {
    let vivo = true;
    fetch('/api/admin-data?action=usuarios_notificaveis', { headers: { 'x-admin-session': token } })
      .then(r => r.json())
      // O e-mail e a foto vêm junto: são o que o seletor de participantes e o
      // avatar de quem esteve na reunião mostram.
      .then(d => { if (vivo) setPessoas((d?.usuarios ?? []).map((u: any) => ({
        id: String(u.id), nome: String(u.nome),
        email: String(u.email ?? ''), foto_url: u.foto_url ?? null,
      }))); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [token]);
  return pessoas;
}

function CreateModal({ statuses, etapaInicial, token, onClose, onCreated }: {
  statuses: StatusConfig[];
  /** A etapa de onde o cadastro foi aberto. Sem ela, vale a etapa de entrada. */
  etapaInicial?: number;
  token: string;
  onClose: () => void;
  onCreated: (sub: Submission) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const pessoas = usePessoasDoPortal(token);
  const [r, setR] = useState<RascunhoOportunidade>(OPORTUNIDADE_VAZIA);
  const set = <K extends keyof RascunhoOportunidade>(k: K, v: RascunhoOportunidade[K]) =>
    setR(p => ({ ...p, [k]: v }));
  // A etapa de onde o `+` foi clicado manda; sem ela, a etapa de entrada
  // configurada em Configurações e, sem marcação, a primeira.
  const [statusId, setStatusId] = useState<number | ''>(
    etapaInicial ?? statuses.find(s => s.is_entrada)?.id ?? statuses[0]?.id ?? ''
  );
  const [saving, setSaving] = useState(false);
  const { saindo, fechar } = useSaidaSuave(onClose);
  const fundo = useFecharNoFundo(fechar);
  // Cadastro e edição dividem a mesma memória de largura: é a mesma ficha.
  const painel = useLarguraPainel('oportunidade-form');

  async function criar() {
    if (!r.empresa.trim()) { toast('error', 'Falta a empresa', 'Uma oportunidade é uma empresa com quem se fala.'); return; }
    setSaving(true);
    try {
      const res = await api('', 'POST', {
        action: 'create_submission',
        ...corpoDaOportunidade(r),
        responsavel_nome: pessoas.find(p => p.id === r.responsavel_id)?.nome ?? null,
        status_id: statusId !== '' ? Number(statusId) : null,
      });
      if (res?.error) throw new Error(res.error);
      if (!res?.submission?.id) throw new Error('Resposta inválida do servidor.');
      onCreated(res.submission as Submission);
      toast('success', 'Oportunidade cadastrado', `${r.empresa.trim()} entrou no funil.`);
      fechar();
    } catch (e) {
      toast('error', 'Não foi possível cadastrar', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 1050 }} {...fundo}>
      <PuxadorDoPainel {...painel} />
      <div className="admin-modal" onClick={e => e.stopPropagation()}
        style={{ width: `min(${painel.largura}px, 96vw)` }}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title">Nova oportunidade</h3>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>

        <div className="admin-modal-body form-oportunidade">
          <CamposDaOportunidade r={r} set={set} token={token} pessoas={pessoas} />
          <div className="form-group">
            <label className="form-label">Etapa</label>
            <FormSelect
              value={statusId === '' ? '' : String(statusId)}
              onChange={v => setStatusId(v === '' ? '' : Number(v))}
              options={statuses.map(st => ({ value: String(st.id), label: st.nome }))}
            />
          </div>
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
          <button type="button" className="modal-acao-primaria" disabled={saving || !r.empresa.trim()}
            onClick={() => void criar()}>
            {saving ? 'Cadastrando…' : 'Cadastrar oportunidade'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function EditModal({ detail, token, onClose, onSaved }: {
  detail: SubmissionDetail;
  token: string;
  onClose: () => void;
  onSaved: (fields: Partial<Submission>) => void;
}) {
  const api = useApi(token);
  const { toast } = useToast();
  const pessoas = usePessoasDoPortal(token);
  const s = detail.submission;

  const [r, setR] = useState<RascunhoOportunidade>({
    empresa: s.empresa ?? '',
    cnpj: s.cnpj ?? '',
    contato_nome: s.contato_nome ?? '',
    contato_cargo: s.contato_cargo ?? '',
    contato_email: s.contato_email ?? '',
    contato_telefone: s.contato_telefone ?? '',
    cidade: s.cidade ?? '',
    estado: s.estado ?? '',
    pais: s.pais ?? '',
    origem: s.origem ?? '',
    indicado_por: s.indicado_por ?? '',
    parceria: Number(s.parceria) === 1,
    segmento: s.segmento ?? '',
    interesse: s.interesse ?? '',
    briefing: s.briefing ?? '',
    temperatura: s.temperatura ?? '',
    tipo_projeto: s.tipo_projeto ?? '',
    parceria_percentual: s.parceria_percentual != null ? String(s.parceria_percentual) : '',
    // Formatado como moeda, e não passado pela máscara: ela lê o que recebe
    // como centavos, então uma oportunidade de R$ 50.000 abria a edição valendo
    // R$ 500,00 - e ao salvar era isso que ia para o banco.
    valor_estimado: s.valor_estimado != null
      ? Number(s.valor_estimado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '',
    responsavel_id: s.responsavel_id ?? '',
    proxima_acao: s.proxima_acao ?? '',
    proxima_acao_em: s.proxima_acao_em ?? '',
    observacoes: s.observacoes ?? '',
  });
  const set = <K extends keyof RascunhoOportunidade>(k: K, v: RascunhoOportunidade[K]) =>
    setR(p => ({ ...p, [k]: v }));
  const [saving, setSaving] = useState(false);
  const { saindo, fechar } = useSaidaSuave(onClose);
  const fundo = useFecharNoFundo(fechar);
  const painel = useLarguraPainel('oportunidade-form');

  async function salvar() {
    if (!r.empresa.trim()) { toast('error', 'Falta a empresa', 'Uma oportunidade é uma empresa com quem se fala.'); return; }
    setSaving(true);
    try {
      const corpo = corpoDaOportunidade(r);
      const res = await api('', 'POST', { action: 'update_submission', id: s.id, ...corpo });
      if (res?.error) throw new Error(res.error);
      // A tela repinta com o que foi gravado, sem recarregar a listagem.
      onSaved({
        ...corpo,
        responsavel_nome: pessoas.find(p => p.id === r.responsavel_id)?.nome ?? null,
      } as Partial<Submission>);
      toast('success', 'Oportunidade atualizado');
      fechar();
    } catch (e) {
      toast('error', 'Não foi possível salvar', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 1050 }} {...fundo}>
      <PuxadorDoPainel {...painel} />
      <div className="admin-modal" onClick={e => e.stopPropagation()}
        style={{ width: `min(${painel.largura}px, 96vw)` }}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title">Editar oportunidade</h3>
          <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
        </div>
        <div className="admin-modal-body form-oportunidade">
          <CamposDaOportunidade r={r} set={set} token={token} pessoas={pessoas} />
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="modal-acao" onClick={fechar}>Cancelar</button>
          <button type="button" className="modal-acao-primaria" disabled={saving || !r.empresa.trim()}
            onClick={() => void salvar()}>
            {saving ? 'Salvando…' : 'Salvar'}
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
  const { usuario, pode } = useAuth();
  const painel = useLarguraPainel('oportunidade');
  /** As pessoas da casa, para escolher quem esteve na reunião. */
  const pessoas = usePessoasDoPortal(token);
  /** A aba aberta. Mesma navegação do painel de projeto: a ficha da oportunidade de um
   *  lado, o que já foi conversado do outro. */
  const [aba, setAba] = useState<'geral' | 'reunioes'>('geral');
  /** As reuniões da oportunidade. Vivem fora do `detail` porque cada gesto as pinta na
   *  hora, e o `detail` só é relido quando alguma outra coisa muda. */
  const [reunioes, setReunioes] = useState<Reuniao[]>([]);
  const [salvandoReuniao, setSalvandoReuniao] = useState(false);
  // A saída animada é o que permite arrastar o puxador: sem o gancho do fundo,
  // soltar o arrasto sobre o overlay contava como clique fora e fechava tudo.
  const { saindo, fechar } = useSaidaSuave(onClose);
  const fundo = useFecharNoFundo(fechar);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
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
  const [showEdit, setShowEdit] = useState(false);
  const [deleteSubmissionConfirm, setDeleteSubmissionConfirm] = useState(false);
  // Feedback visual do botão "copiar link de compartilhamento"
  const [copied, setCopied] = useState(false);
  // Seção "Avaliação da operação" retrátil - recolhida por padrão.
  const [showAvaliacao, setShowAvaliacao] = useState(false);
  // Etapa de conversão pendente: exige registrar a data de execução no modal antes de mover
  const [pendingConversion, setPendingConversion] = useState<number | null>(null);
  // Etapa de descarte: pede o motivo da perda antes de mover.
  const [pendingPerda, setPendingPerda] = useState<number | null>(null);
  // Etapa que exige pendências: statusId aguardando registro das pendências antes de mover
  const [pendingPendencia, setPendingPendencia] = useState<number | null>(null);
  const [savingPendMove, setSavingPendMove] = useState(false);
  // Confirmar mover p/ conversão após registrar a data de execução direto
  const [pendingAutoConv, setPendingAutoConv] = useState<number | null>(null);
  // Confirmar sair da conversão (limpa a data de execução registrada)
  const [pendingExecClear, setPendingExecClear] = useState<number | null>(null);


  /** O mesmo `detail` do estado, guardado fora do render.
   *
   *  A atividade lê daqui: depois de enviar um comentário ela relê na hora, e o
   *  estado ainda não foi recomposto nesse instante - lendo do estado, o balão
   *  que acabou de subir sumiria e voltaria no quadro seguinte. */
  const ultimoDetail = useRef<SubmissionDetail | null>(null);

  async function load() {
    const data = await api(`?action=detail&id=${id}`);
    ultimoDetail.current = data;
    setDetail(data);
    setReunioes((data?.reunioes ?? []) as Reuniao[]);
  }

  // Copia um link direto para este card (?oportunidade=<id>) - compartilhável com
  // qualquer pessoa que tenha acesso à plataforma. Feedback visual + toast.
  async function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}?oportunidade=${id}`;
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

  /** O dono da atividade: de onde ler a conversa e o diário, e para onde
   *  mandar o que se escreve. A versão é o tamanho do diário - mudou, a
   *  atividade relê, e é assim que uma mudança de etapa aparece nela sem
   *  ninguém ter clicado em nada. */
  const donoDaAtividade = useMemo(() => ({
    chave: `oportunidade:${id}`,
    versao: detail?.eventos.length ?? 0,
    ler: async () => {
      const eventos = ultimoDetail.current?.eventos ?? [];
      return {
        eventos: eventos.filter(e => e.tipo !== 'comentario').map(eventoDaOportunidade),
        comentarios: eventos.filter(e => e.tipo === 'comentario').map(comentarioDaOportunidade),
      };
    },
    enviar: async (texto: string, _anexos: unknown[], paiId: number | null) => {
      const r = await api('', 'POST', {
        action: 'comment', oportunidade_id: id, texto, parent_id: paiId,
        mencoes: idsMarcados(texto),
      });
      if (!r?.error) await load();
      return r ?? {};
    },
    excluir: async (comentarioId: number) => {
      const r = await api('', 'POST', { action: 'delete_comment', id: comentarioId });
      if (!r?.error) await load();
      return r ?? {};
    },
    // Sem `anexo`: o comentário do funil não leva arquivo - os anexos da oportunidade
    // têm seção própria, com categoria -, e por isso o clipe não aparece.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [api, id, detail?.eventos.length]);

  // ── Reuniões da oportunidade ──────────────────────────────────────────────────
  //
  //  Os mesmos gestos do painel de projeto, com a oportunidade no lugar dele: cada um
  //  pinta a lista na hora e desfaz se o servidor recusar.

  /** Registra a reunião escrita à mão. O servidor devolve a linha pronta - id e
   *  autor são o que só ele sabe -, e a tela a coloca na lista sem reler nada. */
  async function registrarReuniao(
    reg: { data: string; assunto: string; notas: string; participantes: string[] },
  ) {
    setSalvandoReuniao(true);
    const r = await api('', 'POST', { action: 'registrar_reuniao_oportunidade', oportunidade_id: id, ...reg });
    setSalvandoReuniao(false);
    if (r?.error || !r?.reuniao) {
      toast('error', 'Não foi possível registrar', r?.error ?? 'Tente de novo.');
      return;
    }
    setReunioes(rs => ordenarReunioes([...rs, r.reuniao as Reuniao]));
    toast('success', 'Reunião registrada');
  }

  /** Puxa reuniões do Fireflies para a oportunidade. O resumo vira a nota e o link fica
   *  guardado; a transcrição inteira continua morando lá. */
  async function anexarReunioesFireflies(firefliesIds: string[]) {
    setSalvandoReuniao(true);
    const r = await api('', 'POST', {
      action: 'anexar_reuniao_fireflies_oportunidade', oportunidade_id: id, fireflies_ids: firefliesIds,
    });
    setSalvandoReuniao(false);
    if (r?.error) { toast('error', 'Não foi possível anexar', r.error); return; }
    const novas = (r?.reunioes ?? []) as Reuniao[];
    if (novas.length === 0) { toast('info', 'Nada a anexar', 'Essas reuniões já estavam aqui.'); return; }
    setReunioes(rs => ordenarReunioes([...rs, ...novas]));
    toast('success', novas.length === 1 ? 'Reunião anexada' : `${novas.length} reuniões anexadas`);
  }

  /** Tira a reunião da oportunidade. Some da lista no gesto e volta se o servidor
   *  recusar: esperar a ida e a volta faria o clique parecer perdido. */
  async function excluirReuniao(reg: Reuniao) {
    const antes = reunioes;
    setReunioes(rs => rs.filter(x => x.id !== reg.id));
    const r = await api('', 'POST', { action: 'excluir_reuniao_oportunidade', id: reg.id });
    if (r?.error) {
      setReunioes(antes);
      toast('error', 'Não foi possível excluir', r.error);
      return;
    }
    toast('success', 'Reunião excluída');
  }

  async function buscarReunioesFireflies(busca: string) {
    const r = await api(`?action=fireflies_reunioes&busca=${encodeURIComponent(busca)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

  /** A transcrição inteira, buscada no clique de baixar. */
  async function buscarTranscricaoFireflies(firefliesId: string) {
    const r = await api(`?action=fireflies_transcricao&id=${encodeURIComponent(firefliesId)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

  async function buscarGravacaoFireflies(firefliesId: string) {
    const r = await api(`?action=fireflies_gravacao&id=${encodeURIComponent(firefliesId)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

  useEffect(() => {
    const cached = prefetchCache?.current?.get(id);
    if (cached) {
      ultimoDetail.current = cached;
      setDetail(cached);
      setReunioes((cached.reunioes ?? []) as Reuniao[]);
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
    toast('success', 'Oportunidade excluído');
    onDelete?.(id);
    fechar();
  }

  async function performMove(statusId: number) {
    const st = detail?.statuses?.find(s => Number(s.id) === statusId);
    const statusName = st?.nome;
    // Otimista: reflete o novo status na hora (board + pill do drawer), rede em segundo plano
    onMoved(id, statusId);
    setDetail(prev => prev ? {
      ...prev,
      eventos: [...prev.eventos, {
        id: -Date.now(), oportunidade_id: id, tipo: 'status_change',
        status_id: statusId, status_nome: statusName ?? null, status_cor: (st as any)?.cor ?? null,
        descricao: null, parent_id: null, criado_em: new Date().toISOString(),
        autor_id: usuario?.id ?? null, autor_nome: usuario?.nome ?? null, autor_foto: usuario?.foto_url ?? null,
      }],
    } : prev);
    toast('success', statusName ? `Movido para "${statusName}"` : 'Status atualizado');
    setMovingTo(statusId);
    try {
      await api('', 'POST', { action: 'move', oportunidade_id: id, status_id: statusId });
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
    // Etapa de descarte → registrar o motivo antes de mover.
    if (cfg?.is_excluded && Number(curId) !== Number(statusId)) {
      setPendingPerda(statusId);
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
      if (novas.length) await api('', 'POST', { action: 'add_pendencias', oportunidade_id: id, status_id: statusId, itens: novas });
      for (const e of editadas) await api('', 'POST', { action: 'update_pendencia', id: e.id, descricao: e.descricao.trim(), categoria: e.categoria });
      setPendingPendencia(null);
      await performMove(statusId);
    } finally {
      setSavingPendMove(false);
    }
  }

  // O motivo entra na ficha no gesto; o servidor confirma por baixo.
  async function confirmPerda(motivo: string) {
    const statusId = pendingPerda;
    if (statusId == null) return;
    const anterior = detail?.submission.motivo_perda ?? null;
    setPendingPerda(null);
    setDetail(prev => prev ? { ...prev, submission: { ...prev.submission, motivo_perda: motivo } } : prev);
    onEdited?.(id, { motivo_perda: motivo } as Partial<Submission>);
    void performMove(statusId);
    try {
      const r = await api('', 'POST', { action: 'update_submission', id, motivo_perda: motivo });
      if (r?.error) throw new Error(r.error);
    } catch {
      setDetail(prev => prev ? { ...prev, submission: { ...prev.submission, motivo_perda: anterior } } : prev);
      toast('error', 'Não foi possível gravar o motivo da perda');
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
    await api('', 'POST', { action: 'add_pendencias', oportunidade_id: id, status_id: currentStatusId, itens: [{ descricao, categoria }] });
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
          oportunidade_id: id,
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
        oportunidade_id: id,
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


  return (
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel {...painel} />
      <div className="admin-modal" onClick={e => e.stopPropagation()}
        style={{ width: `min(${painel.largura}px, 96vw)` }}>

        {/* Header */}
        {/* `com-abas` só quando há abas: a linha que separa cabeçalho e corpo
            passa a ser a das abas, e sem isso são duas a poucos pixels uma da
            outra. É a mesma marca do painel de projeto. */}
        <div className={`admin-modal-header${detail ? ' com-abas' : ''}`}
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          {/* Row 1: label + actions + close */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Oportunidade
              </p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>{s?.empresa ?? '…'}</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {detail && (
                <>
                  <button
                    className="admin-toolbar-btn"
                    title={copied ? 'Link copiado!' : 'Copiar link de compartilhamento'}
                    onClick={copyShareLink}
                    style={{ width: 30, height: 30, color: copied ? 'var(--green)' : undefined, borderColor: copied ? 'var(--green)' : undefined }}
                  >
                    {copied ? (
                      <IconCheck size={15} />
                    ) : (
                      <IconLink size={15} />
                    )}
                  </button>
                  <button
                    className="admin-toolbar-btn"
                    title="Editar oportunidade"
                    onClick={() => setShowEdit(true)}
                    style={{ width: 30, height: 30 }}
                  >
                    <IconEdit size={14} />
                  </button>
                  <button
                    className="admin-toolbar-btn"
                    title="Excluir oportunidade"
                    onClick={() => setDeleteSubmissionConfirm(true)}
                    style={{ width: 30, height: 30, color: 'var(--red)' }}
                  >
                    <IconTrash size={14} />
                  </button>
                </>
              )}
              <button className="admin-modal-close" aria-label="Fechar" onClick={fechar}><IconX size={16} /></button>
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
                      <IconDownload size={13} />
                      Baixar todos ({detail.form_arquivos.length + detail.etapa_arquivos.length})
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* A mesma navegação do painel de projeto: a ficha de um lado, o que
              já foi conversado do outro. */}
          {detail && (
            <Abas
              valor={aba}
              onChange={setAba}
              style={{ marginBottom: 0, marginTop: 2 }}
              opcoes={[
                { valor: 'geral', label: 'Geral' },
                { valor: 'reunioes', label: 'Reuniões' },
              ]}
            />
          )}
        </div>

        {!detail ? (
          <DetailSkeleton />
        ) : (
          /* A chave repete a entrada a cada aba, e de quebra devolve a rolagem
             ao topo, que é onde a aba nova começa. */
          <div className="admin-modal-body aba-painel" key={aba}>

          {aba === 'reunioes' && (
            <SecaoReunioes
              somenteLeitura={!pode('oportunidades:editar')}
              registros={reunioes}
              pessoas={pessoas}
              salvando={salvandoReuniao}
              onRegistrar={registrarReuniao}
              onBuscarFireflies={buscarReunioesFireflies}
              onBuscarGravacao={buscarGravacaoFireflies}
              onBuscarTranscricao={buscarTranscricaoFireflies}
              onAnexarFireflies={anexarReunioesFireflies}
              onExcluir={excluirReuniao}
            />
          )}

          <div style={{ display: aba === 'geral' ? 'block' : 'none' }}>

            {/* A ficha da oportunidade: com quem se fala, o que quer e quanto vale. */}
            <section>
              <p className="admin-section-title">Contato</p>
              <div className="oportunidade-ficha">
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Empresa</p>
                  <p className="oportunidade-ficha-valor">{s!.empresa ?? '-'}</p>
                  {s!.cnpj && <p className="oportunidade-ficha-sub">{s!.cnpj}</p>}
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Quem fala com a gente</p>
                  <p className="oportunidade-ficha-valor">{s!.contato_nome ?? '-'}</p>
                  {s!.contato_cargo && <p className="oportunidade-ficha-sub">{s!.contato_cargo}</p>}
                </div>
                {/* E-mail e telefone são para usar, não para ler: viram link de
                    escrever e de ligar. */}
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">E-mail</p>
                  {s!.contato_email
                    ? <a className="oportunidade-ficha-valor oportunidade-ficha-link" href={`mailto:${s!.contato_email}`}>{s!.contato_email}</a>
                    : <p className="oportunidade-ficha-valor">-</p>}
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Telefone</p>
                  {s!.contato_telefone
                    ? <a className="oportunidade-ficha-valor oportunidade-ficha-link" href={`tel:${String(s!.contato_telefone).replace(/\D/g, '')}`}>{s!.contato_telefone}</a>
                    : <p className="oportunidade-ficha-valor">-</p>}
                </div>
                {/* Cidade e estado numa linha só: é assim que se lê um lugar, e
                    em dois campos separados a ficha ganharia um vão no meio de
                    "Belo Horizonte" e "MG". O país fica embaixo, e some quando
                    é o daqui - dizer "Brasil" em toda oportunidade é ruído. */}
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Onde fica</p>
                  <p className="oportunidade-ficha-valor">
                    {[s!.cidade, s!.estado].filter(Boolean).join(' / ') || '-'}
                  </p>
                  {s!.pais && s!.pais !== 'Brasil' && <p className="oportunidade-ficha-sub">{s!.pais}</p>}
                </div>
              </div>
            </section>

            <section>
              <p className="admin-section-title">Negócio</p>
              <div className="oportunidade-ficha">
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Origem</p>
                  <p className="oportunidade-ficha-valor">
                    {s!.origem ?? '-'}
                    {/* A marca de parceria anda com a origem: as duas dizem por
                        onde a oportunidade entrou. Só aparece quando é sim - um "não"
                        escrito em toda oportunidade não informa nada. */}
                    {Number(s!.parceria) === 1 && (
                      <span className="oportunidade-tag-parceria" title="Oportunidade que chegou por um parceiro">
                        parceria{s!.parceria_percentual != null ? ` ${s!.parceria_percentual}%` : ''}
                      </span>
                    )}
                  </p>
                  {s!.indicado_por && <p className="oportunidade-ficha-sub">por {s!.indicado_por}</p>}
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Temperatura</p>
                  <p className="oportunidade-ficha-valor">{s!.temperatura ?? '-'}</p>
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Tipo de projeto</p>
                  <p className="oportunidade-ficha-valor">{s!.tipo_projeto ?? '-'}</p>
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Segmento</p>
                  <p className="oportunidade-ficha-valor">{s!.segmento ?? '-'}</p>
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Interesse</p>
                  <p className="oportunidade-ficha-valor">{s!.interesse ?? '-'}</p>
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Valor estimado</p>
                  <p className="oportunidade-ficha-valor oportunidade-ficha-valor-forte">{fmtValor(s!.valor_estimado)}</p>
                </div>
                <div className="oportunidade-ficha-item">
                  <p className="admin-info-label">Responsável</p>
                  <p className="oportunidade-ficha-valor">{s!.responsavel_nome ?? '-'}</p>
                </div>
              </div>

              {/* O próximo passo é o que faz o funil andar. Vencido, ele cobra. */}
              <div className={`oportunidade-passo${s!.proxima_acao_em && String(s!.proxima_acao_em) < hojeISO() ? ' atrasado' : ''}`}>
                <IconCalendario size={15} />
                <div style={{ minWidth: 0 }}>
                  <p className="oportunidade-passo-acao">{s!.proxima_acao ?? 'Sem próximo passo marcado'}</p>
                  {s!.proxima_acao_em && (
                    <p className="oportunidade-passo-data">
                      {String(s!.proxima_acao_em) < hojeISO() ? 'Era para ' : 'Para '}
                      {fmtDataBR(String(s!.proxima_acao_em))}
                    </p>
                  )}
                </div>
                <button className="admin-toolbar-btn" style={{ marginLeft: 'auto', height: 28, padding: '0 10px', fontSize: 12 }}
                  onClick={() => setShowEdit(true)}>
                  {s!.proxima_acao ? 'Alterar' : 'Marcar'}
                </button>
              </div>

              {/* O briefing vem antes das observações porque é o que situa quem
                  abriu a ficha sem ter participado da conversa. As observações
                  são o que foi dito na última; o briefing é o assunto inteiro. */}
              {s!.briefing && (
                <div className="oportunidade-observacoes oportunidade-briefing">
                  <p className="admin-info-label">Briefing</p>
                  <TextoRico texto={String(s!.briefing)} />
                </div>
              )}

              {s!.observacoes && (
                <div className="oportunidade-observacoes">
                  <p className="admin-info-label">Observações</p>
                  <p>{String(s!.observacoes)}</p>
                </div>
              )}

              {s!.motivo_perda && (
                <div className="oportunidade-observacoes oportunidade-perda">
                  <p className="admin-info-label">Motivo da perda</p>
                  <p>{String(s!.motivo_perda)}</p>
                </div>
              )}

              {/* Fechamento: a previsão é aposta do comercial; a data só existe
                  depois que o negócio fecha de fato. */}
              <div style={{ display: 'flex', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
                  <label className="form-label">Previsão de fechamento</label>
                  <DatePicker
                    value={s!.previsao_execucao ? String(s!.previsao_execucao) : ''}
                    onChange={v => patchExecField('previsao_execucao', v)}
                    compact
                  />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
                  <label className="form-label">Fechado em</label>
                  <DatePicker
                    value={s!.data_execucao ? String(s!.data_execucao) : ''}
                    onChange={v => patchExecField('data_execucao', v)}
                    compact
                    allowPast
                  />
                </div>
              </div>
            </section>

            {/* Quanto tempo ela passou em cada etapa */}
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
                  <p className="admin-section-title">Tempo por etapa</p>
                  <div className="oportunidade-time-list">
                    {stages.map((st, i) => (
                      <div key={i} className="oportunidade-time-row">
                        <div className="oportunidade-time-name">
                          <span className="oportunidade-time-dot" style={{ background: st.cor }} />
                          <span>{st.nome}</span>
                          {st.isCurrent && <span className="oportunidade-time-current">{st.frozen ? 'final' : 'atual'}</span>}
                        </div>
                        <div className="oportunidade-time-bar-wrap">
                          <div
                            className="oportunidade-time-bar"
                            style={{ width: `${Math.max((st.ms / maxMs) * 100, 2)}%`, background: st.cor + '55', borderColor: st.cor }}
                          />
                        </div>
                        <span className="oportunidade-time-value">{st.label}</span>
                      </div>
                    ))}
                  </div>
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
                      <IconExternal size={14} />
                    </button>
                    {isStage && (
                      <button className="file-delete-btn" title="Excluir anexo" onClick={() => askDeleteFile(f.id, f.nome, false)}>
                        <IconTrash size={13} />
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
                        <IconEye size={14} />
                      </button>
                    )}
                    <button className="admin-file-download" title="Baixar" onClick={() => downloadFile(f.id, false, f.nome)}>
                      <IconDownload size={13} />
                    </button>
                    <button className="file-delete-btn" title="Excluir anexo" onClick={() => askDeleteFile(f.id, f.nome, true)}>
                      <IconTrash size={13} />
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
                      <IconEye size={14} />
                    </button>
                  )}
                  <button className="admin-file-download" title="Baixar" onClick={() => downloadFile(f.id, true, displayName)}>
                    <IconDownload size={13} />
                  </button>
                  <button
                    className="file-delete-btn"
                    title="Excluir anexo"
                    onClick={() => askDeleteFile(f.id, displayName, false)}
                  >
                    <IconTrash size={13} />
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
                  <IconClip size={14} />
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

            {deleteConfirmId !== null && (
              <Dialogo
                titulo="Excluir anexo?"
                descricao={<><strong>{deleteConfirmNome}</strong> será excluído permanentemente e não poderá ser recuperado.</>}
                rotuloOk="Excluir" zIndex={1100}
                onFechar={() => setDeleteConfirmId(null)}
                onConfirmar={() => deleteFile(deleteConfirmId)}
              />
            )}

            {deleteSubmissionConfirm && (
              <Dialogo
                titulo="Excluir oportunidade?"
                descricao={<><strong>{detail?.submission.empresa}</strong> será removida do sistema. Esta ação pode ser revertida pelo suporte, mas não pela interface.</>}
                rotuloOk="Excluir" zIndex={1100}
                onFechar={() => setDeleteSubmissionConfirm(false)}
                onConfirmar={handleDeleteSubmission}
              />
            )}




            {pendingPerda !== null && (
              <MotivoPerdaModal
                statusName={statuses.find(st => Number(st.id) === Number(pendingPerda))?.nome ?? 'esta etapa'}
                inicial={String(detail?.submission.motivo_perda ?? '')}
                onConfirm={confirmPerda}
                onCancel={() => setPendingPerda(null)}
              />
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

            {/* Confirmar mover p/ conversão após registrar a data de execução direto */}
            {pendingAutoConv !== null && (
              <Dialogo
                titulo="Mover para fechado?"
                descricao={<>
                  A data do fechamento foi registrada. A etapa será alterada automaticamente para
                  <strong> {statuses.find(st => Number(st.id) === Number(pendingAutoConv))?.nome}</strong>. Deseja continuar?
                </>}
                perigo={false} zIndex={1100}
                onFechar={() => setPendingAutoConv(null)}
                onConfirmar={confirmAutoConv}
              />
            )}

            {/* Confirmar sair da conversão (limpa a data de execução) */}
            {pendingExecClear !== null && (
              <Dialogo
                titulo="Limpar a data do fechamento?"
                descricao={<>
                  Mover para <strong>{statuses.find(st => Number(st.id) === Number(pendingExecClear))?.nome}</strong> vai
                  <strong> limpar a data do fechamento</strong> registrada, porque o negócio volta a estar em aberto. Deseja continuar?
                </>}
                zIndex={1100}
                onFechar={() => setPendingExecClear(null)}
                onConfirmar={confirmExecClear}
              />
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

            {/* A conversa e o diário, na mesma peça da gaveta de tarefa. */}
            <Atividade
              dono={donoDaAtividade}
              pessoas={pessoas}
              etapas={detail.statuses.map(st => ({ id: Number(st.id), nome: st.nome, cor: st.cor }))}
              usuarioId={usuario?.id}
              podeComentar={pode('oportunidades:comentar')}
            />

          </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal de anexos (pré-visualização + download) ───
type AnexoItem = { nome: string; tipo: string; tamanho: number; categoria?: string | null; url: string; isLink?: boolean };
function AnexosModal({ oportunidadeId, onClose }: { oportunidadeId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [itens, setItens] = useState<AnexoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<number | null>(null); // índice em pré-visualização (modal sobre modal)

  useEffect(() => {
    const token = localStorage.getItem('dux_admin_token') ?? '';
    let urls: string[] = [];
    fetch(`/api/admin-data?action=get_oportunidade_files&id=${encodeURIComponent(oportunidadeId)}`, {
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
  }, [oportunidadeId]);

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
          <h3 style={{ fontSize: 16, fontWeight: 800 }}>Anexos da oportunidade {loading ? '' : `(${itens.length})`}</h3>
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
                    <IconExternal size={14} />
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
/** Quantos chips cabem no card sem ele virar uma lista. O resto vira um chip
 *  de contagem, que leva para a aba onde as reuniões todas moram. */
const CHIPS_NO_CARD = 2;

/** As reuniões da oportunidade como chips no card do quadro, e a reunião que eles
 *  abrem.
 *
 *  O quadro carrega só o que o chip mostra - assunto, data e de onde veio.
 *  Clicar busca a reunião inteira e abre o `ReuniaoModal`, o mesmo modal
 *  central do chip dentro da entrega e do chip dentro da tarefa: ver a conversa
 *  é o que se quer ali, e abrir a oportunidade para procurá-la seria o caminho longo
 *  para a mesma coisa. */
function ChipsDeReuniao({ reunioes, onAbrirOportunidade }: {
  reunioes: ReuniaoDoCard[];
  onAbrirOportunidade: () => void;
}) {
  const { toast } = useToast();
  const [aberta, setAberta] = useState<Reuniao | null>(null);
  const [buscando, setBuscando] = useState<number | null>(null);

  // Da mais recente para a mais antiga: cabendo duas, são as duas últimas
  // conversas que ficam à vista.
  const ordenadas = [...reunioes]
    .sort((a, b) => (b.data ?? '').localeCompare(a.data ?? '') || b.id - a.id);
  const visiveis = ordenadas.slice(0, CHIPS_NO_CARD);
  const restantes = ordenadas.length - visiveis.length;

  async function abrir(id: number) {
    setBuscando(id);
    const r = await pedir(`?action=reuniao_oportunidade&id=${id}`);
    setBuscando(null);
    if (r?.error || !r?.reuniao) {
      toast('error', 'Não foi possível abrir a reunião', r?.error ?? 'Tente de novo.');
      return;
    }
    setAberta(r.reuniao as Reuniao);
  }

  return (
    // O card inteiro abre a oportunidade ao ser clicado; o chip tem destino próprio, e
    // sem isto ele abriria os dois.
    <div className="vinculo-chips kanban-card-reunioes" onClick={e => e.stopPropagation()}>
      {visiveis.map(r => (
        <ChipReuniao key={r.id}
          assunto={r.assunto}
          data={fmtDataCurta(r.data)}
          fireflies={Number(r.fireflies) === 1}
          titulo={buscando === r.id ? 'Abrindo…' : `Abrir "${r.assunto}"`}
          onAbrir={() => void abrir(r.id)}
        />
      ))}
      {restantes > 0 && (
        <ChipReuniao
          assunto={`+${restantes}`}
          data={restantes === 1 ? 'reunião' : 'reuniões'}
          titulo={`Ver as ${ordenadas.length} reuniões deste oportunidade`}
          onAbrir={onAbrirOportunidade}
        />
      )}
      {aberta && (
        <ReuniaoModal
          reuniao={aberta}
          buscarGravacao={async id => (
            await pedir(`?action=fireflies_gravacao&id=${encodeURIComponent(id)}`)
          )}
          buscarTranscricao={async id => (
            await pedir(`?action=fireflies_transcricao&id=${encodeURIComponent(id)}`)
          )}
          onFechar={() => setAberta(null)}
        />
      )}
    </div>
  );
}

/** Uma leitura curta do servidor, com a sessão que está na janela. Mesmo
 *  caminho do modal de anexos aqui do lado: o card é folha da árvore, e passar
 *  o token por três componentes só para chegar nele não paga. */
async function pedir(caminho: string): Promise<any> {
  const token = localStorage.getItem('dux_admin_token') ?? '';
  try {
    const r = await fetch(`/api/admin-data${caminho}`, { headers: { 'x-admin-session': token } });
    return await r.json();
  } catch {
    return { error: 'Erro de conexão.' };
  }
}

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
  const [confirmDel, setConfirmDel] = useState(false);
  const [showAnexos, setShowAnexos] = useState(false);
  const days = daysSince(sub.status_since);
  // O próximo passo é o que faz o funil andar: atrasado, ele vira o aviso do
  // card. Sem próximo passo marcado, o card não cobra nada.
  const acaoAtrasada = !!sub.proxima_acao_em && sub.proxima_acao_em < hojeISO();

  return (
    <div
      className="kanban-card"
      style={{ '--col-color': color, position: 'relative' } as any}
      draggable={!confirmDel}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; definirImagemArrasto(e); onDragStart(sub.id); }}
      onClick={() => !confirmDel && onClick(sub.id)}
      onMouseEnter={() => onPrefetch?.(sub.id)}
      onMouseLeave={() => onCancelPrefetch?.(sub.id)}
    >
      {/* As ações aparecem com o ponteiro no card, pelo CSS: sempre visíveis
          seriam duas lixeiras por cartão numa coluna cheia, e o clique que
          interessa no card é o de abrir. */}
      <div className="kanban-card-topo">
        <p className="kanban-card-title">{sub.empresa ?? '-'}</p>
        <span className="kanban-card-acoes">
          <button type="button" className="kanban-card-acao" title="Abrir a oportunidade"
            aria-label={`Abrir ${sub.empresa ?? 'a oportunidade'}`}
            onClick={e => { e.stopPropagation(); onClick(sub.id); }}>
            <IconEdit size={12} />
          </button>
          {onDelete && (
            <button type="button" className="kanban-card-acao perigo" title="Excluir oportunidade"
              aria-label={`Excluir ${sub.empresa ?? 'a oportunidade'}`}
              onClick={e => { e.stopPropagation(); setConfirmDel(true); }}>
              <IconTrash size={12} />
            </button>
          )}
        </span>
      </div>
      {(sub.contato_nome || sub.interesse) && (
        <p className="kanban-card-sub">
          {[sub.contato_nome, sub.interesse].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="kanban-card-meta">
        <span className="kanban-card-value">{fmtValor(sub.valor_estimado)}</span>
        {!hideAging && days > 0 && (
          <span className={`kanban-card-days${days >= 7 ? ' late' : ''}`}>
            {days}d
          </span>
        )}
      </div>
      {sub.proxima_acao && (
        <p className={`oportunidade-proxima${acaoAtrasada ? ' atrasada' : ''}`}
          title={sub.proxima_acao_em ? `Para ${fmtDataBR(sub.proxima_acao_em)}` : 'Sem data'}>
          <IconCalendario size={11} />
          <span>{sub.proxima_acao}</span>
          {sub.proxima_acao_em && <em>{fmtDataCurta(sub.proxima_acao_em)}</em>}
        </p>
      )}
      {(sub.reunioes?.length ?? 0) > 0 && (
        <ChipsDeReuniao reunioes={sub.reunioes!} onAbrirOportunidade={() => onClick(sub.id)} />
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
              <span style={{ display: 'block' }}><IconComentario size={12} /></span>
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
                style={{ color: resolvido ? 'var(--green)' : '#B45309', background: resolvido ? 'var(--green-soft)' : 'rgba(180,83,9,.13)' }}
              >
                {resolvido ? (
                  <span style={{ display: 'block' }}><IconCheck size={12} /></span>
                ) : (
                  <span style={{ display: 'block' }}><IconAlert size={12} /></span>
                )}
                {resolvido ? '' : abertas}
              </span>
            );
          })()}
        </div>
      )}
      {showAnexos && (
        <div onClick={e => e.stopPropagation()}>
          <AnexosModal oportunidadeId={sub.id} onClose={() => setShowAnexos(false)} />
        </div>
      )}

      {/* Excluir é o único gesto sem volta do card: pergunta no diálogo da
          casa, e não num balão só desta tela. */}
      {confirmDel && (
        // O clique fica preso aqui: o card inteiro abre a oportunidade, e sem isto
        // confirmar a exclusão abriria o que se acabou de excluir.
        <span onClick={e => e.stopPropagation()}>
          <Dialogo
            titulo="Excluir esta oportunidade?"
            descricao={<>
              <strong>{sub.empresa ?? 'A oportunidade'}</strong> sai do funil com a conversa e os
              anexos. O suporte consegue reverter; a tela, não.
            </>}
            rotuloOk="Excluir" zIndex={1100}
            onFechar={() => setConfirmDel(false)}
            onConfirmar={() => { setConfirmDel(false); onDelete?.(sub.id); }}
          />
        </span>
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
  status, cards, onDragStart, onDrop, onClick, dragOver, setDragOver, onPrefetch, onCancelPrefetch, onDelete, isDragging, onToggleCollapsed, onCriarNaEtapa,
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
  /** Abre o cadastro já nesta etapa. */
  onCriarNaEtapa?: (statusId: number) => void;
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

  // O que está em jogo nesta etapa: a soma do valor estimado das oportunidades dela.
  const colTotal = cards.reduce((sum, c) => sum + (c.valor_estimado ?? 0), 0);
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
        {/* O mesmo desenho do quadro de Tarefas: nome, contagem colada nele, e
            os dois botoes no canto. Dois quadros lado a lado no mesmo sistema
            com cabecalhos diferentes fazem a pessoa reaprender a mesma coisa. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="kanban-column-title">
            <span className="kanban-dot" style={{ background: status.cor }} />
            {status.nome}
          </div>
          <span className="kanban-conta-bolha">{cards.length}</span>
          {onToggleCollapsed && (
            <button
              type="button"
              className="kanban-column-fixar"
              aria-pressed={!!status.always_collapsed}
              onClick={toggleCollapsed}
              title={status.always_collapsed
                ? 'Etapa pontual: fica recolhida no board. Clique para mantê-la sempre aberta.'
                : 'Manter esta etapa recolhida no board, mesmo com cards dentro'}
              aria-label={status.always_collapsed ? 'Manter a etapa aberta' : 'Manter a etapa recolhida'}
            >
              <IconRecolher size={12} aberta={!status.always_collapsed} />
            </button>
          )}
          {/* Criar ja na coluna: o quadro e onde se decide em que ponto do funil
              a oportunidade entra, e abrir o painel para corrigir a etapa logo
              depois de cadastrar era um passo a mais em todo cadastro. */}
          {onCriarNaEtapa && (
            <button
              type="button"
              className="kanban-column-fixar"
              title={`Nova oportunidade em "${status.nome}"`}
              aria-label={`Nova oportunidade em ${status.nome}`}
              onClick={e => { e.stopPropagation(); onCriarNaEtapa(Number(status.id)); }}
            >
              <IconPlus size={12} />
            </button>
          )}
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
      {/* Contato e negócio: dois blocos de quatro campos, como a ficha. */}
      {[130, 90].map(largura => (
        <section key={largura}>
          <SkeletonBlock w={largura} h={9} radius={4} />
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px 18px' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <SkeletonBlock w="45%" h={8} radius={3} />
                <SkeletonBlock w={`${85 - i * 8}%`} h={14} radius={5} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* Próximo passo */}
      <section>
        <SkeletonBlock w="100%" h={44} radius={10} />
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

function OportunidadesSkeleton({ view }: { view: 'kanban' | 'lista' }) {
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
export default function OportunidadesPage({ token, openCard, onCardOpened }: {
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
  // A busca varre o que os filtros deixaram passar - é a mesma faixa de
  // Projetos e de Tarefas, no mesmo lugar da tela.
  const [busca, setBusca] = useState('');
  const [filterResponsavel, setFilterResponsavel] = useState<string[]>([]);
  const [filterOrigem, setFilterOrigem] = useState<string[]>([]);
  const [filterInteresse, setFilterInteresse] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [sortCol, setSortCol] = useState<string>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Cadastro aberto, e de que etapa ele veio: pelo `+` da coluna, a etapa
  // chega junto; pelo botão do topo, o cadastro usa a etapa de entrada.
  const [showCreate, setShowCreate] = useState<{ etapa?: number } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<number | null>(null);
  // Conversão pendente via drag-and-drop: exige registrar a data de execução
  const [pendingConv, setPendingConv] = useState<{ subId: string; statusId: number } | null>(null);
  // Arrastar para a etapa de descarte também pede o motivo da perda.
  const [pendingPerdaBoard, setPendingPerdaBoard] = useState<{ subId: string; statusId: number } | null>(null);
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
    api('', 'POST', { action: 'move', oportunidade_id: subId, status_id: statusId });
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
    // Etapa de descarte: registrar o motivo antes de mover.
    if (cfg?.is_excluded) {
      setPendingPerdaBoard({ subId, statusId });
      return;
    }
    // Etapa que exige pendências: registrar antes de mover. Busca as pendências
    // abertas do card para pré-preencher o modal (segue com elas, edita ou adiciona).
    if (cfg?.requires_pendencia) {
      api(`?action=pendencias_by_oportunidade&oportunidade_id=${subId}`)
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
      if (novas.length) await api('', 'POST', { action: 'add_pendencias', oportunidade_id: subId, status_id: statusId, itens: novas });
      for (const e of editadas) await api('', 'POST', { action: 'update_pendencia', id: e.id, descricao: e.descricao.trim(), categoria: e.categoria });
      // Só as novas aumentam a contagem; as existentes já estavam contabilizadas.
      if (novas.length) setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, pendencia_aberta_count: (s.pendencia_aberta_count ?? 0) + novas.length, pendencia_total_count: (s.pendencia_total_count ?? 0) + novas.length } : s));
      setPendingBoardPend(null);
      commitMove(subId, statusId);
    } finally {
      setSavingBoardPend(false);
    }
  }

  async function confirmBoardPerda(motivo: string) {
    if (!pendingPerdaBoard) return;
    const { subId, statusId } = pendingPerdaBoard;
    setPendingPerdaBoard(null);
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, motivo_perda: motivo } : s));
    commitMove(subId, statusId);
    const r = await api('', 'POST', { action: 'update_submission', id: subId, motivo_perda: motivo });
    if (r?.error) toast('error', 'Não foi possível gravar o motivo da perda', r.error);
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
      toast('success', 'Oportunidade excluído');
    } catch {
      toast('error', 'Erro ao excluir oportunidade');
    }
  }

  function handleEdited(id: string, fields: Partial<Submission>) {
    // Atualização otimista - sem refetch (evita corrida com o move e sobrescrita de estado)
    setSubmissions(prev => prev.map(s => s.id === id ? { ...s, ...fields } : s));
  }

  // Filter options derived from submissions
  const unique = <T,>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v != null && v !== ''))];

  // As opções saem do que existe no funil, e não de uma lista fixa: origem
  // escrita à mão aparece aqui sozinha, e a que ninguém usa não polui a lista.
  const responsavelOptions = unique(submissions.map(s => s.responsavel_nome))
    .map(v => ({ value: v, label: v }));
  const origemOptions = unique(submissions.map(s => s.origem))
    .map(v => ({ value: v, label: v }));
  const interesseOptions = unique(submissions.map(s => s.interesse))
    .map(v => ({ value: v, label: v }));
  const statusOptions = statuses.map(s => ({ value: String(s.id), label: s.nome }));

  const hasFilter = filterResponsavel.length > 0 || filterOrigem.length > 0
    || filterInteresse.length > 0 || filterStatus.length > 0;

  function clearFilters() {
    setFilterResponsavel([]);
    setFilterOrigem([]);
    setFilterInteresse([]);
    setFilterStatus([]);
  }

  // Empresa, contato, o que a pessoa quer e o próximo passo: é por um desses
  // que se procura uma oportunidade. O CNPJ entra pelos dígitos, com ou sem máscara.
  const termo = busca.trim().toLowerCase();
  const digitos = termo.replace(/\D/g, '');
  const casaBusca = (s: Submission) => {
    if (!termo) return true;
    const campos = [s.empresa, s.contato_nome, s.contato_email, s.origem, s.interesse, s.proxima_acao, s.responsavel_nome];
    if (campos.some(c => String(c ?? '').toLowerCase().includes(termo))) return true;
    return digitos.length >= 3 && String(s.cnpj ?? '').replace(/\D/g, '').includes(digitos);
  };

  const filtered = submissions.filter(s => {
    if (filterResponsavel.length > 0 && !filterResponsavel.includes(s.responsavel_nome ?? '')) return false;
    if (filterOrigem.length > 0 && !filterOrigem.includes(s.origem ?? '')) return false;
    if (filterInteresse.length > 0 && !filterInteresse.includes(s.interesse ?? '')) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(String(s.current_status_id ?? ''))) return false;
    return casaBusca(s);
  });

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = [...filtered].sort((a, b) => {
    let va: any, vb: any;
    if (sortCol === 'created_at') { va = a.created_at; vb = b.created_at; }
    else if (sortCol === 'empresa') { va = a.empresa ?? ''; vb = b.empresa ?? ''; }
    else if (sortCol === 'contato_nome') { va = a.contato_nome ?? ''; vb = b.contato_nome ?? ''; }
    else if (sortCol === 'origem') { va = a.origem ?? ''; vb = b.origem ?? ''; }
    else if (sortCol === 'responsavel') { va = a.responsavel_nome ?? ''; vb = b.responsavel_nome ?? ''; }
    else if (sortCol === 'valor_estimado') { va = a.valor_estimado ?? 0; vb = b.valor_estimado ?? 0; }
    // Sem data marcada vai para o fim: quem ordena por próximo passo quer ver
    // primeiro o que tem hora para acontecer.
    else if (sortCol === 'proxima_acao_em') {
      va = a.proxima_acao_em ?? '9999'; vb = b.proxima_acao_em ?? '9999';
    }
    else if (sortCol === 'status') {
      va = statuses.find(x => Number(x.id) === a.current_status_id)?.nome ?? '';
      vb = statuses.find(x => Number(x.id) === b.current_status_id)?.nome ?? '';
    }
    else if (sortCol === 'arquivo_count') { va = a.arquivo_count; vb = b.arquivo_count; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  // Os cartões contam sobre `filtered`, e não sobre `submissions`: mexer num
  // filtro e ver o número parado faria duvidar de qual dos dois está certo.
  const contarNaEtapa = (st?: StatusConfig) =>
    st ? filtered.filter(s => s.current_status_id === Number(st.id)).length : 0;
  // Quem fecha e quem descarta vem da marcação da etapa em Configurações, e não
  // do nome dela: o funil do comercial chama "Venda realizada" e "Perdido", e
  // procurar por nome deixava os dois cartões sempre em zero.
  const ganhaSt = statuses.find(st => st.is_conversion);
  const perdidaSt = statuses.find(st => st.is_excluded);
  const doneIds = new Set([ganhaSt?.id, perdidaSt?.id].filter(Boolean).map(Number));
  const pendentes = filtered.filter(s => !doneIds.has(s.current_status_id as number)).length;

  // Tempo médio de vida de cada oportunidade (criação → conclusão, ou → agora se em aberto)
  const oportunidadeTimeMedioMs = (() => {
    if (filtered.length === 0) return 0;
    const now = Date.now();
    const total = filtered.reduce((acc, s) => {
      const start = s.created_at ? new Date(s.created_at).getTime() : now;
      const done = doneIds.has(s.current_status_id as number) && s.status_since ? new Date(s.status_since).getTime() : now;
      return acc + Math.max(0, done - start);
    }, 0);
    return total / filtered.length;
  })();

  return (
    <div className="admin-content-wrap pagina-cristal pagina-funil">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Funil</h1>
          <p className="admin-page-desc">Acompanhe as oportunidades em negociação, do primeiro contato ao desfecho.</p>
        </div>
        <div className="admin-page-acoes">
          <button className="admin-toolbar-btn" onClick={loadBoard} title="Atualizar"
            aria-label="Atualizar o funil" disabled={loading}>
            <span style={{ display: 'inline-flex', animation: loading ? 'spin 0.7s linear infinite' : undefined }}>
              <IconRefresh size={13} />
            </span>
          </button>
          <button onClick={() => setShowCreate({})} className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}>
            + Nova oportunidade
          </button>
        </div>
      </div>

      {/* Os mesmos cartões de Projetos e de Tarefas: o desenho saiu daqui e
          voltou como componente, para as três telas não divergirem. */}
      {loading ? (
        <CartoesKpiEsqueleto cartoes={5} />
      ) : (
        <div className="admin-stats" style={{ marginBottom: 18 }}>
          <CartaoKpi rotulo="Total de oportunidades" valor={filtered.length}
            nota={hasFilter || busca ? 'no recorte atual' : 'no funil'}
            cor="var(--yellow)" atraso={0} />
          <CartaoKpi rotulo="Em negociação" valor={pendentes} nota="ainda sem desfecho"
            cor="#6366F1" atraso={0.05} />
          {ganhaSt && (
            <CartaoKpi rotulo={ganhaSt.nome} valor={contarNaEtapa(ganhaSt)} nota="fecharam negócio"
              cor={ganhaSt.cor} atraso={0.1}
              ativo={filterStatus.includes(String(ganhaSt.id))}
              onClick={() => setFilterStatus(f => f.includes(String(ganhaSt.id))
                ? f.filter(x => x !== String(ganhaSt.id))
                : [...f, String(ganhaSt.id)])} />
          )}
          {perdidaSt && (
            <CartaoKpi rotulo={perdidaSt.nome} valor={contarNaEtapa(perdidaSt)} nota="não avançaram"
              cor={perdidaSt.cor} atraso={0.15}
              ativo={filterStatus.includes(String(perdidaSt.id))}
              onClick={() => setFilterStatus(f => f.includes(String(perdidaSt.id))
                ? f.filter(x => x !== String(perdidaSt.id))
                : [...f, String(perdidaSt.id)])} />
          )}
          <CartaoKpi rotulo="Ciclo médio" valor={fmtDuracao(oportunidadeTimeMedioMs)}
            nota="da entrada ao desfecho" cor="#0EA5E9" atraso={0.2} />
        </div>
      )}

      {/* Toolbar */}
      {!loading && <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filtrar</span>
        <FilterDropdown label="Etapa" values={filterStatus} options={statusOptions} onChange={setFilterStatus} />
        <FilterDropdown label="Responsável" values={filterResponsavel} options={responsavelOptions} onChange={setFilterResponsavel} />
        <FilterDropdown label="Origem" values={filterOrigem} options={origemOptions} onChange={setFilterOrigem} />
        <FilterDropdown label="Interesse" values={filterInteresse} options={interesseOptions} onChange={setFilterInteresse} />
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
          <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}
            title="Quadro" aria-label="Ver em quadro">
            <IconVisaoQuadro size={14} />
          </button>
          <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}
            title="Lista" aria-label="Ver em lista">
            <IconVisaoLista size={14} />
          </button>
        </div>
      </div>}

      {/* A busca fica à vista, e não atrás de um botão: é a mesma faixa da tela
          de Projetos e da de Tarefas. Os filtros ficam acima porque estreitam o
          conjunto; a busca varre o que sobrou. */}
      {!loading && submissions.length > 0 && (
        <div className="secao-busca">
          <span className="secao-busca-campo">
            <IconSearch size={13} />
            <input value={busca} aria-label="Buscar oportunidade"
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por empresa, contato, CNPJ ou próximo passo"
              onKeyDown={e => { if (e.key === 'Escape') setBusca(''); }} />
            {busca && (
              <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
                <IconX size={12} />
              </button>
            )}
          </span>
        </div>
      )}

      {loading ? (
        <OportunidadesSkeleton view={view} />
      ) : filtered.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>{busca || hasFilter ? 'Nenhuma oportunidade no recorte atual' : 'Nenhuma oportunidade cadastrado ainda'}</p>
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
              onCriarNaEtapa={etapa => setShowCreate({ etapa })}
            />
          ))}
          {/* Unassigned column */}
          {filtered.some(s => !s.current_status_id) && (() => {
            const semEtapa = filtered.filter(s => !s.current_status_id);
            const total = semEtapa.reduce((sum, c) => sum + (c.valor_estimado ?? 0), 0);
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
                  ['empresa', 'Empresa'],
                  ['contato_nome', 'Contato'],
                  ['origem', 'Origem'],
                  ['interesse', 'Interesse'],
                  ['valor_estimado', 'Valor'],
                  ['responsavel', 'Responsável'],
                  ['status', 'Etapa'],
                  ['proxima_acao_em', 'Próximo passo'],
                  ['created_at', 'Entrou em'],
                ] as [string, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    className={`sortable-th${sortCol === col ? ' sorted' : ''}`}
                    aria-sort={sortCol === col ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onClick={() => toggleSort(col)}
                  >
                    {label}
                    {/* A seta vem de `icons.tsx`, com os três estados - é a
                        mesma do cabeçalho de Projetos. */}
                    <span className="sort-arrow" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
                      {sortCol === col
                        ? (sortDir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)
                        : <IconChevronUpDown size={12} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(s => {
                const st = statuses.find(x => Number(x.id) === s.current_status_id);
                const atrasada = !!s.proxima_acao_em && s.proxima_acao_em < hojeISO();
                return (
                  <tr key={s.id} onClick={() => setSelectedId(s.id)}>
                    <td>
                      <p style={{ fontWeight: 600 }}>{s.empresa ?? '-'}</p>
                      {s.cnpj && <p className="admin-cell-sub">{s.cnpj}</p>}
                    </td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{s.contato_nome ?? '-'}</p>
                      {/* Cargo e telefone embaixo do nome: numa ligação, é o que
                          se procura junto. */}
                      <p className="admin-cell-sub">
                        {[s.contato_cargo, s.contato_telefone].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{s.origem ?? '-'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{s.interesse ?? '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtValor(s.valor_estimado)}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{s.responsavel_nome ?? '-'}</td>
                    <td>
                      {st ? (
                        <span className="admin-badge" style={{ background: `${st.cor}18`, color: st.cor }}>{st.nome}</span>
                      ) : <span style={{ color: 'var(--gray2)', fontSize: 12 }}>-</span>}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {s.proxima_acao ? (
                        <>
                          <p>{s.proxima_acao}</p>
                          {s.proxima_acao_em && (
                            <p className="admin-cell-sub" style={atrasada ? { color: 'var(--red)' } : undefined}>
                              {fmtDataBR(s.proxima_acao_em)}
                            </p>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--gray2)' }}>-</span>}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {new Date(s.created_at).toLocaleDateString('pt-BR')}
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
          etapaInicial={showCreate.etapa}
          token={token}
          onClose={() => setShowCreate(null)}
          onCreated={sub => {
            setSubmissions(prev => [sub, ...prev]);
            setShowCreate(null);
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

      {pendingPerdaBoard && (
        <MotivoPerdaModal
          statusName={statuses.find(st => Number(st.id) === pendingPerdaBoard.statusId)?.nome ?? 'esta etapa'}
          inicial={String(submissions.find(s => s.id === pendingPerdaBoard.subId)?.motivo_perda ?? '')}
          onConfirm={confirmBoardPerda}
          onCancel={() => setPendingPerdaBoard(null)}
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

      {pendingClearExec && (
        <Dialogo
          titulo="Limpar a data do fechamento?"
          descricao={<>
            Mover para <strong>{statuses.find(st => Number(st.id) === pendingClearExec.statusId)?.nome}</strong> vai
            <strong> limpar a data do fechamento</strong> registrada. Deseja continuar?
          </>}
          zIndex={1100}
          onFechar={() => setPendingClearExec(null)}
          onConfirmar={confirmBoardClearExec}
        />
      )}
    </div>
  );
}
