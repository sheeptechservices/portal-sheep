import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { maskCurrency, parseCurrency } from '../lib/masks';
import { exportToCSV, exportToPDF, type ExportData } from '../lib/exportTable';
import { IconDoc, IconChart, IconX, IconCheck, IconScale, IconChevronDown, IconUndo } from '../components/icons';
import { SegSwitch } from '../components/SegSwitch';

// ─────────────────────────────────────────────────────────────────────────────
//  Relatórios › Veículos
//  Composição e operações por veículo de crédito.
//  Identidade visual alinhada ao restante do admin (tokens --yellow/--black/--gray,
//  fonte Manrope). Donut desenhado em SVG nativo - sem dependência de CDN.
// ─────────────────────────────────────────────────────────────────────────────

type VehicleId = 'FIDC' | 'ATLAS' | 'DUX';

interface Vehicle {
  id: VehicleId;
  label: string;
  color: string;
  textColor: string;
  bgLight: string;
  ops: number;
  liquidez: number;
  variacao: number; // % vs. ontem
}

const VEHICLES: Vehicle[] = [
  { id: 'FIDC',  label: 'FIDC',  color: 'var(--yellow)', textColor: '#121316', bgLight: 'rgba(169,224,62,0.10)', ops: 731, liquidez: 21580000, variacao: -1.8 },
  { id: 'ATLAS', label: 'Atlas', color: '#121316',       textColor: '#A9E03E', bgLight: '#F1F1EF',              ops: 312, liquidez: 8240000,  variacao:  4.2 },
  { id: 'DUX',   label: 'DUX',   color: '#AAAAAA',        textColor: '#121316', bgLight: '#F5F5F3',              ops: 173, liquidez: 3920000,  variacao:  0.5 },
];

// Cor "crua" (hex) por veículo - para usos onde var(--yellow) não serve (ex.: SVG dasharray, transparências)
const VEHICLE_HEX: Record<VehicleId, string> = {
  FIDC:  '#A9E03E',
  ATLAS: '#121316',
  DUX:   '#AAAAAA',
};

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  'À vencer':      { bg: '#DBEAFE', fg: '#1D4ED8' },
  'Tolerância':    { bg: '#FEF9C3', fg: '#A16207' },
  'No prazo':      { bg: '#DCFCE7', fg: '#16A34A' },
  'Judicializada': { bg: '#FCE7F3', fg: '#BE185D' },
  'Em negociação': { bg: '#EDE9FE', fg: '#7C3AED' },
  'Em coleta':     { bg: '#FFEDD5', fg: '#C2410C' },
  'Em atraso':     { bg: '#FEE2E2', fg: '#DC2626' },
  'Concluída':     { bg: '#F3F4F6', fg: '#6B7280' },
};

interface Op {
  id: string;
  veiculo: VehicleId;
  subFundo: string; // FIDC: 'Direta' | 'Cedida' | 'Recomprada' | ''
  status: string;
  carteira: 'ativa' | 'historico';
  cliente: string;
  dataAdiant: string;
  dateISO: string;
  sacado: string;
  bruto: number;
  liquido: number;
  fat: number;
  dur: number;
  clienteOriginal?: string; // cedente que consta na planilha, quando a regra da cedida troca o cliente por DUX
}

// ── Regra: FIDC (Cedida) → a cedente da operação é a DUX ────────────────────────
// Na operação cedida, a DUX compra o título do cliente e cede o crédito ao FIDC -
// perante o fundo, quem cede é a própria DUX. Com a regra ligada, essas linhas passam
// a valer como cedente "DUX" em tudo que a tela deriva das operações (tabela, filtros,
// Curva ABC e exportações); o cedente original segue visível no tooltip da célula.
const CEDENTE_CEDIDA = 'DUX';
const REGRA_CEDIDA_KEY = 'dux_rel_regra_cedida';
const isCedida = (o: Op) => o.veiculo === 'FIDC' && o.subFundo === 'Cedida';

// ── Formatação ────────────────────────────────────────────────────────────────
function fmtBRL(v: number): string {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(v: number): string {
  if (v >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
  if (v >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + ' mil';
  return fmtBRL(v);
}

const mono: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

// ── Donut (SVG nativo) ──────────────────────────────────────────────────────────
function Donut({
  segments, size = 200, thickness = 24, selected, hovered, onSelect, onHover,
}: {
  segments: { id: VehicleId; value: number; color: string }[];
  size?: number; thickness?: number;
  selected: VehicleId | null;
  hovered: VehicleId | null;
  onSelect: (id: VehicleId) => void;
  onHover: (id: VehicleId | null) => void;
}) {
  const hoverGrow = 7;
  // Reserva folga para o crescimento do traço no hover (senão a borda externa é cortada pelo viewBox)
  const radius = (size - thickness - hoverGrow * 2) / 2;
  const circ = 2 * Math.PI * radius;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map(seg => {
          const len = (seg.value / total) * circ;
          const isHover = hovered === seg.id;
          const dimmed = (selected && selected !== seg.id) || (hovered && !isHover);
          const el = (
            <circle
              key={seg.id}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={isHover ? thickness + hoverGrow : thickness}
              strokeDasharray={`${len} ${circ - len}`}
              strokeDashoffset={-offset}
              opacity={dimmed ? 0.28 : 1}
              style={{ cursor: 'pointer', transition: 'opacity .2s ease, stroke-width .18s cubic-bezier(0.34,1.1,0.64,1)' }}
              onClick={() => onSelect(seg.id)}
              onMouseEnter={() => onHover(seg.id)}
              onMouseLeave={() => onHover(null)}
            />
          );
          offset += len;
          return el;
        })}
      </g>
    </svg>
  );
}

// ── Switch on/off (regras de cálculo) ───────────────────────────────────────────
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: 42, height: 24, padding: 0, flexShrink: 0, cursor: 'pointer',
        borderRadius: 'var(--radius-pill)', border: `1px solid ${checked ? 'var(--yellow)' : 'var(--gray3)'}`,
        background: checked ? 'var(--yellow)' : 'var(--gray3)', transition: 'background .18s, border-color .18s',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: checked ? 20 : 2, width: 18, height: 18, borderRadius: '50%',
        background: 'var(--white)', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .18s var(--transition-spring)',
      }} />
    </button>
  );
}

// ── Toggle segmentado (Carteira Ativa / Histórico) - usa o switcher padrão ──────
type Modo = 'ativa' | 'historico' | 'todos';
const MODO_LABEL: Record<Modo, string> = { ativa: 'Ativa', historico: 'Histórico', todos: 'Todos' };
function ModoToggle({ value, onChange, full, withTodos }: { value: Modo; onChange: (m: Modo) => void; full?: boolean; withTodos?: boolean }) {
  const modos: Modo[] = withTodos ? ['ativa', 'historico', 'todos'] : ['ativa', 'historico'];
  return (
    <SegSwitch
      valor={value}
      onChange={onChange}
      full={full}
      opcoes={modos.map(m => ({ valor: m, label: MODO_LABEL[m] }))}
    />
  );
}

