import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { IconCheck } from '../components/icons';
import { createPortal } from 'react-dom';
import { maskCurrency, parseCurrency } from '../lib/masks';
import { useToast, useAuth } from './AdminApp';
import { DatePicker } from '../components/DatePicker';
import { ExecutionDateModal } from '../components/ExecutionDateModal';
import { SegSwitch } from '../components/SegSwitch';
import type { LiquidezTx, LiquidezSource, LiquidezType, LiquidezCategory, LiquidezTxInput, Submission, StatusConfig } from './types';
import { useApi, DetailPanel, PendenciaMoveModal } from './SolicitacoesPage';

// ── Count-up animation ────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 750, delay = 0): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    if (!target) return;
    let raf: number;
    const t = setTimeout(() => {
      let startTs = 0;
      const tick = (ts: number) => {
        if (!startTs) startTs = ts;
        const p = Math.min((ts - startTs) / duration, 1);
        setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
        if (p < 1) raf = requestAnimationFrame(tick);
        else setVal(target);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [target, duration, delay]);
  return val;
}

// ── Date utilities ────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayISO(): string {
  return toISO(new Date());
}

function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 4);
  const startDay = String(start.getDate()).padStart(2, '0');
  const endDay   = String(end.getDate()).padStart(2, '0');
  const capMonth = (d: Date) => {
    const s = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  if (start.getMonth() === end.getMonth()) {
    return `${startDay} a ${endDay} ${capMonth(end)} ${end.getFullYear()}`;
  }
  return `${startDay} ${capMonth(start)} a ${endDay} ${capMonth(end)} ${end.getFullYear()}`;
}

function formatDayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const wd = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${String(d).padStart(2, '0')}`;
}

function formatDayName(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const wd = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  return wd.charAt(0).toUpperCase() + wd.slice(1);
}

function formatDayFull(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const wd = date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
  const mo = date.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${String(d).padStart(2, '0')} ${mo.charAt(0).toUpperCase() + mo.slice(1)}`;
}

function formatMonthLabel(year: number, month: number): string {
  const s = new Date(year, month, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type ViewMode = 'diaria' | 'semanal' | 'mensal';

function fmtD(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function fmtMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  return `${s.charAt(0).toUpperCase() + s.slice(1)} ${y}`;
}

function getWeeksForMonth(ym: string, todayMonday: Date): { start: string; end: string; offset: number }[] {
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0);
  let cursor = getMonday(new Date(y, m - 1, 1));
  const weeks: { start: string; end: string; offset: number }[] = [];
  while (cursor <= lastDay) {
    const offset = Math.round((cursor.getTime() - todayMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
    weeks.push({ start: toISO(cursor), end: toISO(addDays(cursor, 4)), offset });
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<LiquidezSource, { label: string; color: string }> = {
  interno: { label: 'Interno', color: '#00C9A7' },
  atlas:   { label: 'Atlas',   color: '#2563EB' },
  fidc:    { label: 'FIDC',    color: '#7C3AED' },
};

const CATEGORY_OPTIONS: Record<LiquidezType, { value: string; label: string }[]> = {
  entrada: [
    { value: 'reembolso',   label: 'Reembolso' },
    { value: 'novo_aporte', label: 'Novo Aporte' },
    { value: 'rendimento',  label: 'Rendimento' },
    { value: 'outros',      label: 'Outros' },
  ],
  saida: [
    { value: 'saque_principal',       label: 'Saque de Principal' },
    { value: 'desembolso_recebiveis', label: 'Desembolso Recebíveis' },
    { value: 'spread_taxa',           label: 'Spread / Taxa' },
    { value: 'outros',                label: 'Outros' },
  ],
};

const CATEGORY_LABEL: Record<string, string> = {
  reembolso: 'Reembolso', novo_aporte: 'Novo Aporte', rendimento: 'Rendimento',
  saque_principal: 'Saque de Principal', desembolso_recebiveis: 'Desembolso Recebíveis',
  spread_taxa: 'Spread / Taxa', outros: 'Outros',
};

const CUSTOM_CAT_KEY = 'liquidez_custom_categories';
function loadCustomCategories(): Record<LiquidezType, string[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_CAT_KEY);
    return raw ? { entrada: [], saida: [], ...JSON.parse(raw) } : { entrada: [], saida: [] };
  } catch { return { entrada: [], saida: [] }; }
}
function saveCustomCategories(cats: Record<LiquidezType, string[]>) {
  try { localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(cats)); } catch {}
}

function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function fmtBRLShort(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000)     return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

// ── LiquidezCard ──────────────────────────────────────────────────────────────

function LiquidezCard({ tx, onEdit, onDelete, onToggleRealized }: {
  tx: LiquidezTx;
  onEdit: () => void;
  onDelete: () => void;
  onToggleRealized: () => void;
}) {
  const [pendingDelete, setPendingDelete] = useState(false);
  const [hovered, setHovered] = useState(false);
  const src = SOURCE_CONFIG[tx.source];
  const isEntrada = tx.type === 'entrada';
  const realized = tx.realized;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPendingDelete(false); }}
      onClick={() => !pendingDelete && onEdit()}
      style={{
        position: 'relative',
        background: hovered ? src.color + '08' : 'var(--white)',
        borderRadius: 10,
        border: `1px solid ${hovered ? src.color + '44' : 'var(--gray3)'}`,
        borderLeft: `3px solid ${src.color}`,
        padding: '9px 10px 9px 9px',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px) translateZ(0)' : 'translateZ(0)',
        boxShadow: hovered ? `0 4px 14px rgba(0,0,0,0.09)` : 'none',
        transition: 'all 0.18s ease',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 5,
        userSelect: 'none',
        opacity: realized ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {/* Toggle realizado */}
          <div
            onClick={e => { e.stopPropagation(); onToggleRealized(); }}
            title={realized ? 'Marcar como previsto' : 'Marcar como realizado'}
            style={{
              width: 14, height: 14, borderRadius: 3, flexShrink: 0,
              border: `1.5px solid ${realized ? 'var(--green)' : 'var(--gray3)'}`,
              background: realized ? 'var(--green)' : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!realized) { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.background = '#dcfce7'; } }}
            onMouseLeave={e => { if (!realized) { e.currentTarget.style.borderColor = 'var(--gray3)'; e.currentTarget.style.background = 'transparent'; } }}
          >
            {realized && (
              <svg width={8} height={8} viewBox="0 0 10 10" fill="none">
                <path d="M2 5l2 2.5L8 3" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: isEntrada ? 'var(--green)' : 'var(--red)' }}>
          {isEntrada ? '+' : '−'}{fmtBRLShort(tx.amount)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 11, color: isEntrada ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
          {isEntrada ? '↑' : '↓'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 500, textDecoration: realized ? 'line-through' : 'none' }}>
          {CATEGORY_LABEL[tx.category] ?? tx.category}
        </span>
      </div>

      {tx.description && (
        <p style={{ fontSize: 11, color: 'var(--gray2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', margin: 0, textDecoration: realized ? 'line-through' : 'none' }}>
          {tx.description}
        </p>
      )}

      {hovered && !pendingDelete && (
        <div style={{ position: 'absolute', top: 7, right: 7, display: 'flex', gap: 4, animation: 'fadeIn 0.12s ease both' }}>
          <div
            onClick={e => { e.stopPropagation(); setPendingDelete(true); }}
            title="Excluir"
            style={{
              width: 20, height: 20, borderRadius: 5,
              background: 'var(--white)', border: '1px solid rgba(220,38,38,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = '#DC2626'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.25)'; }}
          >
            <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M4.5 3V2h3v1M3.5 3l.6 7h3.8l.6-7" stroke="#DC2626" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.95)',
            borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, zIndex: 1,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 500 }}>Excluir?</span>
          <button
            onClick={e => { e.stopPropagation(); onDelete(); }}
            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
          >Sim</button>
          <button
            onClick={e => { e.stopPropagation(); setPendingDelete(false); }}
            style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: 'transparent', color: 'var(--gray)', border: '1px solid var(--gray3)', borderRadius: 5, cursor: 'pointer' }}
          >Não</button>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: -6, left: 0, right: 0, height: 6 }} />
    </div>
  );
}

// ── Submission helpers ────────────────────────────────────────────────────────

const SUB_COLOR = '#6366F1';

function subValor(sub: Submission): number {
  return sub.valor ? parseCurrency(sub.valor) : 0;
}

function submissionDay(
  sub: Submission,
  rangeStart: string,
  rangeEnd: string,
  currentWeekMonday: string,
): string | null {
  if (!sub.created_at) return null;
  const isoDate = (s: string) => s.replace('T', ' ').split(' ')[0];

  // Executada: ancora na semana da data de execução (registro fixo, sem rollover)
  if (sub.data_execucao) {
    const exec = isoDate(String(sub.data_execucao));
    return (exec >= rangeStart && exec <= rangeEnd) ? exec : null;
  }

  // Não executada com previsão: posiciona pela previsão de execução
  if (sub.previsao_execucao) {
    const prev = isoDate(String(sub.previsao_execucao));
    if (prev >= rangeStart && prev <= rangeEnd) return prev;
    // Rollover: previsão vencida (antes do range) sobe para a segunda da semana atual/futura
    if (prev < rangeStart && rangeStart >= currentWeekMonday) return rangeStart;
    return null;
  }

  const created = isoDate(sub.created_at);

  // Closed submissions (fim_type set) anchor to status_since - the week they were finalized
  if (sub.fim_type && sub.status_since) {
    const finalized = isoDate(sub.status_since);
    return (finalized >= rangeStart && finalized <= rangeEnd) ? finalized : null;
  }

  // Open submissions: appear in the week they were created
  if (created >= rangeStart && created <= rangeEnd) return created;
  // Rollover: open submissions from before rangeStart appear on Monday of current/future ranges
  if (created < rangeStart && rangeStart >= currentWeekMonday) return rangeStart;
  return null;
}

// ── LiquidezSubmissionCard ────────────────────────────────────────────────────