// ── Filtro de período (par de inputs de data) ───────────────────────────────────
// ── Date range picker customizado (padrão do sistema) ───────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const toISO = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
const fmtBR = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function DateRange({ ini, fim, onIni, onFim, onClear }: {
  ini: string; fim: string;
  onIni: (v: string) => void; onFim: (v: string) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => {
    const base = ini ? new Date(ini + 'T00:00:00') : new Date();
    return { y: base.getFullYear(), m: base.getMonth() };
  });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const base = ini ? new Date(ini + 'T00:00:00') : new Date();
    setView({ y: base.getFullYear(), m: base.getMonth() });
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]); // eslint-disable-line

  function pick(iso: string) {
    if (!ini || (ini && fim)) { onIni(iso); onFim(''); }
    else if (iso >= ini) { onFim(iso); setOpen(false); }
    else { onIni(iso); }
  }

  const now = new Date();
  const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
  const first = new Date(view.y, view.m, 1);
  const gridStart = new Date(view.y, view.m, 1 - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });
  const title = first.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const prevMonth = () => setView(v => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 });
  const nextMonth = () => setView(v => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 });
  const rect = btnRef.current?.getBoundingClientRect();
  const label = ini ? (fim ? `${fmtBR(ini)} → ${fmtBR(fim)}` : `${fmtBR(ini)} →`) : null;

  return (
    <>
      <button ref={btnRef} type="button" className={`dux-cal-trigger${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--gray2)', flexShrink: 0 }}>
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label ? <span>{label}</span> : <span className="ph">Selecionar período</span>}
        {(ini || fim) && (
          <span role="button" className="dux-cal-clear" title="Limpar período"
            onClick={e => { e.stopPropagation(); onClear(); setOpen(false); }}><IconX size={10} /></span>
        )}
      </button>
      {open && createPortal(
        <div ref={popRef} className="dux-cal" style={{ position: 'fixed', top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0 }}>
          <div className="dux-cal-head">
            <button type="button" className="dux-cal-nav" onClick={prevMonth} aria-label="Mês anterior">‹</button>
            <span className="dux-cal-title">{title}</span>
            <button type="button" className="dux-cal-nav" onClick={nextMonth} aria-label="Próximo mês">›</button>
          </div>
          <div className="dux-cal-grid">
            {WEEKDAYS.map((w, i) => <div key={i} className="dux-cal-wd">{w}</div>)}
            {cells.map((d, i) => {
              const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate());
              const other = d.getMonth() !== view.m;
              const isEdge = iso === ini || (!!fim && iso === fim);
              const inRange = !!ini && !!fim && iso > ini && iso < fim;
              const isToday = iso === todayISO;
              return (
                <button key={i} type="button"
                  className={`dux-cal-day${other ? ' other' : ''}${isEdge ? ' edge' : ''}${inRange ? ' inrange' : ''}${isToday ? ' today' : ''}`}
                  onClick={() => pick(iso)}>
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="dux-cal-foot">
            <button type="button" className="muted" onClick={() => { onClear(); setOpen(false); }}>Limpar</button>
            <button type="button" onClick={() => { onIni(todayISO); onFim(''); setOpen(false); }}>Hoje</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Seção colapsável (card) ──────────────────────────────────────────────────────
function Section({ title, right, children, defaultOpen = false }: {
  title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
      <div
        className="rel-sechead"
        onClick={() => setOpen(o => !o)}
        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', transition: 'background var(--transition)' }}
      >
        <span className="rel-sec-chevron" style={{
          width: 22, height: 22, borderRadius: 6, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--gray)', transition: 'transform var(--transition-spring), background var(--transition), color var(--transition)', transform: open ? 'none' : 'rotate(-90deg)',
        }}><IconChevronDown size={12} /></span>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--black)', flex: 1 }}>{title}</span>
        {right}
      </div>
      {open && <div style={{ borderTop: '1px solid var(--gray3)' }}>{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Relatório de Veículos
// ─────────────────────────────────────────────────────────────────────────────
// Saldos por veículo são persistidos junto da Liquidez (tabela liquidez_saldos),
// num "week_start" sentinela exclusivo dos Relatórios.
const REL_SALDOS_KEY = '__rel_saldos__';
const REL_UPDATED_SOURCE = '__rel_updated__'; // guarda o timestamp da última edição (epoch ms) na mesma tabela
const SALDO_SOURCE: Record<VehicleId, string> = { FIDC: 'fidc', ATLAS: 'atlas', DUX: 'dux' };

function fmtSaldoUpdate(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Skeleton (efeito de carregamento) ───────────────────────────────────────────
function Skel({ w, h = 14, r = 6, style }: { w?: number | string; h?: number; r?: number; style?: React.CSSProperties }) {
  return <span className="rel-skel" style={{ width: w ?? '100%', height: h, borderRadius: r, ...style }} />;
}

function DashboardSkeleton() {
  const skCard: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' };
  return (
    <div className="rel-skel-fade" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Faixa de liquidez */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {VEHICLES.map(v => (
          <div key={v.id} style={{ ...skCard, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: v.color, opacity: .5 }} />
            <Skel w={70} h={10} />
            <Skel w={150} h={26} />
            <Skel w={90} h={10} />
          </div>
        ))}
      </div>

      {/* Composição + cards de veículo */}
      <div className="rel-comp-grid">
        <div style={{ ...skCard, padding: 22, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
          <Skel w={160} h={12} style={{ alignSelf: 'flex-start' }} />
          <Skel w="100%" h={34} r={8} />
          <Skel w={200} h={200} r={999} style={{ margin: '6px 0' }} />
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {VEHICLES.map(v => <Skel key={v.id} w="100%" h={36} r={8} />)}
          </div>
        </div>
        <div className="rel-vcards">
          {VEHICLES.map(v => (
            <div key={v.id} className="rel-vcard" style={{ ...skCard, padding: 22, display: 'flex', alignItems: 'center', gap: 20 }}>
              <Skel w={48} h={48} r={12} />
              <div style={{ display: 'flex', gap: 40, flex: 1, flexWrap: 'wrap' }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120 }}>
                    <Skel w={90} h={10} />
                    <Skel w={130} h={22} />
                    <Skel w={100} h={10} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card de recompradas */}
      <div style={{ ...skCard, padding: '16px 22px', display: 'flex', alignItems: 'center', gap: 20 }}>
        <Skel w={42} h={42} r={10} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skel w={180} h={12} />
          <Skel w={260} h={10} />
        </div>
        <Skel w={80} h={28} />
        <Skel w={110} h={28} />
      </div>

      {/* Tabela de operações */}
      <div style={{ ...skCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray3)' }}><Skel w={220} h={16} /></div>
        <div style={{ padding: '12px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--gray3)' }}>
          {[110, 110, 130, 130].map((w, i) => <Skel key={i} w={w} h={32} r={999} />)}
        </div>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, padding: '12px 20px', borderBottom: '1px solid var(--gray3)' }}>
            {[80, 60, 160, 160, 90, 100, 80].map((w, j) => <Skel key={j} w={w} h={12} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function RelatorioVeiculos({ token, meta }: { token: string; meta: { title: string; desc: string } }) {
  // Operações reais (Google Sheets, via /api/relatorios)
  const [allOps, setAllOps] = useState<Op[]>([]);
  const [loadingOps, setLoadingOps] = useState(true);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [opsFetchedAt, setOpsFetchedAt] = useState<number | null>(null);

  const mountedRef = useRef(true);
  const reqIdRef = useRef(0);
  // StrictMode (dev) monta→desmonta→remonta: reseta mountedRef no mount para o
  // finally do fetch conseguir limpar o loading (senão carrega infinitamente).
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // force=true → ignora o cache do servidor e relê a planilha ao vivo (?refresh=1)
  const loadOps = useCallback((force: boolean) => {
    const myId = ++reqIdRef.current;
    setLoadingOps(true);
    setOpsError(null);
    fetch(`/api/relatorios${force ? '?refresh=1' : ''}`, { headers: { 'x-admin-session': token } })
      .then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as any).error || `Erro ${r.status}`); }
        return r.json();
      })
      .then((data: { ops?: Op[]; fetchedAt?: number }) => {
        if (!mountedRef.current || reqIdRef.current !== myId) return;
        setAllOps(data.ops ?? []);
        setOpsFetchedAt(data.fetchedAt ?? Date.now());
      })
      .catch(err => { if (mountedRef.current && reqIdRef.current === myId) setOpsError(String(err?.message ?? err)); })
      .finally(() => { if (mountedRef.current && reqIdRef.current === myId) setLoadingOps(false); });
  }, [token]);

  // Toda vez que a tela carrega, força a atualização da base (ignora cache)
  useEffect(() => { loadOps(true); }, [loadOps]);

  // ── Regra: FIDC (Cedida) → cedente DUX (ligada/desligada pelo usuário) ──
  // Ligada por padrão; o usuário pode desligar (a escolha fica salva no navegador).
  const [regraCedida, setRegraCedida] = useState<boolean>(() => {
    try { const v = localStorage.getItem(REGRA_CEDIDA_KEY); return v === null ? true : v === '1'; } catch { return true; }
  });

  // Base efetiva da tela: com a regra ligada, as cedidas ao FIDC viram cedente DUX.
  const viewOps = useMemo(() => (
    regraCedida
      ? allOps.map(o => (isCedida(o) && o.cliente !== CEDENTE_CEDIDA
          ? { ...o, cliente: CEDENTE_CEDIDA, clienteOriginal: o.cliente }
          : o))
      : allOps
  ), [allOps, regraCedida]);

  // Nº de operações distintas que a regra alcança (mostrado no card da regra)
  const cedidaCount = useMemo(() => new Set(allOps.filter(isCedida).map(o => o.id)).size, [allOps]);

  // Opções de filtro derivadas dos dados reais
  const clienteOpts = useMemo(() => [...new Set(viewOps.map(o => o.cliente).filter(Boolean))].sort(), [viewOps]);
  const sacadoOpts = useMemo(() => [...new Set(viewOps.map(o => o.sacado).filter(Boolean))].sort(), [viewOps]);

  // Saldos manuais (preenchidos pelo usuário, igual à tela de Liquidez)
  const [saldoInput, setSaldoInput] = useState<Record<VehicleId, string>>({ FIDC: '', ATLAS: '', DUX: '' });
  const [saldoUpdatedAt, setSaldoUpdatedAt] = useState<number | null>(null);
  const savedSaldos = useRef<Record<VehicleId, number>>({ FIDC: 0, ATLAS: 0, DUX: 0 });

  function postSaldo(source: string, amount: number) {
    return fetch('/api/liquidez', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify({ action: 'set_saldo', week_start: REL_SALDOS_KEY, source, amount }),
    }).catch(() => {});
  }

  useEffect(() => {
    fetch(`/api/liquidez?saldos=1&week_start=${REL_SALDOS_KEY}`, { headers: { 'x-admin-session': token } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.saldos) return;
        const saldos = data.saldos as Record<string, number>;
        const byId: Partial<Record<VehicleId, string>> = {};
        for (const v of VEHICLES) {
          const amount = saldos[SALDO_SOURCE[v.id]];
          if (amount != null && amount > 0) byId[v.id] = maskCurrency(String(Math.round(amount * 100)));
          savedSaldos.current[v.id] = amount ?? 0;
        }
        setSaldoInput(prev => ({ ...prev, ...byId }));
        const ts = saldos[REL_UPDATED_SOURCE];
        if (ts && ts > 0) setSaldoUpdatedAt(ts);
      })
      .catch(() => {});
  }, [token]);

  function handleSaldoChange(id: VehicleId, val: string) {
    setSaldoInput(prev => ({ ...prev, [id]: maskCurrency(val) }));
  }
  function handleSaldoBlur(id: VehicleId) {
    const amount = saldoInput[id] ? parseCurrency(saldoInput[id]) : 0;
    if (amount === savedSaldos.current[id]) return; // sem alteração - não regrava nem atualiza o horário
    savedSaldos.current[id] = amount;
    const ts = Date.now();
    setSaldoUpdatedAt(ts);
    postSaldo(SALDO_SOURCE[id], amount);
    postSaldo(REL_UPDATED_SOURCE, ts);
  }

  // Pizza / cards
  const [selected, setSelected] = useState<VehicleId | null>(null);
  const [hovered, setHovered] = useState<VehicleId | null>(null);
  const [pizzaModo, setPizzaModo] = useState<Modo>('ativa');
  const [pizzaIni, setPizzaIni] = useState('');
  const [pizzaFim, setPizzaFim] = useState('');

  // Tabela de operações
  const [opsIni, setOpsIni] = useState('');
  const [opsFim, setOpsFim] = useState('');
  const [fFundo, setFFundo] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fCliente, setFCliente] = useState<string[]>([]);
  const [fSacado, setFSacado] = useState<string[]>([]);
  const [recompOpen, setRecompOpen] = useState(false); // expande detalhes das recompradas no próprio card
  const [exportTarget, setExportTarget] = useState<null | 'ops' | 'abc' | 'recompra'>(null); // tabela sendo exportada

  // Curva ABC
  const [abcVehicle, setAbcVehicle] = useState<'ALL' | VehicleId>('ALL');
  const [abcType, setAbcType] = useState<'cedente' | 'sacado'>('cedente');
  const [abcModo, setAbcModo] = useState<Modo>('ativa');
  const [abcIni, setAbcIni] = useState('');
  const [abcFim, setAbcFim] = useState('');

  const inDate = (iso: string, ini: string, fim: string) => (!ini || iso >= ini) && (!fim || iso <= fim);

  // ── Composição (donut + cards) ──
  const { totals, grand } = useMemo(() => {
    const ops = viewOps.filter(o => (pizzaModo === 'todos' || o.carteira === pizzaModo) && inDate(o.dateISO, pizzaIni, pizzaFim));
    const t: Record<VehicleId, number> = { FIDC: 0, ATLAS: 0, DUX: 0 };
    const counts: Record<VehicleId, number> = { FIDC: 0, ATLAS: 0, DUX: 0 };
    ops.forEach(o => { t[o.veiculo] += o.bruto; counts[o.veiculo]++; });
    return { totals: t, counts, grand: t.FIDC + t.ATLAS + t.DUX };
  }, [viewOps, pizzaModo, pizzaIni, pizzaFim]);

  const opCounts = useMemo(() => {
    // IDs duplicados = parcelas/títulos da MESMA operação → conta operações distintas (não linhas)
    const ops = viewOps.filter(o => (pizzaModo === 'todos' || o.carteira === pizzaModo) && inDate(o.dateISO, pizzaIni, pizzaFim));
    const sets: Record<VehicleId, Set<string>> = { FIDC: new Set(), ATLAS: new Set(), DUX: new Set() };
    ops.forEach(o => sets[o.veiculo].add(o.id));
    return { FIDC: sets.FIDC.size, ATLAS: sets.ATLAS.size, DUX: sets.DUX.size } as Record<VehicleId, number>;
  }, [viewOps, pizzaModo, pizzaIni, pizzaFim]);

  // Total de operações distintas na base (linhas = parcelas/títulos)
  const totalOpsDistintas = useMemo(() => new Set(viewOps.map(o => o.id)).size, [viewOps]);

  // Operações recompradas (FIDC recomprada) - capital de liquidez consumido em recompra
  const recompra = useMemo(() => {
    const rows = viewOps.filter(o => o.subFundo === 'Recomprada');
    return { count: new Set(rows.map(o => o.id)).size, vol: rows.reduce((s, o) => s + o.bruto, 0) };
  }, [viewOps]);

  // ── Tabela de operações ──
  const tableOps = useMemo(() => {
    return viewOps.filter(o =>
      (!selected || o.veiculo === selected) &&
      inDate(o.dateISO, opsIni, opsFim) &&
      (fFundo.length === 0 || fFundo.includes(o.veiculo)) &&
      (fStatus.length === 0 || fStatus.includes(o.status)) &&
      (fCliente.length === 0 || fCliente.includes(o.cliente)) &&
      (fSacado.length === 0 || fSacado.includes(o.sacado))
    );
  }, [viewOps, selected, opsIni, opsFim, fFundo, fStatus, fCliente, fSacado]);

  const activeFilterCount = fFundo.length + fStatus.length + fCliente.length + fSacado.length;

  // ── Curva ABC ──
  const abcRows = useMemo(() => {
    let ops = abcVehicle === 'ALL' ? viewOps : viewOps.filter(o => o.veiculo === abcVehicle);
    ops = ops.filter(o => o.carteira === abcModo && inDate(o.dateISO, abcIni, abcFim));
    const field = abcType === 'cedente' ? 'cliente' : 'sacado';
    const map: Record<string, { nome: string; volume: number; count: number; veiculos: Set<VehicleId> }> = {};
    ops.forEach(o => {
      const key = (o[field] ?? '').trim();
      if (!key) return; // desconsidera cedente/sacado em branco
      if (!map[key]) map[key] = { nome: key, volume: 0, count: 0, veiculos: new Set() };
      map[key].volume += o.bruto;
      map[key].count++;
      map[key].veiculos.add(o.veiculo);
    });
    const rows = Object.values(map).sort((a, b) => b.volume - a.volume);
    const total = rows.reduce((s, r) => s + r.volume, 0) || 1;
    let acum = 0;
    return rows.map(r => {
      const pct = (r.volume / total) * 100;
      acum += pct;
      const cls = acum <= 80 ? 'A' : acum <= 95 ? 'B' : 'C';
      return { ...r, pct, acum, cls };
    });
  }, [viewOps, abcVehicle, abcType, abcModo, abcIni, abcFim]);

  const liqUpdated = useMemo(() => {
    const now = new Date();
    return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + now.toLocaleDateString('pt-BR');
  }, []);

  // Monta os dados de exportação sob demanda (só quando o usuário abre o modal).
  const buildExportData = (target: 'ops' | 'abc' | 'recompra'): ExportData => {
    const dateSuffix = new Date().toISOString().slice(0, 10);
    if (target === 'ops') {
      // Com a regra da cedida ligada, "Cliente" sai como DUX - a coluna extra preserva
      // o cedente que consta na planilha para quem for conferir a origem da operação.
      return {
        title: selected ? `Operações - ${VEHICLES.find(v => v.id === selected)!.label}` : 'Todas as Operações',
        filename: `operacoes-${dateSuffix}`,
        columns: [
          { header: 'ID' }, { header: 'Veículo' }, { header: 'Status' }, { header: 'Cliente' },
          ...(regraCedida ? [{ header: 'Cedente original' } as const] : []),
          { header: 'Data Adiant.' }, { header: 'Sacado' },
          { header: 'Ant. Bruto', type: 'currency' }, { header: 'Ant. Líquido', type: 'currency' },
          { header: 'Faturamento', type: 'currency' }, { header: 'Duração (dias)', type: 'number' },
        ],
        rows: tableOps.map(op => [
          op.id, VEHICLES.find(v => v.id === op.veiculo)?.label ?? op.veiculo, op.status, op.cliente,
          ...(regraCedida ? [op.clienteOriginal ?? op.cliente] : []),
          op.dataAdiant, op.sacado, op.bruto, op.liquido, op.fat, op.dur,
        ]),
      };
    }
    if (target === 'abc') {
      return {
        title: `Curva ABC - ${abcType === 'cedente' ? 'Cedentes' : 'Sacados'}`,
        filename: `curva-abc-${abcType}-${dateSuffix}`,
        columns: [
          { header: '#', type: 'number' }, { header: 'Nome' }, { header: 'Veículos' },
          { header: 'Nº Op.', type: 'number' }, { header: 'Volume Total', type: 'currency' },
          { header: 'Participação (%)', type: 'percent' }, { header: '% Acumulado', type: 'percent' }, { header: 'Classe' },
        ],
        rows: abcRows.map((r, i) => [
          i + 1, r.nome, [...r.veiculos].map(vid => VEHICLES.find(v => v.id === vid)?.label ?? vid).join(' '),
          r.count, r.volume, r.pct, r.acum, r.cls,
        ]),
      };
    }
    // recompra
    const rows = viewOps.filter(o => o.subFundo === 'Recomprada');
    return {
      title: 'Operações Recompradas',
      filename: `operacoes-recompradas-${dateSuffix}`,
      columns: [
        { header: 'ID' }, { header: 'Veículo' }, { header: 'Cliente' }, { header: 'Sacado' },
        { header: 'Data Adiant.' }, { header: 'Ant. Bruto', type: 'currency' }, { header: 'Status' },
      ],
      rows: rows.map(op => [op.id, op.veiculo, op.cliente || '', op.sacado || '', op.dataAdiant || '', op.bruto, op.status || '']),
    };
  };

  const segments = VEHICLES.map(v => ({ id: v.id, value: totals[v.id], color: VEHICLE_HEX[v.id] }));
  const focusV = hovered ?? selected;
  const centerLabel = focusV ? VEHICLES.find(v => v.id === focusV)!.label : 'Total';
  const centerValue = focusV ? fmtShort(totals[focusV]) : fmtShort(grand);

  const cardStyle: React.CSSProperties = { background: 'var(--white)', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' };
  const selectStyle: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none',
    border: '1px solid var(--gray3)', borderRadius: 8, padding: '6px 28px 6px 12px',
    fontFamily: 'inherit', fontSize: 13, color: 'var(--black)', cursor: 'pointer', background: 'var(--white)', minWidth: 140,
  };
  const thStyle: React.CSSProperties = {
    padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--gray)',
    textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--gray3)', whiteSpace: 'nowrap', background: 'var(--bg)',
  };
  const tdStyle: React.CSSProperties = { padding: '10px 14px', color: 'var(--black)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--gray3)', fontSize: 13 };

  return (
    <div className="rel-veiculos" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        .rel-veiculos { animation: up .25s var(--transition-spring) both; }

        /* Tabelas - linhas */
        .rel-veiculos .rel-table tbody tr { transition: background .12s ease; }
        .rel-veiculos .rel-table tbody tr:hover { background: var(--yd) !important; }

        /* Cards (liquidez + veículo) - elevam no hover */
        .rel-veiculos .rel-liqcard:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover) !important; }
        .rel-veiculos .rel-vcard:hover { transform: translateY(-2px); box-shadow: var(--shadow-card-hover) !important; }

        /* Legenda */
        .rel-veiculos .rel-legend:active { transform: scale(0.98); }

        /* Header de seção colapsável */
        .rel-veiculos .rel-sechead:hover { background: var(--bg) !important; }
        .rel-veiculos .rel-sechead:hover .rel-sec-chevron { background: var(--gray3) !important; color: var(--black) !important; }

        /* Botões com transição base */
        .rel-veiculos button { transition: all .15s ease; }

        /* Botões "soltos" (abas ABC, tipo, limpar) - elevam */
        .rel-veiculos .rel-btn:hover { transform: translateY(-1px); box-shadow: 0 3px 10px rgba(0,0,0,0.10); }
        .rel-veiculos .rel-btn:active { transform: translateY(0); box-shadow: none; }

        /* Botão de exportar (ícone) */
        .rel-veiculos .rel-export-btn:hover { color: var(--black) !important; border-color: var(--gray2) !important; background: var(--bg) !important; }
        /* Opções do modal de exportação */
        .rel-export-opt:hover { border-color: var(--yellow) !important; box-shadow: 0 4px 14px rgba(0,0,0,0.08); transform: translateY(-1px); }

        /* Botões segmentados (Carteira Ativa/Histórico) - brilho */
        .rel-veiculos .rel-modo-btn:hover { filter: brightness(0.94); }

        /* Selects e inputs de data */
        .rel-veiculos select, .rel-veiculos input[type="date"] { transition: border-color .15s, box-shadow .15s; }
        .rel-veiculos select:hover, .rel-veiculos input[type="date"]:hover { border-color: var(--gray2) !important; }
        .rel-veiculos select:focus, .rel-veiculos input[type="date"]:focus { outline: none; border-color: var(--yellow) !important; box-shadow: 0 0 0 3px var(--yd) !important; }

        /* Pill de status acompanha o hover da linha */
        .rel-veiculos .rel-pill { transition: transform .15s; }
        .rel-veiculos .rel-table tbody tr:hover .rel-pill { transform: translateY(-1px); }

        /* Filtro de período - gatilho (pílula) */
        .dux-cal-trigger { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid var(--gray3); border-radius: var(--radius-pill); padding: 7px 12px; background: var(--white); cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: var(--black); transition: border-color .15s, box-shadow .15s; max-width: 100%; font-variant-numeric: tabular-nums; }
        .dux-cal-trigger:hover { border-color: var(--gray2); }
        .dux-cal-trigger.open { border-color: var(--yellow); box-shadow: 0 0 0 3px var(--yd); }
        .dux-cal-trigger .ph { color: var(--gray2); font-weight: 500; }
        .dux-cal-clear { width: 18px; height: 18px; border-radius: 50%; background: var(--bg); color: var(--gray); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background var(--transition), color var(--transition); }
        .dux-cal-clear:hover { background: var(--red); color: #fff; }

        /* Calendário (popover) */
        .dux-cal { background: var(--white); border: 1.5px solid var(--gray3); border-radius: var(--radius-md); box-shadow: var(--shadow-card-hover); padding: 12px; width: 300px; z-index: 99999; font-family: 'Manrope', sans-serif; }
        .dux-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .dux-cal-title { font-size: 13.5px; font-weight: 800; color: var(--black); text-transform: capitalize; }
        .dux-cal-nav { width: 28px; height: 28px; border: 1px solid var(--gray3); border-radius: 8px; background: var(--white); cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--gray); font-size: 16px; line-height: 1; transition: all .12s; }
        .dux-cal-nav:hover { border-color: var(--yellow); background: var(--yd); color: var(--black); }
        .dux-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .dux-cal-wd { font-size: 10.5px; font-weight: 700; color: var(--gray2); text-align: center; padding: 4px 0; }
        .dux-cal-day { height: 34px; border: none; background: transparent; border-radius: 8px; cursor: pointer; font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--black); display: flex; align-items: center; justify-content: center; transition: background .1s; }
        .dux-cal-day.other { color: var(--gray2); }
        .dux-cal-day:hover { background: var(--yd); }
        .dux-cal-day.inrange { background: var(--yd); }
        .dux-cal-day.edge { background: var(--yellow); color: var(--on-yellow); font-weight: 800; }
        .dux-cal-day.today:not(.edge) { box-shadow: inset 0 0 0 1.5px var(--gray2); }
        .dux-cal-foot { display: flex; justify-content: space-between; margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--gray3); }
        .dux-cal-foot button { border: none; background: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700; color: #B58900; }
        .dux-cal-foot button.muted { color: var(--gray); }
        .dux-cal-foot button:hover { text-decoration: underline; }

        /* Multiselect com busca */
        .dux-ms-trigger { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid var(--gray3); border-radius: var(--radius-pill); padding: 7px 12px; background: var(--white); cursor: pointer; font-family: 'Manrope', sans-serif; font-size: 12.5px; font-weight: 600; color: var(--gray); transition: border-color .15s, box-shadow .15s, color .15s; max-width: 240px; }
        .dux-ms-trigger:hover { border-color: var(--gray2); }
        .dux-ms-trigger.open { border-color: var(--yellow); box-shadow: 0 0 0 3px var(--yd); }
        .dux-ms-trigger.active { color: var(--black); border-color: var(--yellow); background: var(--yd); }
        .dux-ms-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dux-ms-count { background: var(--yellow); color: var(--on-yellow); font-size: 10.5px; font-weight: 800; min-width: 18px; height: 18px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; padding: 0 5px; flex-shrink: 0; }
        .dux-ms { background: var(--white); border: 1.5px solid var(--gray3); border-radius: var(--radius-md); box-shadow: var(--shadow-card-hover); z-index: 99999; font-family: 'Manrope', sans-serif; overflow: hidden; }
        .dux-ms-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--gray3); }
        .dux-ms-search input { border: none; outline: none; background: transparent; font-family: inherit; font-size: 13px; color: var(--black); width: 100%; }
        .dux-ms-search input::placeholder { color: var(--gray2); }
        .dux-ms-list { max-height: 240px; overflow-y: auto; padding: 6px; }
        .dux-ms-empty { padding: 16px; text-align: center; font-size: 12.5px; color: var(--gray2); }
        .dux-ms-opt { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius-sm); cursor: pointer; font-size: 13px; color: var(--black); transition: background .1s; }
        .dux-ms-opt:hover { background: var(--bg); }
        .dux-ms-opt.on { background: var(--yd); font-weight: 700; }
        .dux-ms-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--gray3); display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: var(--black); flex-shrink: 0; background: var(--white); }
        .dux-ms-check.on { background: var(--yellow); border-color: var(--yellow); color: var(--on-yellow); font-weight: 800; }
        .dux-ms-opt-txt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dux-ms-foot { padding: 8px 12px; border-top: 1px solid var(--gray3); }
        .dux-ms-foot button { border: none; background: none; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 700; color: var(--gray); }
        .dux-ms-foot button:hover { color: var(--red); }

        /* Composição + cards de veículo (preenche a altura; responsivo) */
        .rel-veiculos .rel-comp-grid { display: grid; grid-template-columns: 360px 1fr; gap: 18px; align-items: stretch; }
        .rel-veiculos .rel-vcards { display: flex; flex-direction: column; gap: 12px; }
        .rel-veiculos .rel-vcards .rel-vcard { flex: 1; }
        @media (max-width: 980px) {
          .rel-veiculos .rel-comp-grid { grid-template-columns: 1fr; }
          .rel-veiculos .rel-vcards .rel-vcard { flex: none; }
        }

        /* Card de recompradas (clicável) */
        .rel-veiculos .rel-recomp-card > div[role="button"]:hover { background: var(--bg); }

        /* Saldo editável por veículo */
        .rel-veiculos .rel-saldo-input { border-radius: 6px; transition: background .15s, box-shadow .15s; margin: 1px 0; }
        .rel-veiculos .rel-saldo-input::placeholder { color: var(--gray2); font-weight: 700; }
        .rel-veiculos .rel-saldo-input:hover { background: var(--bg) !important; }
        .rel-veiculos .rel-saldo-input:focus { background: var(--yd) !important; box-shadow: 0 0 0 3px var(--yd); }

        /* Skeleton de carregamento (shimmer) */
        @keyframes relshimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
        .rel-skel { display: block; border-radius: 6px; background: linear-gradient(90deg, var(--gray3) 25%, #EEEFEA 37%, var(--gray3) 63%); background-size: 480px 100%; animation: relshimmer 1.3s ease-in-out infinite; }
        .rel-skel-fade { animation: pulse 1.3s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
      `}</style>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Cabeçalho: título/descrição (esq.) + status/atualização (dir.) ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="admin-page-title">{meta.title}</h1>
          <p className="admin-page-desc">{meta.desc}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            {loadingOps ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gray)' }}>
                <span style={{ width: 13, height: 13, border: '2px solid var(--gray3)', borderTopColor: 'var(--yellow)', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />
                Atualizando base da planilha…
              </span>
            ) : opsError ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#B91C1C' }}>
                <strong style={{ fontWeight: 700 }}>Falha ao carregar a planilha.</strong>
                <span style={{ color: '#7F1D1D' }}>{opsError}</span>
              </span>
            ) : opsFetchedAt ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--gray2)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                {totalOpsDistintas.toLocaleString('pt-BR')} operações ({viewOps.length.toLocaleString('pt-BR')} linhas) · base lida em {fmtSaldoUpdate(opsFetchedAt)}
              </span>
            ) : null}
            {saldoUpdatedAt && (
              <span style={{ fontSize: 11, color: 'var(--gray2)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22C55E', flexShrink: 0 }} />
                Saldos atualizados em {fmtSaldoUpdate(saldoUpdatedAt)}
              </span>
            )}
          </div>
          <button
            className="rel-btn"
            onClick={() => loadOps(true)}
            disabled={loadingOps}
            title="Reler a planilha agora"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
              border: '1px solid var(--gray3)', borderRadius: 'var(--radius-pill)', background: 'var(--white)',
              fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, color: 'var(--black)',
              cursor: loadingOps ? 'default' : 'pointer', opacity: loadingOps ? 0.6 : 1, flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={loadingOps ? { animation: 'spin .7s linear infinite' } : undefined}>
              <path d="M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {loadingOps ? 'Atualizando…' : 'Atualizar'}
          </button>
        </div>
      </div>

      {loadingOps ? <DashboardSkeleton /> : <>
      {/* ── Faixa de liquidez ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'stretch' }}>
        {VEHICLES.map(v => (
          <div key={v.id} className="rel-liqcard" style={{ ...cardStyle, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', overflow: 'hidden', transition: 'transform .15s, box-shadow .15s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: v.color }} />
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--gray)' }}>{v.label}</div>
            <input
              className="rel-saldo-input"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={saldoInput[v.id]}
              onChange={e => handleSaldoChange(v.id, e.target.value)}
              onBlur={() => handleSaldoBlur(v.id)}
              style={{ fontSize: 22, fontWeight: 800, color: 'var(--black)', lineHeight: 1.1, border: 'none', outline: 'none', background: 'transparent', width: '100%', padding: 0, ...mono }}
            />
            <div style={{ fontSize: 11, color: 'var(--gray)', ...mono }}>saldo disponível</div>
          </div>
        ))}
      </div>

      {/* ── Composição + cards de veículo ── */}
      <div className="rel-comp-grid">
        {/* Donut */}
        <div style={{ ...cardStyle, padding: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>Composição do Portfólio</div>
          <ModoToggle value={pizzaModo} onChange={setPizzaModo} full withTodos />
          <div style={{ margin: '12px 0', display: 'flex', justifyContent: 'center' }}>
            <DateRange ini={pizzaIni} fim={pizzaFim} onIni={setPizzaIni} onFim={setPizzaFim} onClear={() => { setPizzaIni(''); setPizzaFim(''); }} />
          </div>
          <div style={{ position: 'relative', width: 200, height: 200, margin: '4px auto 18px' }}>
            <Donut segments={segments} selected={selected} hovered={hovered} onSelect={id => setSelected(s => (s === id ? null : id))} onHover={setHovered} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <span style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 500 }}>{centerLabel}</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--black)', ...mono }}>{centerValue}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {VEHICLES.map(v => {
              const vol = totals[v.id];
              const pct = grand > 0 ? (vol / grand) * 100 : 0;
              const isSel = selected === v.id;
              const isHover = hovered === v.id;
              const dimmed = (selected && !isSel) || (hovered && !isHover);
              return (
                <div
                  key={v.id}
                  className="rel-legend"
                  onClick={() => setSelected(s => (s === v.id ? null : v.id))}
                  onMouseEnter={() => setHovered(v.id)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${isSel || isHover ? v.color : 'transparent'}`,
                    background: isSel || isHover ? v.bgLight : 'transparent', opacity: dimmed ? 0.4 : 1, transition: 'all .15s',
                  }}
                >
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: v.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', flex: 1 }}>{v.label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--black)', ...mono }}>{pct.toFixed(2)}%</div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', ...mono }}>{fmtShort(vol)}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {selected && (
            <button className="rel-btn" onClick={() => setSelected(null)} style={{
              marginTop: 14, width: '100%', padding: 8, background: 'var(--bg)', border: '1px solid var(--gray3)', borderRadius: 8,
              fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: 'var(--gray)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}><IconX size={12} /> Limpar filtro</button>
          )}
        </div>

        {/* Cards de veículo */}
        <div className="rel-vcards">
          {VEHICLES.map(v => {
            const vol = totals[v.id];
            const pct = grand > 0 ? (vol / grand) * 100 : 0;
            const isSel = selected === v.id;
            const isHover = hovered === v.id;
            const dimmed = (selected && !isSel) || (hovered && !isHover);
            return (
              <div
                key={v.id}
                className="rel-vcard"
                onClick={() => setSelected(s => (s === v.id ? null : v.id))}
                onMouseEnter={() => setHovered(v.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  ...cardStyle, padding: '18px 22px', cursor: 'pointer',
                  border: `2px solid ${isSel || isHover ? v.color : 'var(--gray3)'}`,
                  background: isSel ? v.bgLight : 'var(--white)', opacity: dimmed ? 0.45 : 1,
                  display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', alignItems: 'center', gap: 28, transition: 'all .2s',
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.03em', background: v.color, color: v.textColor }}>
                  {v.label}
                </div>
                <Metric label="Volume Total" value={fmtShort(vol)} sub={fmtBRL(vol)} />
                <Metric label="% do Portfólio" value={`${pct.toFixed(2)}%`} sub={`de ${fmtShort(grand)} total`} />
                <Metric label="Nº Operações" value={opCounts[v.id].toLocaleString('pt-BR')} sub="no período selecionado" />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Operações recompradas (consumo de liquidez) - card expansível ── */}
      <div className="rel-recomp-card" style={{ ...cardStyle, padding: 0, borderLeft: '4px solid var(--red)', overflow: 'hidden' }}>
        <div
          role="button"
          onClick={() => setRecompOpen(o => !o)}
          title={recompOpen ? 'Recolher detalhes' : 'Ver detalhes das operações recompradas'}
          style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '16px 22px', cursor: 'pointer' }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#FBE6E4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red)', flexShrink: 0 }}><IconUndo size={20} /></div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--gray)' }}>Operações Recompradas</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
              Capital de liquidez consumido para recompra · clique para {recompOpen ? 'recolher' : 'ver detalhes'}
            </div>
          </div>
          <div style={{ textAlign: 'left', minWidth: 90 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--black)', lineHeight: 1.1, ...mono }}>{recompra.count.toLocaleString('pt-BR')}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>operações</div>
          </div>
          <div style={{ textAlign: 'left', minWidth: 120 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--red)', lineHeight: 1.1, ...mono }}>{fmtShort(recompra.vol)}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)', ...mono }}>volume recomprado</div>
          </div>
          <ExportIconBtn title="Exportar operações recompradas" onClick={() => setExportTarget('recompra')} />
        </div>
        {recompOpen && (() => {
          const rows = viewOps.filter(o => o.subFundo === 'Recomprada');
          return (
            <div style={{ borderTop: '1px solid var(--gray3)', overflowX: 'auto' }}>
              {rows.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--gray)' }}>Nenhuma operação recomprada.</div>
              ) : (
                <table className="rel-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr>{['ID', 'Veículo', 'Cliente', 'Sacado', 'Data Adiant.', 'Ant. Bruto', 'Status'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((op, idx) => {
                      const st = STATUS_STYLE[op.status] ?? STATUS_STYLE['Concluída'];
                      return (
                        <tr key={`${op.id}-${idx}`}>
                          <td style={{ ...tdStyle, ...mono, fontWeight: 700 }}>{op.id}</td>
                          <td style={tdStyle}>{op.veiculo}</td>
                          <td style={tdStyle}>{op.cliente || '-'}</td>
                          <td style={tdStyle}>{op.sacado || '-'}</td>
                          <td style={{ ...tdStyle, ...mono }}>{op.dataAdiant || '-'}</td>
                          <td style={{ ...tdStyle, ...mono }}>{fmtBRL(op.bruto)}</td>
                          <td style={tdStyle}><span className="rel-pill" style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 700, background: st.bg, color: st.fg }}>{op.status || '-'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Tabela de operações ── */}
      <Section
        title={selected ? `Operações - ${VEHICLES.find(v => v.id === selected)!.label}` : 'Todas as Operações'}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--gray)', ...mono }}>
              {(() => {
                const uniqueOps = new Set(tableOps.map(o => o.id)).size;
                return tableOps.length > 50
                  ? `Exibindo 50 de ${uniqueOps.toLocaleString('pt-BR')} operações`
                  : `${uniqueOps.toLocaleString('pt-BR')} operações`;
              })()}
            </span>
            <ExportIconBtn title="Exportar operações" onClick={() => setExportTarget('ops')} />
          </div>
        }
      >
        <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--gray3)' }}>
          <DateRange ini={opsIni} fim={opsFim} onIni={setOpsIni} onFim={setOpsFim} onClear={() => { setOpsIni(''); setOpsFim(''); }} />
        </div>
        <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Filtrar por</span>
          <MultiSelect values={fFundo} onChange={setFFundo} placeholder="Fundo" options={VEHICLES.map(v => v.id)} />
          <MultiSelect values={fStatus} onChange={setFStatus} placeholder="Status" options={[...new Set(viewOps.map(o => o.status))].sort()} />
          <MultiSelect values={fCliente} onChange={setFCliente} placeholder="Cliente" options={clienteOpts} />
          <MultiSelect values={fSacado} onChange={setFSacado} placeholder="Sacado" options={sacadoOpts} />
          {activeFilterCount > 0 && (
            <button className="rel-btn" onClick={() => { setFFundo([]); setFStatus([]); setFCliente([]); setFSacado([]); }} style={{
              marginLeft: 'auto', padding: '6px 14px', border: '1px solid var(--gray3)', borderRadius: 8, background: 'var(--white)',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--gray)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}><IconX size={12} /> Limpar filtros ({activeFilterCount})</button>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="rel-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
            <thead>
              <tr>
                {['ID', 'Veículo', 'Status', 'Cliente', 'Data Adiant.', 'Sacado', 'Ant. Bruto', 'Ant. Líquido', 'Faturamento', 'Duração (dias)'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableOps.length === 0 && (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)', fontSize: 13 }}>Nenhuma operação encontrada para os filtros selecionados.</td></tr>
              )}
              {tableOps.slice(0, 50).map((op, idx) => {
                const v = VEHICLES.find(x => x.id === op.veiculo)!;
                const st = STATUS_STYLE[op.status] ?? STATUS_STYLE['Concluída'];
                return (
                  <tr key={`${op.id}-${idx}`}>
                    <td style={{ ...tdStyle, ...mono, fontSize: 12, color: 'var(--gray)' }}>{op.id}</td>
                    <td style={tdStyle}><span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: v.color, color: v.textColor }}>{v.label}</span></td>
                    <td style={tdStyle}><span className="rel-pill" style={{ display: 'inline-flex', padding: '3px 9px', borderRadius: 'var(--radius-pill)', fontSize: 11, fontWeight: 600, background: st.bg, color: st.fg }}>{op.status}</span></td>
                    <td style={tdStyle}>
                      {op.clienteOriginal ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={`Cedente na planilha: ${op.clienteOriginal}`}>
                          {op.cliente}
                          <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: 'var(--yd)', color: '#8A6100', whiteSpace: 'nowrap' }}>cedida</span>
                        </span>
                      ) : op.cliente}
                    </td>
                    <td style={{ ...tdStyle, ...mono, fontSize: 12, color: 'var(--gray)' }}>{op.dataAdiant}</td>
                    <td style={tdStyle}>{op.sacado}</td>
                    <td style={{ ...tdStyle, ...mono }}>{fmtBRL(op.bruto)}</td>
                    <td style={{ ...tdStyle, ...mono }}>{fmtBRL(op.liquido)}</td>
                    <td style={{ ...tdStyle, ...mono }}>{fmtBRL(op.fat)}</td>
                    <td style={{ ...tdStyle, ...mono, textAlign: 'center' }}>{op.dur}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Curva ABC ── */}
      <Section
        title="Curva ABC"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Regra FIDC (Cedida) → cedente DUX (afeta toda a tela; toggle vive aqui) */}
            <div
              onClick={e => e.stopPropagation()}
              title={`FIDC (Cedida): a DUX compra o título do cliente e cede o crédito ao fundo - perante o FIDC, a cedente da operação é a própria DUX. Com a regra ligada, essas ${cedidaCount} operação(ões) cedida(s) contam como cedente DUX na tabela, nos filtros, na Curva ABC e nas exportações. O cedente original continua visível no tooltip da célula.`}
              style={{
                display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', cursor: 'help',
                borderRadius: 'var(--radius-pill)', transition: 'background var(--transition), border-color var(--transition)',
                border: `1px solid ${regraCedida ? 'var(--yellow)' : 'var(--gray3)'}`,
                background: regraCedida ? 'var(--yd)' : 'var(--bg)',
              }}
            >
              <span style={{ display: 'inline-flex', color: regraCedida ? 'var(--black)' : 'var(--gray)' }}><IconScale size={13} /></span>
              <span style={{ fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap', color: regraCedida ? 'var(--black)' : 'var(--gray)' }}>
                Cedida → cedente DUX
              </span>
              <Switch
                checked={regraCedida}
                label="Aplicar a regra: tag FIDC (Cedida) → cedente DUX"
                onChange={v => {
                  setRegraCedida(v);
                  try { localStorage.setItem(REGRA_CEDIDA_KEY, v ? '1' : '0'); } catch {}
                  setFCliente([]); // os nomes de cedente mudam com a regra - evita filtro órfão
                }}
              />
            </div>
            <span style={{ fontSize: 12, color: 'var(--gray)', ...mono }}>{abcRows.length} {abcType === 'cedente' ? 'cedentes' : 'sacados'}</span>
            <ExportIconBtn title="Exportar curva ABC" onClick={() => setExportTarget('abc')} />
          </div>
        }
      >
        <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <ModoToggle value={abcModo} onChange={setAbcModo} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Veículo</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['ALL', 'FIDC', 'ATLAS', 'DUX'] as const).map(vid => {
              const v = vid === 'ALL' ? null : VEHICLES.find(x => x.id === vid)!;
              const active = abcVehicle === vid;
              const bg = vid === 'ALL' ? 'var(--black)' : v!.color;
              const fg = vid === 'ALL' ? '#fff' : v!.textColor;
              return (
                <button key={vid} className="rel-btn" onClick={() => setAbcVehicle(vid)} style={{
                  padding: '5px 14px', borderRadius: 'var(--radius-pill)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${active ? bg : 'var(--gray3)'}`,
                  background: active ? bg : 'var(--white)', color: active ? fg : 'var(--gray)', transition: 'all .15s',
                }}>{vid === 'ALL' ? 'Todos' : v!.label}</button>
              );
            })}
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--gray)', fontWeight: 600 }}>Agrupar por</span>
            {(['cedente', 'sacado'] as const).map(t => (
              <button key={t} className="rel-btn" onClick={() => setAbcType(t)} style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                border: `1px solid ${abcType === t ? 'var(--black)' : 'var(--gray3)'}`,
                background: abcType === t ? 'var(--black)' : 'var(--white)', color: abcType === t ? 'var(--yellow)' : 'var(--gray)', transition: 'all .15s',
              }}>{t === 'cedente' ? 'Cedente' : 'Sacado'}</button>
            ))}
          </div>
        </div>
        <div style={{ padding: '12px 20px', background: 'var(--bg)', borderBottom: '1px solid var(--gray3)' }}>
          <DateRange ini={abcIni} fim={abcFim} onIni={setAbcIni} onFim={setAbcFim} onClear={() => { setAbcIni(''); setAbcFim(''); }} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="rel-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, width: 40 }}>#</th>
                <th style={thStyle}>Nome</th>
                <th style={thStyle}>Veículos</th>
                <th style={thStyle}>Nº Op.</th>
                <th style={thStyle}>Volume Total</th>
                <th style={{ ...thStyle, width: 130 }}>Participação</th>
                <th style={thStyle}>% Acumulado</th>
                <th style={{ ...thStyle, width: 50 }}>Classe</th>
              </tr>
            </thead>
            <tbody>
              {abcRows.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: 'var(--gray)', fontSize: 13 }}>Nenhum dado para os filtros selecionados.</td></tr>
              )}
              {abcRows.map((row, i) => {
                const clsColor = row.cls === 'A' ? { bg: '#DCFCE7', fg: '#16A34A', bar: '#22C55E' } : row.cls === 'B' ? { bg: '#DBEAFE', fg: '#1D4ED8', bar: '#3B82F6' } : { bg: '#F3F4F6', fg: '#6B7280', bar: '#9CA3AF' };
                return (
                  <tr key={row.nome}>
                    <td style={{ ...tdStyle, ...mono, fontWeight: 800, color: 'var(--gray)', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{row.nome}</td>
                    <td style={tdStyle}>
                      {[...row.veiculos].map(vid => {
                        const v = VEHICLES.find(x => x.id === vid)!;
                        return <span key={vid} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: v.color, color: v.textColor, marginRight: 3 }}>{v.label}</span>;
                      })}
                    </td>
                    <td style={{ ...tdStyle, ...mono, fontSize: 12 }}>{row.count}</td>
                    <td style={{ ...tdStyle, ...mono }}>{fmtBRL(row.volume)}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 100, background: '#EEE', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                          <div style={{ width: `${row.pct.toFixed(1)}%`, background: clsColor.bar, height: 6, borderRadius: 4 }} />
                        </div>
                        <span style={{ ...mono, fontSize: 12, whiteSpace: 'nowrap' }}>{row.pct.toFixed(2)}%</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, ...mono, fontSize: 12, color: 'var(--gray)' }}>{row.acum.toFixed(2)}%</td>
                    <td style={tdStyle}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 800, background: clsColor.bg, color: clsColor.fg }}>{row.cls}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      </>}

      {exportTarget && (
        <ExportModal data={buildExportData(exportTarget)} onClose={() => setExportTarget(null)} />
      )}
    </div>
  );
}

// Botão de exportar (só ícone) - usado no header das tabelas
function ExportIconBtn({ onClick, title = 'Exportar' }: { onClick: (e: React.MouseEvent) => void; title?: string }) {
  return (
    <button
      className="rel-export-btn"
      title={title}
      aria-label={title}
      onClick={e => { e.stopPropagation(); onClick(e); }}
      style={{
        width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--gray3)', borderRadius: 8, background: 'var(--white)', color: 'var(--gray)',
        cursor: 'pointer', flexShrink: 0, padding: 0,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Modal de escolha do formato de exportação (PDF ou Excel/planilha)
function ExportModal({ data, onClose }: { data: ExportData; onClose: () => void }) {
  const doExport = (fmt: 'pdf' | 'csv') => {
    if (fmt === 'pdf') {
      const ok = exportToPDF(data);
      if (!ok) { alert('Pop-up bloqueado. Permita pop-ups para exportar em PDF.'); return; }
    } else {
      exportToCSV(data);
    }
    onClose();
  };

  const optStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', border: '1px solid var(--gray3)',
    borderRadius: 12, background: 'var(--white)', cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit',
    transition: 'all .15s',
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20, animation: 'up .2s ease both' }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--white)', borderRadius: 16, boxShadow: 'var(--shadow-card-hover)', width: '100%', maxWidth: 420, overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--gray3)' }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--black)' }}>Exportar</div>
          <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 2 }}>{data.title} · {data.rows.length.toLocaleString('pt-BR')} registro(s)</div>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button className="rel-export-opt" style={optStyle} onClick={() => doExport('pdf')}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><IconDoc size={18} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--black)' }}>PDF</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--gray)' }}>Documento formatado para impressão / arquivo.</span>
            </span>
          </button>
          <button className="rel-export-opt" style={optStyle} onClick={() => doExport('csv')}>
            <span style={{ width: 40, height: 40, borderRadius: 10, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><IconChart size={18} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--black)' }}>Excel / Planilha</span>
              <span style={{ display: 'block', fontSize: 12, color: 'var(--gray)' }}>Arquivo .csv que abre no Excel e no Google Sheets.</span>
            </span>
          </button>
        </div>
        <div style={{ padding: '0 18px 18px', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid var(--gray3)', borderRadius: 8, background: 'var(--white)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--gray)', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--black)', ...mono }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--gray)', ...mono }}>{sub}</div>
    </div>
  );
}