function LiquidezSubmissionCard({ sub, onClick, realized = false, statuses, onStatusChange }: {
  sub: Submission;
  onClick: () => void;
  realized?: boolean;
  statuses?: { id: number; nome: string; cor: string }[];
  onStatusChange?: (id: string, statusId: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const valor = subValor(sub);
  const nome = sub.nome_contratado ?? sub.nome_sacado ?? 'Solicitação';
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        position: 'relative',
        background: hovered ? SUB_COLOR + '08' : 'var(--white)',
        borderRadius: 10,
        border: `1px solid ${hovered ? SUB_COLOR + '44' : 'var(--gray3)'}`,
        borderLeft: `3px solid ${SUB_COLOR}`,
        padding: '9px 10px 9px 9px',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px) translateZ(0)' : 'translateZ(0)',
        boxShadow: hovered ? `0 4px 14px rgba(0,0,0,0.09)` : 'none',
        transition: 'all 0.18s ease',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        display: 'flex', flexDirection: 'column', gap: 5,
        userSelect: 'none',
        opacity: realized ? 0.65 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={e => e.stopPropagation()}>
          {statuses && onStatusChange && (
            <StatusCell
              rowKey={sub.id}
              currentStatusId={sub.current_status_id != null ? Number(sub.current_status_id) : null}
              statuses={statuses}
              onStatusChange={onStatusChange}
              size="sm"
            />
          )}
        </div>
        {valor > 0 && (
          <span style={{ fontSize: 13, fontWeight: 700, color: realized ? 'var(--green)' : 'var(--red)' }}>
            −{fmtBRLShort(valor)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: realized ? 'line-through' : 'none' }}>
        {nome}
      </div>
      {sub.nome_sacado && sub.nome_contratado && (
        <div style={{ fontSize: 10, color: 'var(--gray2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: realized ? 'line-through' : 'none' }}>
          Sacado: {sub.nome_sacado}
        </div>
      )}
      {/* Extends hover zone below card to prevent flicker from translateY gap */}
      <div style={{ position: 'absolute', bottom: -6, left: 0, right: 0, height: 6 }} />
    </div>
  );
}

// ── LiquidezSubmissionsSection ────────────────────────────────────────────────

function LiquidezSubmissionsSection({ subs, statuses, executadaStatusId, onSubClick, onSubStatusChange }: {
  subs: Submission[];
  statuses: { id: number; nome: string; cor: string }[];
  executadaStatusId?: number | null;
  onSubClick?: (id: string) => void;
  onSubStatusChange?: (id: string, statusId: number) => void;
}) {
  const [hovRow, setHovRow] = useState<string | null>(null);
  if (subs.length === 0) return null;

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--gray3)', overflow: 'hidden' }}>
      {/* header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--gray3)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--bg)',
      }}>
        <svg width={13} height={13} viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="12" rx="3" stroke="var(--gray2)" strokeWidth="1.5"/>
          <path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="var(--gray2)" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Solicitações da semana
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
          background: 'var(--gray3)', color: 'var(--gray2)',
        }}>{subs.length}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'var(--red)' }}>
          −{fmtBRL(subs.reduce((acc, s) => acc + subValor(s), 0))}
        </span>
      </div>

      {/* rows */}
      {subs.map(sub => {
        const valor = subValor(sub);
        const nome = sub.nome_contratado ?? sub.nome_sacado ?? 'Solicitação';
        const sacado = sub.nome_sacado && sub.nome_contratado ? sub.nome_sacado : null;
        const isExec = executadaStatusId != null
          ? Number(sub.current_status_id) === executadaStatusId
          : !!(statuses.find(s => s.id === Number(sub.current_status_id))?.nome?.toLowerCase().includes('execut'));
        const isHov = hovRow === sub.id;

        return (
          <div
            key={sub.id}
            onMouseEnter={() => setHovRow(sub.id)}
            onMouseLeave={() => setHovRow(null)}
            onClick={() => onSubClick?.(sub.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 16px',
              borderBottom: '1px solid var(--gray3)',
              background: isHov ? 'var(--bg)' : 'var(--white)',
              cursor: 'pointer',
              transition: 'background 0.12s',
              opacity: isExec ? 0.55 : 1,
            }}
          >
            {/* status badge */}
            <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
              <StatusCell
                rowKey={sub.id}
                currentStatusId={sub.current_status_id != null ? Number(sub.current_status_id) : null}
                statuses={statuses}
                onStatusChange={onSubStatusChange ?? (() => {})}
                size="sm"
                showLabel
              />
            </div>

            {/* nome + sacado */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: isExec ? 'line-through' : 'none' }}>
                {nome}
              </div>
              {sacado && (
                <div style={{ fontSize: 10, color: 'var(--gray2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: isExec ? 'line-through' : 'none' }}>
                  {sacado}
                </div>
              )}
            </div>

            {/* valor */}
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--red)', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: isExec ? 'line-through' : 'none' }}>
              {valor > 0 ? `−${fmtBRLShort(valor)}` : '-'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── LiquidezDayColumn ─────────────────────────────────────────────────────────

function LiquidezDayColumn({ date, isTodayCol, txs, onAdd, onEdit, onDelete, onToggleRealized }: {
  date: string;
  isTodayCol: boolean;
  txs: LiquidezTx[];
  onAdd: () => void;
  onEdit: (tx: LiquidezTx) => void;
  onDelete: (id: string) => void;
  onToggleRealized?: (id: string) => void;
}) {
  const net = txs.reduce((acc, tx) => acc + (tx.type === 'entrada' ? tx.amount : -tx.amount), 0);
  const totalItems = txs.length;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 180,
      background: isTodayCol ? 'rgba(0, 201, 167,0.04)' : 'var(--bg)',
      border: `1.5px solid ${isTodayCol ? 'var(--yellow)' : 'var(--gray3)'}`,
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.15s, background 0.15s',
      minHeight: 200,
    }}>
      <div style={{
        padding: '10px 12px',
        borderBottom: `1px solid ${isTodayCol ? 'var(--yb)' : 'var(--gray3)'}`,
        background: isTodayCol ? 'rgba(0, 201, 167,0.06)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: isTodayCol ? 'var(--yellow)' : 'var(--black)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {formatDayName(date)}
            {isTodayCol && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 8,
                background: 'var(--yellow)', color: 'var(--on-yellow)',
              }}>Hoje</span>
            )}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray2)', fontWeight: 500, marginTop: 2 }}>{fmtD(date)}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {txs.length > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {net >= 0 ? '+' : '−'}{fmtBRL(Math.abs(net))}
            </span>
          )}
          <button
            onClick={onAdd}
            title="Adicionar lançamento"
            style={{
              width: 20, height: 20, borderRadius: 6,
              border: '1px solid var(--gray3)', background: 'transparent',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--gray2)', fontSize: 14, lineHeight: 1, fontWeight: 400,
              transition: 'all 0.15s', flexShrink: 0, padding: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--yd)';
              e.currentTarget.style.borderColor = 'var(--yellow)';
              e.currentTarget.style.color = 'var(--yellow)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--gray3)';
              e.currentTarget.style.color = 'var(--gray2)';
            }}
          >+</button>
          {totalItems > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isTodayCol ? 'var(--yellow)' : 'var(--gray3)',
              color: isTodayCol ? 'var(--on-yellow)' : 'var(--gray2)',
            }}>{totalItems}</span>
          )}
        </div>
      </div>

      <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        {totalItems === 0 ? (
          <button
            onClick={onAdd}
            style={{
              width: '100%', minHeight: 60,
              border: '1.5px dashed var(--gray3)',
              borderRadius: 8, background: 'transparent',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              color: 'var(--gray2)', fontSize: 11, fontWeight: 500,
              transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--yellow)'; e.currentTarget.style.color = 'var(--yellow)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray3)'; e.currentTarget.style.color = 'var(--gray2)'; }}
          >
            <svg width={14} height={14} viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>
            </svg>
            Adicionar
          </button>
        ) : (
          txs.map(tx => (
            <LiquidezCard key={tx.id} tx={tx} onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx.id)} onToggleRealized={() => onToggleRealized?.(tx.id)} />
          ))
        )}
      </div>
    </div>
  );
}

// ── LiquidezSummary ───────────────────────────────────────────────────────────

function StatCard({ label, value, accent, sub, realized, previsto, index = 0 }: {
  label: string; value: number; accent: string; sub?: string;
  realized?: number; previsto?: number; index?: number;
}) {
  const [hov, setHov] = useState(false);
  const countedTotal    = useCountUp(Math.round(value),    750, index * 60);
  const countedRealized = useCountUp(Math.round(realized ?? 0), 750, index * 60 + 80);
  const display = value === 0 ? '-' : fmtBRLShort(countedTotal);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, minWidth: 0,
        background: 'var(--white)',
        border: '1px solid var(--gray3)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column',
        cursor: 'default',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease',
        transform: hov ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        boxShadow: hov
          ? `0 10px 28px rgba(0,0,0,0.10), inset 0 0 0 1px ${accent}30`
          : 'var(--shadow)',
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 800, color: 'var(--gray2)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 800, color: accent,
        lineHeight: 1, letterSpacing: '-0.02em',
      }}>
        {display}
      </div>
      {(realized !== undefined && previsto !== undefined) ? (
        <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Progress bar */}
          <div style={{ height: 3, background: 'var(--gray3)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99, background: accent,
              width: value > 0 ? `${Math.min(100, (realized / value) * 100)}%` : '0%',
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--gray2)', fontWeight: 500 }}>
              <span style={{ color: accent, display: 'inline-flex' }}><IconCheck size={12} /></span> {fmtBRLShort(countedRealized)}
            </span>
            <span style={{ fontSize: 10, color: 'var(--gray2)', fontWeight: 500 }}>
              {fmtBRLShort(previsto)} prev.
            </span>
          </div>
        </div>
      ) : sub ? (
        <div style={{ fontSize: 10, color: 'var(--gray2)', marginTop: 4, fontWeight: 500 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function MetaLiquidezCard({ value, index = 2 }: { value: number; index?: number }) {
  const [hov, setHov] = useState(false);
  const counted = useCountUp(Math.round(value), 750, index * 60);
  const met = value === 0;
  const ACCENT = 'var(--yellow)';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, minWidth: 0,
        background: 'var(--white)',
        borderTop: `1px solid ${hov ? (met ? '#86EFAC88' : 'var(--yb)') : 'var(--gray3)'}`,
        borderRight: `1px solid ${hov ? (met ? '#86EFAC88' : 'var(--yb)') : 'var(--gray3)'}`,
        borderBottom: `1px solid ${hov ? (met ? '#86EFAC88' : 'var(--yb)') : 'var(--gray3)'}`,
        borderLeft: `4px solid ${ACCENT}`,
        borderRadius: 12,
        padding: '12px 16px',
        display: 'flex', flexDirection: 'column',
        cursor: 'default',
        transition: 'transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease',
        transform: hov ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
        boxShadow: hov
          ? `0 10px 28px ${met ? 'rgba(34,197,94,0.12)' : 'rgba(255,180,0,0.18)'}, inset 0 0 0 1px ${ACCENT}30`
          : 'var(--shadow)',
      }}
    >
      <div style={{
        fontSize: 10, fontWeight: 800, color: 'var(--gray2)',
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <svg width={11} height={11} viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="7" stroke="var(--yellow)" strokeWidth="1.5"/>
          <circle cx="8" cy="8" r="4" stroke="var(--yellow)" strokeWidth="1.5"/>
          <circle cx="8" cy="8" r="1.5" fill="var(--yellow)"/>
        </svg>
        Meta de Captação
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: ACCENT, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {met ? '-' : fmtBRLShort(counted)}
      </div>
      <div style={{ fontSize: 10, color: 'var(--gray2)', marginTop: 4, fontWeight: 500 }}>
        {met ? 'Semana coberta' : 'Necessário para cobrir saídas'}
      </div>
    </div>
  );
}

function LiquidezSummary({ transactions, submissions = [], executadaStatusId, statuses = [], weekStart, token }: { transactions: LiquidezTx[]; submissions?: Submission[]; executadaStatusId?: number | null; statuses?: { id: number; nome: string; cor: string }[]; weekStart: string; token: string }) {
  const [hovSource, setHovSource] = useState<LiquidezSource | null>(null);
  const [saldoInput, setSaldoInput] = useState<Record<LiquidezSource, string>>({ interno: '', atlas: '', fidc: '' });
  const [editingSource, setEditingSource] = useState<LiquidezSource | null>(null);

  useEffect(() => {
    setSaldoInput({ interno: '', atlas: '', fidc: '' });
    fetch(`/api/liquidez?saldos=1&week_start=${weekStart}`, { headers: { 'x-admin-session': token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.saldos) return;
        setSaldoInput(prev => ({
          ...prev,
          ...Object.fromEntries(
            Object.entries(data.saldos as Record<string, number>).map(([s, v]) => [s, v > 0 ? maskCurrency(String(Math.round(v * 100))) : ''])
          ),
        }));
      })
      .catch(() => {});
  }, [weekStart, token]);

  function handleSaldoChange(s: LiquidezSource, val: string) {
    const masked = maskCurrency(val);
    setSaldoInput(prev => ({ ...prev, [s]: masked }));
  }

  function handleSaldoBlur(s: LiquidezSource) {
    const amount = saldoInput[s] ? parseCurrency(saldoInput[s]) : 0;
    fetch('/api/liquidez', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'set_saldo', week_start: weekStart, source: s, amount }),
    }).catch(() => {});
  }

  function saldoValue(s: LiquidezSource): number {
    return saldoInput[s] ? parseCurrency(saldoInput[s]) : 0;
  }

  const { totalEntradas, totalSaidas, saldo, realizedEntradas, realizedSaidas, volumeBySource, entradaBySource, saidaBySource, totalVolume } = useMemo(() => {
    let totalEntradas = 0, totalSaidas = 0, realizedEntradas = 0, realizedSaidas = 0;
    const volumeBySource: Record<LiquidezSource, number> = { interno: 0, atlas: 0, fidc: 0 };
    const entradaBySource: Record<LiquidezSource, number> = { interno: 0, atlas: 0, fidc: 0 };
    const saidaBySource: Record<LiquidezSource, number>   = { interno: 0, atlas: 0, fidc: 0 };
    for (const tx of transactions) {
      if (tx.type === 'entrada') {
        totalEntradas += tx.amount;
        entradaBySource[tx.source] += tx.amount;
        if (tx.realized) realizedEntradas += tx.amount;
      } else {
        totalSaidas += tx.amount;
        saidaBySource[tx.source] += tx.amount;
        if (tx.realized) realizedSaidas += tx.amount;
      }
      volumeBySource[tx.source] += tx.amount;
    }
    for (const sub of submissions) {
      const val = subValor(sub);
      totalSaidas += val;
      const isExec = executadaStatusId != null
        ? Number(sub.current_status_id) === executadaStatusId
        : !!(statuses.find(s => s.id === Number(sub.current_status_id))?.nome?.toLowerCase().includes('execut'));
      if (isExec) realizedSaidas += val;
    }
    return {
      totalEntradas, totalSaidas, realizedEntradas, realizedSaidas,
      saldo: totalEntradas - totalSaidas,
      volumeBySource, entradaBySource, saidaBySource,
      totalVolume: totalEntradas + totalSaidas,
    };
  }, [transactions, submissions, executadaStatusId, statuses]);

  const sources: LiquidezSource[] = ['interno', 'atlas', 'fidc'];
  const saldoAccent = saldo >= 0 ? 'var(--green)' : 'var(--red)';

  // Donut - baseado nos saldos manuais por origem
  const totalSaldoOrigens = sources.reduce((acc, s) => acc + saldoValue(s), 0);
  const r = 38, circ = 2 * Math.PI * r, SW = 14, SW_HOV = 19, gapLen = 3;
  const entries = sources.filter(s => saldoValue(s) > 0);
  let cum = 0;
  const slices = entries.map(s => {
    const sv  = saldoValue(s);
    const len = (sv / totalSaldoOrigens) * circ;
    const drawLen = entries.length > 1 ? Math.max(len - gapLen, 0.1) : len;
    const offset = circ * 0.25 - cum;
    cum += len;
    return {
      source: s,
      color: SOURCE_CONFIG[s].color,
      label: SOURCE_CONFIG[s].label,
      value: sv,
      drawLen, offset,
      pct: ((sv / totalSaldoOrigens) * 100).toFixed(0),
    };
  });
  const hovSlice = hovSource ? slices.find(s => s.source === hovSource) ?? null : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Stat cards ── */}
      <div style={{ display: 'flex', gap: 10 }}>
        <StatCard label="Entradas" value={totalEntradas} accent="var(--green)" realized={realizedEntradas} previsto={totalEntradas - realizedEntradas} index={0} />
        <StatCard label="Saídas"   value={totalSaidas}   accent="var(--red)"   realized={realizedSaidas}   previsto={totalSaidas - realizedSaidas}   index={1} />
        <MetaLiquidezCard value={Math.max(0, totalSaidas - (totalEntradas + totalSaldoOrigens))} index={2} />
      </div>

      {/* ── Donut card ── */}
      <div style={{
        background: 'var(--white)', border: '1px solid var(--gray3)',
        borderRadius: 12, padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: 28,
        boxShadow: 'var(--shadow)',
      }}>
          {/* Donut */}
          <div style={{ position: 'relative', width: 130, height: 130, flexShrink: 0 }}>
            <svg width="130" height="130" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={r} fill="none" stroke="var(--gray3)" strokeWidth={SW} />
              {slices.map(s => (
                <circle
                  key={s.source}
                  cx="50" cy="50" r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={hovSource === s.source ? SW_HOV : SW}
                  strokeDasharray={`${s.drawLen} ${circ - s.drawLen}`}
                  strokeDashoffset={s.offset}
                  style={{
                    transition: 'opacity 0.22s ease, stroke-width 0.2s ease',
                    opacity: hovSource && hovSource !== s.source ? 0.22 : 1,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHovSource(s.source)}
                  onMouseLeave={() => setHovSource(null)}
                />
              ))}
            </svg>
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              {hovSlice ? (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: hovSlice.color, lineHeight: 1 }}>
                    {fmtBRLShort(hovSlice.value)}
                  </div>
                  <div style={{ fontSize: 10, color: hovSlice.color, fontWeight: 700, opacity: 0.75 }}>
                    {hovSlice.pct}%
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--black)', lineHeight: 1 }}>
                    {totalSaldoOrigens > 0 ? fmtBRLShort(totalSaldoOrigens) : '-'}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--gray2)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 2 }}>
                    saldo
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
            {sources.map(s => {
              const vol    = volumeBySource[s];
              const isH    = hovSource === s;
              const color  = SOURCE_CONFIG[s].color;
              const saldo  = saldoValue(s);
              const pct    = totalSaldoOrigens > 0 ? ((saldo / totalSaldoOrigens) * 100).toFixed(0) : '0';
              const isEdit = editingSource === s;
              return (
                <div
                  key={s}
                  onMouseEnter={() => setHovSource(s)}
                  onMouseLeave={() => setHovSource(null)}
                  style={{
                    opacity: hovSource && hovSource !== s ? 0.28 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <div style={{
                      width: 9, height: 9, borderRadius: '50%', background: color, flexShrink: 0,
                      transform: isH ? 'scale(1.5)' : 'scale(1)', transition: 'transform 0.15s ease',
                    }} />
                    <span style={{ fontSize: 12, color: 'var(--gray)', flex: 1, fontWeight: 500, minWidth: 44 }}>
                      {SOURCE_CONFIG[s].label}
                    </span>
                    {isEdit ? (
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={saldoInput[s]}
                        placeholder="R$ 0,00"
                        onChange={e => handleSaldoChange(s, e.target.value)}
                        onBlur={() => { setEditingSource(null); handleSaldoBlur(s); }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setEditingSource(null); handleSaldoBlur(s); } }}
                        style={{
                          fontSize: 13, fontWeight: 800, color: 'var(--black)',
                          border: `1px solid ${color}55`, borderRadius: 5,
                          padding: '2px 6px', background: 'var(--white)',
                          outline: 'none', width: 130, textAlign: 'right',
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingSource(s)}
                        title="Clique para editar saldo"
                        style={{
                          fontSize: 13, fontWeight: 800,
                          color: saldo > 0 ? color : 'var(--gray2)',
                          background: 'transparent', border: 'none',
                          cursor: 'pointer', padding: '2px 4px',
                          borderRadius: 4, transition: 'background 0.12s',
                          fontFamily: 'inherit',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        {saldo > 0 ? fmtBRL(saldo) : <span style={{ opacity: 0.4, fontSize: 11 }}>Inserir saldo…</span>}
                      </button>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--gray2)', minWidth: 32, textAlign: 'right', fontWeight: 600 }}>
                      {saldo > 0 ? `${pct}%` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
      </div>
    </div>
  );
}

// ── LiquidezWeekNav ──────────────────────────────────────────────────────────

function LiquidezWeekNav({ weekStart, weekOffset, onPrev, onNext, onToday, onJump }: {
  weekStart: Date;
  weekOffset: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onJump: (offset: number) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState('');
  const centerRef = useRef<HTMLButtonElement>(null);

  const todayMonday = useMemo(() => getMonday(new Date()), []);
  const weekStartISO = toISO(weekStart);
  const weekEndISO   = toISO(addDays(weekStart, 4));

  const ws = weekOffset === 0 ? 'current' : weekOffset < 0 ? 'past' : 'future';
  const wsLabel = ws === 'current' ? 'Atual' : ws === 'past' ? 'Passada' : 'Planejada';
  const wsColor = ws === 'current' ? 'var(--yellow)' : ws === 'past' ? '#94A3B8' : '#3B82F6';

  useEffect(() => {
    if (!pickerOpen) return;
    function h(e: MouseEvent) {
      if (centerRef.current && !centerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [pickerOpen]);

  function openPicker() {
    const ym = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}`;
    setPickerMonth(ym);
    setPickerOpen(o => !o);
  }

  const availableMonths = useMemo(() => {
    const months: string[] = [];
    for (let i = -12; i <= 12; i++) {
      const d = addDays(todayMonday, i * 7);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months.includes(ym)) months.push(ym);
    }
    return months.sort();
  }, [todayMonday]);

  const monthIdx    = availableMonths.indexOf(pickerMonth);
  const pickerWeeks = pickerMonth ? getWeeksForMonth(pickerMonth, todayMonday) : [];

  const navBtnStyle = (disabled: boolean): React.CSSProperties => ({
    width: 22, height: 22, borderRadius: '50%',
    border: '1px solid var(--gray3)', background: 'transparent',
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.3 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: 'var(--gray)', flexShrink: 0, fontSize: 14, lineHeight: 1,
  });

  const circleBtn = (onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--gray3)',
      background: 'var(--white)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gray)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray3)'; }}
    >{children}</button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {circleBtn(onPrev,
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <path d="M6 2L3 5l3 3" stroke="var(--gray)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}

      <div style={{ position: 'relative' }}>
        <button
          ref={centerRef}
          onClick={openPicker}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 18px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${pickerOpen ? 'var(--yellow)' : 'var(--gray3)'}`,
            background: pickerOpen ? 'var(--yd)' : 'var(--white)',
            transition: 'all 0.15s', minWidth: 200, justifyContent: 'center',
          }}
        >
          {ws === 'current' && (
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--yellow)', display: 'inline-block', flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--black)' }}>
            {fmtD(weekStartISO)} a {fmtD(weekEndISO)}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: wsColor }}>{wsLabel}</span>
          <svg width={9} height={6} viewBox="0 0 9 6" fill="none"
            style={{ opacity: 0.4, transform: pickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }}>
            <path d="M1 1L4.5 5L8 1" stroke="var(--gray)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {pickerOpen && createPortal(
          (() => {
            const rect = centerRef.current?.getBoundingClientRect();
            return (
              <div onMouseDown={e => e.stopPropagation()} style={{
                position: 'fixed',
                top: (rect?.bottom ?? 0) + 6,
                left: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
                transform: 'translateX(-50%)',
                zIndex: 3000, background: 'var(--white)',
                border: '1px solid var(--gray3)', borderRadius: 12,
                boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
                padding: '6px', minWidth: 230,
                animation: 'fadeIn 0.12s ease both',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '4px 6px 8px', borderBottom: '1px solid var(--gray3)', marginBottom: 4,
                }}>
                  <button disabled={monthIdx <= 0} onClick={e => { e.stopPropagation(); setPickerMonth(availableMonths[monthIdx - 1]); }} style={navBtnStyle(monthIdx <= 0)}>‹</button>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--black)' }}>{fmtMonth(pickerMonth)}</span>
                  <button disabled={monthIdx >= availableMonths.length - 1} onClick={e => { e.stopPropagation(); setPickerMonth(availableMonths[monthIdx + 1]); }} style={navBtnStyle(monthIdx >= availableMonths.length - 1)}>›</button>
                </div>
                {pickerWeeks.map(w => {
                  const active  = w.offset === weekOffset;
                  const wStatus = w.offset === 0 ? 'current' : w.offset < 0 ? 'past' : 'future';
                  const dotColor = wStatus === 'current' ? 'var(--yellow)' : wStatus === 'past' ? '#CBD5E1' : '#93C5FD';
                  return (
                    <button key={w.start} onClick={() => { onJump(w.offset); setPickerOpen(false); }} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: active ? 'var(--yd)' : 'transparent',
                      transition: 'background 0.12s', textAlign: 'left',
                    }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotColor, display: 'inline-block' }} />
                      <span style={{
                        fontSize: 12, fontWeight: active ? 800 : 600, flex: 1,
                        color: wStatus === 'past' ? 'var(--gray2)' : active ? 'var(--yellow)' : 'var(--black)',
                        opacity: wStatus === 'past' ? 0.7 : 1,
                      }}>
                        {fmtD(w.start)} a {fmtD(w.end)}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: wStatus === 'current' ? 'var(--yellow)' : wStatus === 'past' ? '#94A3B8' : '#3B82F6' }}>
                        {wStatus === 'current' ? 'Atual' : wStatus === 'past' ? 'Passada' : 'Planejada'}
                      </span>
                      {active && (
                        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                          <path d="M2 5l2.5 2.5L8 3" stroke="var(--yellow)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })(),
          document.body
        )}
      </div>

      {circleBtn(onNext,
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <path d="M4 2l3 3-3 3" stroke="var(--gray)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}

      {weekOffset !== 0 && (
        <button onClick={onToday} style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          border: '1px solid var(--yellow)', background: 'var(--yd)',
          color: 'var(--yellow)', cursor: 'pointer', transition: 'all 0.15s',
        }}>
          Hoje
        </button>
      )}
    </div>
  );
}

// ── CustomSelect ──────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options, placeholder, disabled, error, onAddNew }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  onAddNew?: (label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const [addMode, setAddMode] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const selected = options.find(o => o.value === value) ?? (value ? { value, label: value } : null);

  function openDropdown() {
    if (disabled) return;
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setAddMode(false);
    setNewLabel('');
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!triggerRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setAddMode(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  useEffect(() => {
    if (addMode) setTimeout(() => addInputRef.current?.focus(), 0);
  }, [addMode]);

  function commitNew() {
    const label = newLabel.trim();
    if (!label) return;
    onAddNew!(label);
    setOpen(false);
    setAddMode(false);
    setNewLabel('');
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        disabled={disabled}
        className={`form-input${error ? ' error' : ''}`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left',
          opacity: disabled ? 0.5 : 1, color: selected ? 'var(--black)' : 'var(--gray2)',
        }}
      >
        <span>{selected ? selected.label : (placeholder ?? 'Selecionar...')}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, marginLeft: 8 }}>
          <path d="M1 1l4 4 4-4" stroke="#888" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, width: pos.width,
            background: '#fff', border: '1.5px solid var(--gray3)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999,
            overflow: 'hidden', animation: 'fadeIn 0.12s ease both',
          }}
        >
          {options.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{
                padding: '10px 14px', fontSize: 13, fontWeight: 500,
                cursor: 'pointer', color: 'var(--black)',
                background: o.value === value ? 'var(--yd)' : 'transparent',
                borderLeft: o.value === value ? '3px solid var(--yellow)' : '3px solid transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (o.value !== value) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = o.value === value ? 'var(--yd)' : 'transparent'; }}
            >
              {o.label}
            </div>
          ))}

          {onAddNew && !addMode && (
            <div
              onClick={() => setAddMode(true)}
              style={{
                padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: 'var(--gray2)', borderTop: '1px solid var(--gray3)',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; (e.currentTarget as HTMLElement).style.color = 'var(--black)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--gray2)'; }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Nova categoria…
            </div>
          )}

          {onAddNew && addMode && (
            <div
              style={{ padding: '10px 12px', borderTop: '1px solid var(--gray3)' }}
              onMouseDown={e => e.stopPropagation()}
            >
              <input
                ref={addInputRef}
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitNew(); }
                  if (e.key === 'Escape') { setAddMode(false); setNewLabel(''); }
                }}
                placeholder="Nome da categoria…"
                style={{
                  width: '100%', padding: '7px 9px', fontSize: 12, borderRadius: 7,
                  border: '1.5px solid var(--gray3)', background: 'var(--bg)',
                  color: 'var(--black)', outline: 'none', boxSizing: 'border-box',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button
                  type="button"
                  onClick={commitNew}
                  disabled={!newLabel.trim()}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700,
                    borderRadius: 6, border: 'none', background: 'var(--black)',
                    color: '#fff', cursor: newLabel.trim() ? 'pointer' : 'not-allowed',
                    opacity: newLabel.trim() ? 1 : 0.4,
                  }}
                >
                  Adicionar
                </button>
                <button
                  type="button"
                  onClick={() => { setAddMode(false); setNewLabel(''); }}
                  style={{
                    padding: '6px 10px', fontSize: 12, fontWeight: 600,
                    borderRadius: 6, border: '1.5px solid var(--gray3)',
                    background: 'none', color: 'var(--gray)', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ── LiquidezModal ─────────────────────────────────────────────────────────────

interface FormState {
  date: string;
  source: LiquidezSource | '';
  type: LiquidezType | '';
  category: string;
  amountStr: string;
  description: string;
}

function LiquidezModal({ mode, initialDate, tx, onSave, onClose }: {
  mode: 'create' | 'edit';
  initialDate?: string;
  tx?: LiquidezTx;
  onSave: (data: LiquidezTxInput) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => ({
    date:        tx?.date        ?? initialDate ?? todayISO(),
    source:      tx?.source      ?? '',
    type:        tx?.type        ?? '',
    category:    tx?.category    ?? '',
    amountStr:   tx ? maskCurrency(String(Math.round(tx.amount * 100))) : '',
    description: tx?.description ?? '',
  }));
  const [saving, setSaving]   = useState(false);
  const [errors, setErrors]   = useState<Record<string, string>>({});

  const [customCats, setCustomCats] = useState(loadCustomCategories);

  const allCatOptions = form.type
    ? [
        ...CATEGORY_OPTIONS[form.type as LiquidezType],
        ...customCats[form.type as LiquidezType].map(c => ({ value: c, label: c })),
      ]
    : [];

  function handleAddCategory(label: string) {
    const type = form.type as LiquidezType;
    const updated = { ...customCats, [type]: [...customCats[type].filter(c => c !== label), label] };
    setCustomCats(updated);
    saveCustomCategories(updated);
    setForm(f => ({ ...f, category: label }));
  }

  function setType(t: LiquidezType) {
    setForm(f => ({ ...f, type: t, category: t !== f.type ? '' : f.category }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.date) e.date = 'Obrigatório';
    else if (isWeekend(form.date)) e.date = 'Selecione um dia útil (seg a sex)';
    if (!form.source) e.source = 'Obrigatório';
    if (!form.type) e.type = 'Obrigatório';
    if (!form.category) e.category = 'Obrigatório';
    if (!form.amountStr || parseCurrency(form.amountStr) <= 0) e.amount = 'Informe um valor maior que zero';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({
        date:        form.date,
        source:      form.source as LiquidezSource,
        type:        form.type as LiquidezType,
        category:    form.category as LiquidezCategory,
        amount:      parseCurrency(form.amountStr),
        description: form.description.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  }

  const modal = (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(18,19,22,0.50)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--white)', borderRadius: 16, width: '100%', maxWidth: 460,
        padding: 28, boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        animation: 'fadeIn 0.2s ease both',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)', margin: 0 }}>
            {mode === 'create' ? 'Novo Lançamento' : 'Editar Lançamento'}
          </h3>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray2)', padding: 4, lineHeight: 0 }}
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Data + Fonte */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <DatePicker
              compact
              label="Data"
              value={form.date}
              onChange={v => setForm(f => ({ ...f, date: v }))}
              error={errors.date}
            />
            <div className="form-group">
              <label className="form-label">Fonte</label>
              <CustomSelect
                value={form.source}
                onChange={v => setForm(f => ({ ...f, source: v as LiquidezSource }))}
                options={[
                  { value: 'interno', label: 'Interno' },
                  { value: 'atlas',   label: 'Atlas' },
                  { value: 'fidc',    label: 'FIDC' },
                ]}
                error={!!errors.source}
              />
              {errors.source && <p className="form-error">{errors.source}</p>}
            </div>
          </div>

          {/* Tipo */}
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['entrada', 'saida'] as LiquidezType[]).map(t => {
                const active = form.type === t;
                const color = t === 'entrada' ? 'var(--green)' : 'var(--red)';
                const bg    = t === 'entrada' ? '#1E8A3E15' : '#D9302515';
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    style={{
                      flex: 1, padding: '10px 0',
                      border: `1.5px solid ${active ? color : 'var(--gray3)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: active ? bg : 'transparent',
                      color: active ? color : 'var(--gray2)',
                      fontWeight: 700, fontSize: 13, cursor: 'pointer',
                      transition: 'all 0.12s', fontFamily: 'inherit',
                    }}
                  >
                    {t === 'entrada' ? '↑ Entrada' : '↓ Saída'}
                  </button>
                );
              })}
            </div>
            {errors.type && <p className="form-error">{errors.type}</p>}
          </div>

          {/* Categoria */}
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <CustomSelect
              value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))}
              options={allCatOptions}
              placeholder={form.type ? 'Selecionar...' : 'Selecione o tipo primeiro'}
              disabled={!form.type}
              error={!!errors.category}
              onAddNew={form.type ? handleAddCategory : undefined}
            />
            {errors.category && <p className="form-error">{errors.category}</p>}
          </div>

          {/* Valor */}
          <div className="form-group">
            <label className="form-label">Valor</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="R$ 0,00"
              className={`form-input${errors.amount ? ' error' : ''}`}
              value={form.amountStr}
              onChange={e => setForm(f => ({ ...f, amountStr: maskCurrency(e.target.value) }))}
            />
            {errors.amount && <p className="form-error">{errors.amount}</p>}
          </div>

          {/* Descrição */}
          <div className="form-group">
            <label className="form-label">
              Descrição <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--gray2)', letterSpacing: 0 }}>(opcional)</span>
            </label>
            <textarea
              className="form-input"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Observações..."
              style={{ resize: 'vertical', minHeight: 60 }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 22 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : mode === 'create' ? 'Adicionar' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── ViewSwitcher ──────────────────────────────────────────────────────────────

const VIEW_OPTIONS: { key: ViewMode; label: string }[] = [
  { key: 'diaria',  label: 'Diária'  },
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensal',  label: 'Mensal'  },
];
const BTN_W = 68;

function ViewSwitcher({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const idx = VIEW_OPTIONS.findIndex(v => v.key === view);
  return (
    <div style={{
      display: 'inline-flex', position: 'relative',
      background: 'var(--bg)', border: '1px solid var(--gray3)',
      borderRadius: 8, padding: 3,
    }}>
      <div style={{
        position: 'absolute', top: 3, bottom: 3,
        width: BTN_W, borderRadius: 6,
        background: 'var(--white)', border: '1px solid var(--gray3)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
        left: 3 + idx * BTN_W,
        pointerEvents: 'none',
      }} />
      {VIEW_OPTIONS.map(v => (
        <button key={v.key} onClick={() => onChange(v.key)} style={{
          position: 'relative', zIndex: 1,
          width: BTN_W, padding: '7px 0',
          borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: 700, textAlign: 'center',
          background: 'transparent',
          color: view === v.key ? 'var(--black)' : 'var(--gray2)',
          transition: 'color 0.2s ease',
        }}>
          {v.label}
        </button>
      ))}
    </div>
  );
}

// ── SimpleNav (diária / mensal) ───────────────────────────────────────────────

function SimpleNav({ label, isCurrent, onPrev, onNext, onToday }: {
  label: string; isCurrent: boolean;
  onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  const circleBtn = (onClick: () => void, children: React.ReactNode) => (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--gray3)',
      background: 'var(--white)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gray)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray3)'; }}
    >{children}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {circleBtn(onPrev,
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <path d="M6 2L3 5l3 3" stroke="var(--gray)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      <button style={{
        padding: '7px 18px', borderRadius: 10, cursor: 'default',
        border: '1px solid var(--gray3)', background: 'var(--white)',
        fontSize: 13, fontWeight: 800, color: 'var(--black)', minWidth: 180,
      }}>
        {label}
      </button>
      {circleBtn(onNext,
        <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
          <path d="M4 2l3 3-3 3" stroke="var(--gray)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {!isCurrent && (
        <button onClick={onToday} style={{
          padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
          border: '1px solid var(--yellow)', background: 'var(--yd)',
          color: 'var(--yellow)', cursor: 'pointer',
        }}>
          Hoje
        </button>
      )}
    </div>
  );
}

// ── LiquidezMonthView ─────────────────────────────────────────────────────────

function LiquidezMonthView({ year, month, transactions, today, onAdd, onEdit, onDelete }: {
  year: number; month: number; transactions: LiquidezTx[]; today: string;
  onAdd: (date: string) => void; onEdit: (tx: LiquidezTx) => void; onDelete: (id: string) => void;
}) {
  const firstDay    = new Date(year, month, 1);
  const lastDay     = new Date(year, month + 1, 0);
  const startMonday = getMonday(firstDay);
  const monthStr    = `${year}-${String(month + 1).padStart(2, '0')}`;

  const weeks: string[][] = [];
  let cursor = new Date(startMonday);
  while (toISO(cursor) <= toISO(lastDay)) {
    weeks.push(Array.from({ length: 5 }, (_, i) => toISO(addDays(cursor, i))));
    cursor = addDays(cursor, 7);
  }

  const txByDay = useMemo(() => {
    const map = new Map<string, LiquidezTx[]>();
    for (const tx of transactions) {
      if (!map.has(tx.date)) map.set(tx.date, []);
      map.get(tx.date)!.push(tx);
    }
    return map;
  }, [transactions]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 6 }}>
        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--gray2)', padding: '4px 0' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
            {week.map(date => {
              const inMonth  = date.startsWith(monthStr);
              const isToday  = date === today;
              const txs      = txByDay.get(date) ?? [];
              const net      = txs.reduce((s, tx) => s + (tx.type === 'entrada' ? tx.amount : -tx.amount), 0);
              const dayNum   = String(Number(date.split('-')[2])).padStart(2, '0');
              const srcSet   = [...new Set(txs.map(tx => tx.source))];

              return (
                <div
                  key={date}
                  onClick={() => onAdd(date)}
                  style={{
                    background: isToday ? 'rgba(0, 201, 167,0.04)' : 'var(--bg)',
                    border: `1.5px solid ${isToday ? 'var(--yellow)' : 'var(--gray3)'}`,
                    borderRadius: 10, padding: '8px 10px', minHeight: 72,
                    opacity: inMonth ? 1 : 0.3,
                    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                  onMouseEnter={e => { if (!isToday) (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray2)'; }}
                  onMouseLeave={e => { if (!isToday) (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray3)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isToday ? 'var(--yellow)' : 'var(--black)' }}>
                      {dayNum}
                    </span>
                    {txs.length > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 800, minWidth: 16, height: 16, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: isToday ? 'var(--yellow)' : 'var(--gray3)',
                        color: isToday ? 'var(--on-yellow)' : 'var(--gray2)',
                      }}>{txs.length}</span>
                    )}
                  </div>
                  {txs.length > 0 && (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 700, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {net >= 0 ? '+' : '−'}{fmtBRLShort(Math.abs(net))}
                      </span>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {srcSet.map(s => (
                          <span key={s} style={{
                            width: 6, height: 6, borderRadius: '50%',
                            background: SOURCE_CONFIG[s].color, flexShrink: 0,
                          }} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

type WeekView = 'diaria' | 'agrupada';

// ── LiquidezGroupedView ───────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, color: 'var(--gray2)',
  letterSpacing: '0.06em', textTransform: 'uppercase',
  padding: '8px 12px', textAlign: 'left',
  borderBottom: '1px solid var(--gray3)', background: 'var(--bg)',
  whiteSpace: 'nowrap',
};

function StatusCell({ rowKey, currentStatusId, statuses, onStatusChange, size = 'md', showLabel = false }: {
  rowKey: string;
  currentStatusId: number | null | undefined;
  statuses: { id: number; nome: string; cor: string }[];
  onStatusChange: (key: string, statusId: number) => void;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, flipUp: false });
  const btnRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const currentStatus = statuses.find(s => s.id === currentStatusId);

  function openPicker(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = btnRef.current!.getBoundingClientRect();
    const dropH = 16 + statuses.length * 36;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({
      top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4,
      left: Math.max(8, rect.right - 180),
      flipUp,
    });
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (!btnRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <>
      <div
        ref={btnRef}
        onClick={openPicker}
        title="Mudar status"
        style={{
          ...(showLabel ? {
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
            padding: '3px 8px', borderRadius: 6,
            border: `1.5px solid ${open ? 'var(--yellow)' : currentStatus ? currentStatus.cor + '55' : 'var(--gray3)'}`,
            background: open ? 'var(--yd)' : currentStatus ? currentStatus.cor + '14' : 'transparent',
            transition: 'all 0.12s', maxWidth: '100%',
          } : {
            width: size === 'sm' ? 16 : 24, height: size === 'sm' ? 16 : 24,
            borderRadius: size === 'sm' ? 4 : 6, cursor: 'pointer', margin: '0 auto',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${open ? 'var(--yellow)' : currentStatus ? currentStatus.cor + '55' : 'var(--gray3)'}`,
            background: open ? 'var(--yd)' : currentStatus ? currentStatus.cor + '14' : 'transparent',
            transition: 'all 0.12s',
          }),
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--yellow)'; (e.currentTarget as HTMLElement).style.background = 'var(--yd)'; }}
        onMouseLeave={e => { if (!open) { (e.currentTarget as HTMLElement).style.borderColor = currentStatus ? currentStatus.cor + '55' : 'var(--gray3)'; (e.currentTarget as HTMLElement).style.background = currentStatus ? currentStatus.cor + '14' : 'transparent'; } }}
      >
        {currentStatus
          ? <span style={{ width: showLabel ? 7 : (size === 'sm' ? 6 : 9), height: showLabel ? 7 : (size === 'sm' ? 6 : 9), borderRadius: '50%', background: currentStatus.cor, flexShrink: 0 }} />
          : <svg width={size === 'sm' ? 6 : 9} height={size === 'sm' ? 6 : 9} viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="var(--gray3)" strokeWidth="1.5"/></svg>
        }
        {showLabel && (
          <span style={{ fontSize: 11, fontWeight: 600, color: currentStatus ? currentStatus.cor : 'var(--gray2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {currentStatus?.nome ?? '-'}
          </span>
        )}
      </div>

      {open && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width: 180,
          background: '#fff', border: '1.5px solid var(--gray3)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999,
          overflow: 'hidden', animation: 'fadeIn 0.12s ease both',
        }}>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--gray3)', fontSize: 10, fontWeight: 700, color: 'var(--gray2)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Mover para
          </div>
          {statuses.map(s => (
            <div
              key={s.id}
              onClick={e => { e.stopPropagation(); onStatusChange(rowKey, s.id); setOpen(false); }}
              style={{
                padding: '9px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: s.id === currentStatusId ? s.cor : 'var(--black)',
                background: s.id === currentStatusId ? s.cor + '12' : 'transparent',
                borderLeft: `3px solid ${s.id === currentStatusId ? s.cor : 'transparent'}`,
                display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.1s',
              }}
              onMouseEnter={e => { if (s.id !== currentStatusId) (e.currentTarget as HTMLElement).style.background = 'var(--bg)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = s.id === currentStatusId ? s.cor + '12' : 'transparent'; }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.cor, flexShrink: 0 }} />
              {s.nome}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function GroupedTable({ rows, accent, onRowClick, onDelete, onToggleRealized, emptyLabel, statuses, onSubStatusChange }: {
  rows: { key: string; date: string; badge: string; badgeColor: string; label: string; desc?: string; amount: number; canDelete?: boolean; realized?: boolean; isSubmission?: boolean; currentStatusId?: number | null }[];
  accent: string;
  onRowClick: (key: string) => void;
  onDelete?: (key: string) => void;
  onToggleRealized?: (key: string) => void;
  emptyLabel: string;
  statuses?: { id: number; nome: string; cor: string }[];
  onSubStatusChange?: (key: string, statusId: number) => void;
}) {
  const [hovRow, setHovRow] = useState<string | null>(null);
  const [pendingDel, setPendingDel] = useState<string | null>(null);
  const [hovToggle, setHovToggle] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--gray2)', fontSize: 12, fontWeight: 500 }}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
      <colgroup>
        <col style={{ width: 36 }} />
        <col style={{ width: 52 }} />
        <col />
        <col style={{ width: 170 }} />
        <col style={{ width: 36 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...TH, textAlign: 'center' }} />
          <th style={TH}>Data</th>
          <th style={TH}>Descrição</th>
          <th style={{ ...TH, textAlign: 'right' }}>Valor</th>
          <th style={{ ...TH, textAlign: 'center' }} />
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const isHov = hovRow === row.key;
          const isPend = pendingDel === row.key;
          const realized = row.realized ?? false;
          const bgColor = isHov ? 'var(--bg)' : 'var(--white)';
          const borderLeft = '3px solid transparent';
          return (
            <tr
              key={row.key}
              onMouseEnter={() => setHovRow(row.key)}
              onMouseLeave={() => { setHovRow(null); setPendingDel(null); setHovToggle(null); }}
              onClick={() => !isPend && onRowClick(row.key)}
              style={{
                borderBottom: '1px solid var(--gray3)',
                borderLeft,
                background: bgColor,
                cursor: 'pointer',
                transition: 'background 0.12s',
              }}
            >
              {/* ── Toggle / Status ── */}
              <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                {row.isSubmission && statuses && onSubStatusChange ? (
                  <StatusCell
                    rowKey={row.key}
                    currentStatusId={row.currentStatusId}
                    statuses={statuses}
                    onStatusChange={onSubStatusChange}
                  />
                ) : !row.isSubmission && onToggleRealized ? (
                  <div
                    onClick={e => { e.stopPropagation(); onToggleRealized(row.key); }}
                    onMouseEnter={() => setHovToggle(row.key)}
                    onMouseLeave={() => setHovToggle(null)}
                    title={realized ? 'Marcar como previsto' : 'Marcar como realizado'}
                    style={{
                      width: 18, height: 18, borderRadius: 4, margin: '0 auto',
                      border: realized
                        ? '2px solid var(--green)'
                        : `2px solid ${hovToggle === row.key ? 'var(--green)' : '#CBD5E1'}`,
                      background: realized
                        ? 'var(--green)'
                        : hovToggle === row.key ? '#F0FDF4' : '#F8FAFC',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                    }}
                  >
                    {(realized || hovToggle === row.key) && (
                      <svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke={realized ? '#fff' : '#86EFAC'} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                ) : null}
              </td>
              <td style={{ padding: '9px 12px', fontSize: 11, color: 'var(--gray2)', fontWeight: 500, whiteSpace: 'nowrap' }}>
                {fmtD(row.date)}
              </td>
              <td style={{ padding: '9px 12px', overflow: 'hidden' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: realized ? 'var(--gray2)' : 'var(--black)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: realized ? 'line-through' : 'none' }}>
                  {row.label}
                </div>
                {row.desc && (
                  <div style={{ fontSize: 11, color: 'var(--gray2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', textDecoration: realized ? 'line-through' : 'none' }}>
                    {row.desc}
                  </div>
                )}
              </td>
              <td style={{ padding: '9px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: realized ? 'var(--gray2)' : accent, whiteSpace: 'nowrap', textDecoration: realized ? 'line-through' : 'none' }}>
                    {fmtBRL(row.amount)}
                  </span>
                </div>
              </td>
              <td style={{ padding: '9px 6px', textAlign: 'center' }}>
                {row.canDelete && isHov && !isPend && (
                  <div
                    onClick={e => { e.stopPropagation(); setPendingDel(row.key); }}
                    style={{
                      width: 20, height: 20, borderRadius: 5, margin: '0 auto',
                      background: 'var(--white)', border: '1px solid rgba(220,38,38,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'background 0.12s, border-color 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(220,38,38,0.08)'; e.currentTarget.style.borderColor = '#DC2626'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--white)'; e.currentTarget.style.borderColor = 'rgba(220,38,38,0.25)'; }}
                  >
                    <svg width={10} height={10} viewBox="0 0 12 12" fill="none">
                      <path d="M2 3h8M4.5 3V2h3v1M3.5 3l.6 7h3.8l.6-7" stroke="#DC2626" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                )}
                {row.canDelete && isPend && (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete?.(row.key); setPendingDel(null); }}
                      style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                    >Sim</button>
                    <button
                      onClick={e => { e.stopPropagation(); setPendingDel(null); }}
                      style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', background: 'transparent', color: 'var(--gray)', border: '1px solid var(--gray3)', borderRadius: 4, cursor: 'pointer' }}
                    >Não</button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function LiquidezGroupedView({ transactions, submissions, onEdit, onDelete, onToggleRealized, onSubClick, onSubStatusChange, onAdd, weekDays, today, executadaStatusId, statuses }: {
  transactions: LiquidezTx[];
  submissions: Submission[];
  onEdit: (tx: LiquidezTx) => void;
  onDelete: (id: string) => void;
  onToggleRealized?: (id: string) => void;
  onSubClick?: (id: string) => void;
  onSubStatusChange?: (id: string, statusId: number) => void;
  onAdd: (date: string) => void;
  weekDays: string[];
  today: string;
  executadaStatusId?: number | null;
  statuses?: { id: number; nome: string; cor: string }[];
}) {
  // Entradas começa recolhida: são poucas linhas e o que se olha primeiro na
  // abertura da página é o saldo e as saídas.
  const [collapsedEnt, setCollapsedEnt] = useState(true);
  const [collapsedSai, setCollapsedSai] = useState(false);
  // Sub-aba por seção: foco no que ainda não foi executado (padrão) para clareza visual.
  const [filterEnt, setFilterEnt] = useState<'pendente' | 'executado' | 'todos'>('pendente');
  const [filterSai, setFilterSai] = useState<'pendente' | 'executado' | 'todos'>('pendente');
  const entradas = transactions.filter(tx => tx.type === 'entrada');
  const saidas   = transactions.filter(tx => tx.type === 'saida');
  const range    = weekDays[0] ? `${fmtD(weekDays[0])} a ${fmtD(weekDays[4])}` : '';

  const entradasRows = entradas.map(tx => ({
    key: tx.id, date: tx.date,
    badge: SOURCE_CONFIG[tx.source].label,
    badgeColor: SOURCE_CONFIG[tx.source].color,
    label: CATEGORY_LABEL[tx.category] ?? tx.category,
    desc: tx.description ?? undefined,
    amount: tx.amount, canDelete: true, realized: tx.realized,
  }));

  const saidasRows = [
    ...saidas.map(tx => ({
      key: tx.id, date: tx.date,
      badge: SOURCE_CONFIG[tx.source].label,
      badgeColor: SOURCE_CONFIG[tx.source].color,
      label: CATEGORY_LABEL[tx.category] ?? tx.category,
      desc: tx.description ?? undefined,
      amount: tx.amount, canDelete: true, realized: tx.realized,
    })),
    ...submissions.map(sub => ({
      key: sub.id,
      date: (sub.data_execucao ?? sub.previsao_execucao ?? sub.status_since ?? sub.created_at)?.replace('T', ' ').split(' ')[0] ?? today,
      badge: 'Solicitação', badgeColor: SUB_COLOR,
      label: sub.nome_contratado ?? sub.nome_sacado ?? 'Solicitação',
      desc: sub.nome_sacado && sub.nome_contratado ? `Sacado: ${sub.nome_sacado}` : undefined,
      amount: subValor(sub), canDelete: false,
      realized: executadaStatusId != null
        ? Number(sub.current_status_id) === executadaStatusId
        : !!(statuses?.find(s => s.id === Number(sub.current_status_id))?.nome?.toLowerCase().includes('execut')),
      isSubmission: true,
      currentStatusId: sub.current_status_id != null ? Number(sub.current_status_id) : null,
    })),
  ];

  // Totais divididos: a executar (pendente) × executado (realizado)
  const sumRows = (rows: { amount: number; realized?: boolean }[], pred: (r: any) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + r.amount, 0);
  const entExec = sumRows(entradasRows, r => r.realized);
  const entPend = sumRows(entradasRows, r => !r.realized);
  const saiExec = sumRows(saidasRows, r => r.realized);
  const saiPend = sumRows(saidasRows, r => !r.realized);

  const applyFilter = <T extends { realized?: boolean }>(rows: T[], f: 'pendente' | 'executado' | 'todos') =>
    f === 'todos' ? rows : rows.filter(r => (f === 'executado' ? !!r.realized : !r.realized));
  const counts = (rows: { realized?: boolean }[]) => ({
    pendente: rows.filter(r => !r.realized).length,
    executado: rows.filter(r => !!r.realized).length,
    todos: rows.length,
  });

  const SubTabs = ({ value, onChange, counts, accent }: {
    value: 'pendente' | 'executado' | 'todos';
    onChange: (v: 'pendente' | 'executado' | 'todos') => void;
    counts: { pendente: number; executado: number; todos: number };
    accent: string;
  }) => (
    <div style={{ display: 'flex', gap: 4, padding: '8px 12px', borderBottom: '1px solid var(--gray3)', background: 'var(--bg)' }}>
      {([['pendente', 'A executar'], ['executado', 'Executadas'], ['todos', 'Todas']] as const).map(([k, label]) => {
        const active = value === k;
        return (
          <button key={k} type="button" onClick={() => onChange(k)}
            style={{
              fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 7, cursor: 'pointer',
              border: `1px solid ${active ? accent : 'var(--gray3)'}`,
              background: active ? 'var(--white)' : 'transparent',
              color: active ? accent : 'var(--gray2)',
              display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'all .12s',
            }}>
            {label}
            <span style={{ fontSize: 9.5, fontWeight: 800, minWidth: 15, height: 15, borderRadius: 99, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: active ? accent : 'var(--gray3)', color: active ? '#fff' : 'var(--gray2)' }}>{counts[k]}</span>
          </button>
        );
      })}
    </div>
  );

  const tableWrap: React.CSSProperties = {
    background: 'var(--white)', border: '1px solid var(--gray3)',
    borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow)',
  };

  const tableHeader = (accent: string, icon: string, title: string, count: number, totalPend: number, totalExec: number, collapsed: boolean, onToggle: () => void) => (
    <div
      style={{
        padding: '12px 16px', borderBottom: collapsed ? 'none' : '1px solid var(--gray3)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--white)', cursor: 'pointer', userSelect: 'none',
      }}
      onClick={onToggle}
      title={collapsed ? 'Expandir' : 'Recolher'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--gray2)', transition: 'transform 0.15s', transform: collapsed ? 'rotate(-90deg)' : 'none', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span style={{ fontSize: 13, color: accent, fontWeight: 800 }}>{icon}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--black)' }}>{title}</span>
        <span style={{
          fontSize: 10, fontWeight: 800, minWidth: 18, height: 18, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--gray3)', color: 'var(--gray2)',
        }}>{count}</span>
        <span style={{ fontSize: 10, color: 'var(--gray2)', fontWeight: 500 }}>{range}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: accent }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--gray2)', letterSpacing: '.03em', marginRight: 5, textTransform: 'uppercase' }}>a executar</span>
            {icon}{fmtBRL(totalPend)}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--gray2)' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.03em', marginRight: 5, textTransform: 'uppercase' }}>executado</span>
            {fmtBRL(totalExec)}
          </span>
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAdd(today); }}
          style={{
            width: 26, height: 26, fontSize: 18, fontWeight: 400, lineHeight: 1,
            border: '1px solid var(--gray3)', borderRadius: 7,
            background: 'transparent', color: 'var(--gray2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', padding: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--yellow)'; e.currentTarget.style.color = 'var(--yellow)'; e.currentTarget.style.background = 'var(--yd)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--gray3)'; e.currentTarget.style.color = 'var(--gray2)'; e.currentTarget.style.background = 'transparent'; }}
        >+</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={tableWrap}>
        {tableHeader('var(--green)', '↑', 'Entradas', entradas.length, entPend, entExec, collapsedEnt, () => setCollapsedEnt(v => !v))}
        {!collapsedEnt && (
          <>
            <SubTabs value={filterEnt} onChange={setFilterEnt} counts={counts(entradasRows)} accent="var(--green)" />
            <GroupedTable
              rows={applyFilter(entradasRows, filterEnt)} accent="var(--green)"
              onRowClick={key => { const tx = entradas.find(t => t.id === key); if (tx) onEdit(tx); }}
              onDelete={key => onDelete(key)}
              onToggleRealized={onToggleRealized}
              emptyLabel={filterEnt === 'executado' ? 'Nenhuma entrada executada' : filterEnt === 'pendente' ? 'Nenhuma entrada a executar' : 'Nenhuma entrada lançada nesta semana'}
            />
          </>
        )}
      </div>
      <div style={tableWrap}>
        {tableHeader('var(--red)', '↓', 'Saídas', saidas.length + submissions.length, saiPend, saiExec, collapsedSai, () => setCollapsedSai(v => !v))}
        {!collapsedSai && (
          <>
            <SubTabs value={filterSai} onChange={setFilterSai} counts={counts(saidasRows)} accent="var(--red)" />
            <GroupedTable
              rows={applyFilter(saidasRows, filterSai)} accent="var(--red)"
              onRowClick={key => {
                const tx = saidas.find(t => t.id === key);
                if (tx) { onEdit(tx); return; }
                onSubClick?.(key);
              }}
              onDelete={key => onDelete(key)}
              onToggleRealized={onToggleRealized}
              emptyLabel={filterSai === 'executado' ? 'Nenhuma saída executada' : filterSai === 'pendente' ? 'Nenhuma saída a executar' : 'Nenhuma saída lançada nesta semana'}
              statuses={statuses}
              onSubStatusChange={onSubStatusChange}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── LiquidezPage ──────────────────────────────────────────────────────────────

type ModalConfig =
  | { mode: 'create'; date: string }
  | { mode: 'edit'; tx: LiquidezTx };

export default function LiquidezPage({ token }: { token: string }) {
  const { toast } = useToast();
  const { onSessionExpired } = useAuth();
  const api = useApi(token);
  const [weekOffset, setWeekOffset]     = useState(0);
  // A visão agrupada é a leitura normal da semana; a diária é o detalhe.
  const [weekView, setWeekView]         = useState<WeekView>('agrupada');
  const [transactions, setTransactions] = useState<LiquidezTx[]>([]);
  const [submissions, setSubmissions]   = useState<Submission[]>([]);
  const [executadaStatusId, setExecutadaStatusId] = useState<number | null>(null);
  const [excludedStatusIds, setExcludedStatusIds] = useState<Set<number>>(new Set());
  const [statuses, setStatuses] = useState<{ id: number; nome: string; cor: string; is_conversion?: number; is_excluded?: number; requires_pendencia?: number }[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [modal, setModal]               = useState<ModalConfig | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  // Conversão pendente: exige registrar a data de execução antes de mover
  const [pendingConv, setPendingConv] = useState<{ subId: string; statusId: number } | null>(null);
  // Sair da etapa de conversão pela Liquidez → confirmar limpeza da data de execução
  const [pendingClearExec, setPendingClearExec] = useState<{ subId: string; statusId: number } | null>(null);
  // Mover (Liquidez) para etapa que exige pendências → registrar antes
  const [pendingPend, setPendingPend] = useState<{ subId: string; statusId: number } | null>(null);
  const [savingPend, setSavingPend] = useState(false);

  const today = todayISO();

  // Semanal
  const weekStart = useMemo(() => getMonday(addDays(new Date(), weekOffset * 7)), [weekOffset]);
  const weekDays  = useMemo(() => Array.from({ length: 5 }, (_, i) => toISO(addDays(weekStart, i))), [weekStart]);
  const weekEnd   = weekDays[4];

  const rangeStart = weekDays[0];
  const rangeEnd   = weekEnd;

  const txByDay = useMemo(() => {
    const map = new Map<string, LiquidezTx[]>();
    for (const tx of transactions) {
      if (!map.has(tx.date)) map.set(tx.date, []);
      map.get(tx.date)!.push(tx);
    }
    return map;
  }, [transactions]);

  // Monday of the CURRENT (real-world) week - used for rollover logic
  const currentWeekMonday = useMemo(() => toISO(getMonday(new Date())), []);

  const subsByDay = useMemo(() => {
    const map = new Map<string, Submission[]>();
    for (const sub of submissions) {
      const day = submissionDay(sub, rangeStart, rangeEnd, currentWeekMonday);
      if (!day) continue;
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(sub);
    }
    return map;
  }, [submissions, rangeStart, rangeEnd, currentWeekMonday]);

  // All submissions visible in this range (for summary); excludes steps marked as desconsideradas
  const visibleSubs = useMemo(() => {
    return submissions.filter(sub => {
      if (!submissionDay(sub, rangeStart, rangeEnd, currentWeekMonday)) return false;
      if (sub.current_status_id != null && excludedStatusIds.has(Number(sub.current_status_id))) return false;
      return true;
    });
  }, [submissions, rangeStart, rangeEnd, currentWeekMonday, excludedStatusIds]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/liquidez?week_start=${rangeStart}&week_end=${rangeEnd}`, {
        headers: { 'x-admin-session': token },
      });
      if (res.status === 401) { onSessionExpired(); return; }
      if (!res.ok) throw new Error('Falha na resposta');
      const data = await res.json();
      setTransactions(data.transactions ?? []);
    } catch {
      setError('Não foi possível carregar os lançamentos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [token, rangeStart, rangeEnd]);

  const fetchSubmissions = useCallback(async () => {
    const data = await api('?action=board');
    if (data?.submissions) setSubmissions(data.submissions);
    if (data?.statuses) {
      setStatuses(data.statuses.map((s: { id: number; nome: string; cor: string; is_conversion?: number; is_excluded?: number; requires_pendencia?: number }) => ({
        id: Number(s.id), nome: String(s.nome), cor: String(s.cor),
        is_conversion: Number(s.is_conversion ?? 0),
        is_excluded: Number(s.is_excluded ?? 0),
        requires_pendencia: Number(s.requires_pendencia ?? 0),
      })));
      const exec =
        data.statuses.find((s: any) => Number(s.is_conversion) === 1) ??
        data.statuses.find((s: any) => s.nome?.toLowerCase().includes('execut'));
      setExecutadaStatusId(exec ? Number(exec.id) : null);
      const excluded = new Set<number>(
        data.statuses.filter((s: any) => Number(s.is_excluded) === 1).map((s: any) => Number(s.id))
      );
      setExcludedStatusIds(excluded);
    }
  }, [api]);

  async function performSubMove(subId: string, statusId: number) {
    // Otimista: reflete a mudança na hora (sem esperar rede/refetch)
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, current_status_id: statusId, status_since: new Date().toISOString() } : s));
    const statusName = statuses.find(s => s.id === statusId)?.nome;
    toast('success', statusName ? `Movido para "${statusName}"` : 'Status atualizado');
    const res = await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'move', solicitacao_id: subId, status_id: statusId }),
    });
    if (res.status === 401) { onSessionExpired(); return; }
    if (!res.ok) { toast('error', 'Erro ao alterar status'); fetchSubmissions(); }
  }

  async function handleSubStatusChange(subId: string, statusId: number) {
    const cfg = statuses.find(s => s.id === statusId);
    const sub = submissions.find(s => s.id === subId);
    const curCfg = statuses.find(s => s.id === Number(sub?.current_status_id));
    // Sair da etapa de conversão com data registrada → confirmar limpeza
    if (curCfg?.is_conversion && !cfg?.is_conversion && sub?.data_execucao) {
      setPendingClearExec({ subId, statusId });
      return;
    }
    // Etapa de conversão: registra a data de execução antes de mover
    if (cfg?.is_conversion) {
      setPendingConv({ subId, statusId });
      return;
    }
    // Etapa que exige pendências: registrar antes de mover
    if (cfg?.requires_pendencia) {
      setPendingPend({ subId, statusId });
      return;
    }
    await performSubMove(subId, statusId);
  }

  async function confirmLiquidezPendencia(itens: { descricao: string; categoria: string }[]) {
    if (!pendingPend) return;
    const { subId, statusId } = pendingPend;
    setSavingPend(true);
    try {
      await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'add_pendencias', solicitacao_id: subId, status_id: statusId, itens }),
      });
      setPendingPend(null);
      await performSubMove(subId, statusId);
    } finally {
      setSavingPend(false);
    }
  }

  async function confirmLiquidezConversion(date: string) {
    if (!pendingConv) return;
    const { subId, statusId } = pendingConv;
    await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'patch_submission', id: subId, field: 'data_execucao', value: date }),
    });
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, data_execucao: date } : s));
    setPendingConv(null);
    await performSubMove(subId, statusId);
  }

  async function confirmLiquidezClearExec() {
    if (!pendingClearExec) return;
    const { subId, statusId } = pendingClearExec;
    setPendingClearExec(null);
    await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'patch_submission', id: subId, field: 'data_execucao', value: null }),
    });
    setSubmissions(prev => prev.map(s => s.id === subId ? { ...s, data_execucao: null } : s));
    await performSubMove(subId, statusId);
  }

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  useEffect(() => {
    const onFocus = () => fetchSubmissions();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchSubmissions]);

  async function handleSave(input: LiquidezTxInput) {
    if (!modal) return;
    const body: Record<string, unknown> = { action: modal.mode === 'create' ? 'create' : 'update', ...input };
    if (modal.mode === 'edit') body.id = modal.tx.id;

    const res = await fetch('/api/liquidez', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { onSessionExpired(); return; }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? 'Erro ao salvar');
    }
    toast('success', modal.mode === 'create' ? 'Lançamento adicionado' : 'Lançamento atualizado');
    setModal(null);
    fetchTransactions();
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/liquidez', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'delete', id }),
    });
    if (res.status === 401) { onSessionExpired(); return; }
    if (!res.ok) { toast('error', 'Erro ao excluir lançamento'); return; }
    toast('success', 'Lançamento excluído');
    fetchTransactions();
  }

  async function handleToggleRealized(id: string) {
    const res = await fetch('/api/liquidez', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'toggle_realized', id }),
    });
    if (res.status === 401) { onSessionExpired(); return; }
    if (!res.ok) { toast('error', 'Erro ao atualizar status'); return; }
    fetchTransactions();
  }

  return (
    <div className="admin-content-wrap">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16 }}>
        <div>
          <h1 className="admin-page-title">Liquidez</h1>
          <p className="admin-page-desc">Gestão de entradas e saídas por fonte de liquidez</p>
        </div>

        <LiquidezWeekNav
          weekStart={weekStart}
          weekOffset={weekOffset}
          onPrev={() => setWeekOffset(o => o - 1)}
          onNext={() => setWeekOffset(o => o + 1)}
          onToday={() => setWeekOffset(0)}
          onJump={setWeekOffset}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <SegSwitch
            valor={weekView}
            onChange={setWeekView}
            opcoes={[
              { valor: 'agrupada' as WeekView, label: 'Agrupada' },
              { valor: 'diaria' as WeekView,   label: 'Diária'   },
            ]}
            pequeno
          />
        </div>
      </div>

      {loading ? (
        <div className="sk-wrap" style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ flex: 1, borderRadius: 12, border: '1px solid var(--gray3)', borderLeft: '4px solid var(--gray3)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="sk-block" style={{ width: 60, height: 9, borderRadius: 4 }} />
              <span className="sk-block" style={{ width: '65%', height: 22, borderRadius: 6 }} />
              <span className="sk-block" style={{ width: 80, height: 9, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : (
        <LiquidezSummary transactions={transactions} submissions={visibleSubs} executadaStatusId={executadaStatusId} statuses={statuses} weekStart={rangeStart} token={token} />
      )}

      {error && (
        <div style={{
          background: '#D9302510', border: '1px solid #D9302530',
          borderRadius: 10, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 13, color: 'var(--red)' }}>{error}</span>
          <button
            onClick={fetchTransactions}
            style={{ fontSize: 12, color: 'var(--red)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        weekView === 'diaria' ? (
          <div className="sk-wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {Array.from({ length: 5 }).map((_, ci) => (
              <div key={ci} style={{ borderRadius: 12, border: '1.5px solid var(--gray3)', overflow: 'hidden', minHeight: 200 }}>
                {/* column header */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="sk-block" style={{ width: 32, height: 12, borderRadius: 4 }} />
                  <span className="sk-block" style={{ width: 48, height: 9, borderRadius: 4 }} />
                </div>
                {/* cards */}
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: ci === 2 ? 3 : ci === 4 ? 2 : 1 }).map((_, ri) => (
                    <div key={ri} style={{ borderRadius: 10, border: '1px solid var(--gray3)', borderLeft: '3px solid var(--gray3)', padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="sk-block" style={{ width: 50, height: 10, borderRadius: 20 }} />
                        <span className="sk-block" style={{ width: 36, height: 11, borderRadius: 4 }} />
                      </div>
                      <span className="sk-block" style={{ width: '70%', height: 10, borderRadius: 4 }} />
                      <span className="sk-block" style={{ width: '50%', height: 9, borderRadius: 4 }} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="sk-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {['Entradas', 'Saídas'].map(label => (
              <div key={label} style={{ borderRadius: 12, border: '1px solid var(--gray3)', overflow: 'hidden' }}>
                {/* section header */}
                <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="sk-block" style={{ width: 16, height: 16, borderRadius: '50%' }} />
                  <span className="sk-block" style={{ width: 70, height: 11, borderRadius: 4 }} />
                  <span className="sk-block" style={{ width: 24, height: 18, borderRadius: 6, marginLeft: 4 }} />
                  <span className="sk-block" style={{ width: 80, height: 11, borderRadius: 4, marginLeft: 'auto' }} />
                </div>
                {/* rows */}
                {Array.from({ length: 3 }).map((_, ri) => (
                  <div key={ri} style={{ padding: '11px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="sk-block" style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0 }} />
                    <span className="sk-block" style={{ width: 36, height: 10, borderRadius: 4, flexShrink: 0 }} />
                    <span className="sk-block" style={{ flex: 1, height: 11, borderRadius: 4 }} />
                    <span className="sk-block" style={{ width: 70, height: 11, borderRadius: 4, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      ) : weekView === 'diaria' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, overflowX: 'auto', minWidth: 0 }}>
            {weekDays.map(date => (
              <LiquidezDayColumn
                key={date} date={date} isTodayCol={date === today}
                txs={txByDay.get(date) ?? []}
                onAdd={() => setModal({ mode: 'create', date })}
                onEdit={tx => setModal({ mode: 'edit', tx })}
                onDelete={handleDelete}
                onToggleRealized={handleToggleRealized}
              />
            ))}
          </div>
          <LiquidezSubmissionsSection
            subs={visibleSubs}
            statuses={statuses}
            executadaStatusId={executadaStatusId}
            onSubClick={setSelectedSubId}
            onSubStatusChange={handleSubStatusChange}
          />
        </div>
      ) : (
        <LiquidezGroupedView
          transactions={transactions}
          submissions={visibleSubs}
          onEdit={tx => setModal({ mode: 'edit', tx })}
          onDelete={handleDelete}
          onToggleRealized={handleToggleRealized}
          onSubClick={setSelectedSubId}
          onSubStatusChange={handleSubStatusChange}
          onAdd={date => setModal({ mode: 'create', date })}
          weekDays={weekDays}
          today={today}
          executadaStatusId={executadaStatusId}
          statuses={statuses}
        />
      )}

      {modal && (
        <LiquidezModal
          mode={modal.mode}
          initialDate={modal.mode === 'create' ? modal.date : undefined}
          tx={modal.mode === 'edit' ? modal.tx : undefined}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}

      {selectedSubId && (
        <DetailPanel
          id={selectedSubId}
          token={token}
          onClose={() => setSelectedSubId(null)}
          onMoved={(sid, statusId) => setSubmissions(prev => prev.map(s => s.id === sid ? { ...s, current_status_id: statusId, status_since: new Date().toISOString() } : s))}
          onEdited={(sid, fields) => setSubmissions(prev => prev.map(s => s.id === sid ? { ...s, ...fields } : s))}
          statuses={statuses as unknown as StatusConfig[]}
        />
      )}

      {pendingConv && (
        <ExecutionDateModal
          statusName={statuses.find(st => st.id === pendingConv.statusId)?.nome}
          initialDate={String(submissions.find(s => s.id === pendingConv.subId)?.data_execucao ?? '')}
          onConfirm={confirmLiquidezConversion}
          onCancel={() => setPendingConv(null)}
        />
      )}

      {pendingPend && (
        <PendenciaMoveModal
          statusName={statuses.find(st => st.id === pendingPend.statusId)?.nome ?? 'esta etapa'}
          saving={savingPend}
          onConfirm={confirmLiquidezPendencia}
          onCancel={() => setPendingPend(null)}
        />
      )}

      {pendingClearExec && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setPendingClearExec(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Limpar data de execução?</p>
            <p className="delete-confirm-desc">
              Mover para <strong>{statuses.find(st => st.id === pendingClearExec.statusId)?.nome}</strong> vai
              <strong> limpar a data de execução</strong> registrada. Deseja continuar?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setPendingClearExec(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={confirmLiquidezClearExec}>Confirmar</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