// Multiselect com busca, no padrão do sistema (popover via portal)
function MultiSelect({ values, onChange, placeholder, options }: {
  values: string[]; onChange: (v: string[]) => void; placeholder: string; options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options;
  const toggle = (o: string) => onChange(values.includes(o) ? values.filter(x => x !== o) : [...values, o]);
  const rect = btnRef.current?.getBoundingClientRect();
  const active = values.length > 0;
  const label = !active ? placeholder : values.length === 1 ? values[0] : `${placeholder}: ${values.length}`;

  return (
    <>
      <button ref={btnRef} type="button" className={`dux-ms-trigger${active ? ' active' : ''}${open ? ' open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="dux-ms-label">{label}</span>
        {active && <span className="dux-ms-count">{values.length}</span>}
        <svg width="11" height="7" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, color: 'var(--gray2)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={popRef} className="dux-ms" style={{ position: 'fixed', top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0, width: Math.max(rect?.width ?? 200, 220) }}>
          <div className="dux-ms-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--gray2)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2" /><path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={`Buscar ${placeholder.toLowerCase()}…`} />
          </div>
          <div className="dux-ms-list">
            {filtered.length === 0 ? (
              <div className="dux-ms-empty">Nenhum item encontrado</div>
            ) : filtered.map(o => {
              const checked = values.includes(o);
              return (
                <label key={o} className={`dux-ms-opt${checked ? ' on' : ''}`}>
                  <span className={`dux-ms-check${checked ? ' on' : ''}`}>{checked && <IconCheck size={11} />}</span>
                  <input type="checkbox" checked={checked} onChange={() => toggle(o)} style={{ display: 'none' }} />
                  <span className="dux-ms-opt-txt">{o}</span>
                </label>
              );
            })}
          </div>
          {active && (
            <div className="dux-ms-foot">
              <button type="button" onClick={() => onChange([])}>Limpar seleção ({values.length})</button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Página Relatórios (com subabas)
// ─────────────────────────────────────────────────────────────────────────────
type ReportTab = 'veiculos';

const TAB_META: Record<ReportTab, { label: string; title: string; desc: string }> = {
  veiculos: {
    label: 'Veículos',
    title: 'Relatório de Veículos',
    desc: 'Liquidez, composição do portfólio e operações por veículo de crédito',
  },
};

export default function RelatoriosPage({ token }: { token: string }) {
  const [tab, setTab] = useState<ReportTab>('veiculos');
  const meta = TAB_META[tab];

  return (
    <div className="admin-content-wrap">
      <div className="config-tabs">
        {(Object.keys(TAB_META) as ReportTab[]).map(t => (
          <button key={t} className={`config-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{TAB_META[t].label}</button>
        ))}
      </div>

      {tab === 'veiculos' && <RelatorioVeiculos token={token} meta={meta} />}
    </div>
  );
}
