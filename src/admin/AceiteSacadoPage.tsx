import { useState, useEffect, useRef } from 'react';
import { IconArrowRight, IconSpinner } from '../components/icons';
import { createPortal } from 'react-dom';
import {
  formatCNPJ, formatDate, formatBRLValue,
  type Operacao, type TipoOperacao, type Anexo, type EmailHistoryEntry,
} from '../lib/aceite-storage';
import {
  getOperacoesApi, createOperacaoApi, updateStatusApi, reenviarApi,
  deleteOperacaoApi, addAnexoApi, getAnexosByOperacaoApi, deleteAnexoApi,
  addEmailHistoryApi,
} from '../lib/aceite-api';
import { useToast, useAuth } from './AdminApp';
import { CategoriaTag } from '../components/CategoriaTag';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  PENDENTE:  { label: 'Pendente',  bg: 'rgba(255,180,0,0.12)',    color: '#B45309',  dot: '#F59E0B' },
  ACEITO:    { label: 'Aceito',    bg: 'rgba(30,138,62,0.10)',    color: '#15803D',  dot: '#22C55E' },
  RECUSADO:  { label: 'Recusado', bg: 'rgba(217,48,37,0.10)',    color: '#B91C1C',  dot: '#EF4444' },
  EXPIRADO:  { label: 'Expirado', bg: 'rgba(170,170,170,0.15)',  color: '#6B7280',  dot: '#9CA3AF' },
};

function StatusBadge({ status }: { status: Operacao['status'] }) {
  const c = STATUS_CFG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700,
      padding: '3px 9px', borderRadius: 99, background: c.bg, color: c.color }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function StatCard({ label, desc, value, accent }: { label: string; desc: string; value: number; accent: string }) {
  return (
    <div className="admin-stat-card-v2" style={{ '--accent-color': accent } as React.CSSProperties}>
      <p className="stat-v2-label">{label}</p>
      <p className="stat-v2-value">{value}</p>
      <p className="stat-v2-desc">{desc}</p>
    </div>
  );
}

// ── Modal base ─────────────────────────────────────────────────────────────────
function Modal({ onClose, children, width = 560 }: { onClose: () => void; children: React.ReactNode; width?: number }) {
  useEffect(() => {
    function handle(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [onClose]);

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(18,19,22,0.45)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'relative', background: 'var(--white)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: width,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', animation: 'scaleIn 0.18s ease both' }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)' }}>{title}</p>
      <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
  border: '1.5px solid var(--gray3)', background: 'var(--white)',
  fontSize: 13.5, color: 'var(--black)', outline: 'none', width: '100%',
  transition: 'border-color 0.15s',
};

// ── Filter Dropdown ────────────────────────────────────────────────────────────
function FilterDropdown({ label, values, options, onChange }: {
  label: string; values: string[];
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
    ? values.length === 1 ? (options.find(o => o.value === values[0])?.label ?? label) : `${label} (${values.length})`
    : label;

  return (
    <>
      <button ref={triggerRef} className={`filter-dropdown-btn${hasSelection ? ' active' : ''}`} onClick={openDropdown} type="button">
        <span>{btnLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left, zIndex: 9999 }}>
          {hasSelection && <div className="filter-dropdown-clear" onClick={() => onChange([])}>Limpar seleção</div>}
          {options.map(o => {
            const checked = values.includes(o.value);
            return (
              <div key={o.value} className={`filter-dropdown-option${checked ? ' active' : ''}`} onClick={() => toggle(o.value)}>
                <span className={`filter-check${checked ? ' checked' : ''}`}>
                  {checked && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
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

// ── Download Comprovante ───────────────────────────────────────────────────────
function downloadComprovante(op: Operacao) {
  const ac = op.aceitante!;
  const parcelas = op.parcelas && op.parcelas.length > 1;
  const valorHtml = parcelas
    ? `<strong>${op.parcelas!.length} parcelas</strong> totalizando <strong>${formatBRLValue(op.parcelas!.reduce((s, p) => s + p.valorNumerico, 0))}</strong>`
    : op.valorNF != null
    ? `<strong>${formatBRLValue(op.valorNF)}</strong>${op.vencimento ? ` &mdash; venc. <strong>${formatDate(op.vencimento)}</strong>` : ''}`
    : '&mdash;';

  const parcelasHtml = parcelas
    ? `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px">
        <thead><tr style="background:#F5F5F3">
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">#</th>
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">Valor</th>
          <th style="padding:6px 10px;text-align:left;color:#999;font-weight:700;font-size:11px;text-transform:uppercase">Vencimento</th>
        </tr></thead>
        <tbody>${op.parcelas!.map((p, i) => `<tr style="border-top:1px solid #eee"><td style="padding:6px 10px;color:#B45309;font-weight:800">${i + 1}ª</td><td style="padding:6px 10px;font-weight:600">${p.valor || formatBRLValue(p.valorNumerico)}</td><td style="padding:6px 10px;color:#555">${p.vencimento ? formatDate(p.vencimento) : '-'}</td></tr>`).join('')}</tbody>
      </table>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>${op.tipo === 'TERMO_ANUENCIA' ? 'Comprovante de Anuência' : 'Comprovante de Aceite'} - ${ac.protocolo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; color: #333; background: #fff; padding: 40px; max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; color: #121316; font-weight: 800; margin-bottom: 4px; }
  .sub { font-size: 13px; color: #999; margin-bottom: 28px; }
  .proto { background: #F5F5F3; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px; text-align: center; }
  .proto-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #AAAAAA; font-weight: 700; margin-bottom: 6px; }
  .proto-value { font-size: 22px; font-weight: 800; color: #121316; letter-spacing: -0.01em; }
  .proto-date { font-size: 12px; color: #AAAAAA; margin-top: 4px; }
  .section { margin-bottom: 20px; border: 1px solid #E3E4DE; border-radius: 10px; overflow: hidden; }
  .section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; font-weight: 800; padding: 10px 16px; background: #FAFAF8; border-bottom: 1px solid #F0F0EC; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding: 14px 16px; }
  .field-label { font-size: 10px; text-transform: uppercase; color: #AAAAAA; font-weight: 700; letter-spacing: 0.05em; margin-bottom: 3px; }
  .field-value { font-size: 13.5px; color: #121316; font-weight: 500; }
  .sig-box { padding: 16px; display: flex; gap: 24px; flex-wrap: wrap; align-items: flex-start; }
  .sig-box img { max-width: 280px; border: 1px solid #eee; border-radius: 6px; background: #FAFAF8; }
  @media print { @page { margin: 20mm; } body { padding: 0; } }
</style>
</head>
<body>
  <h1>${op.tipo === 'TERMO_ANUENCIA' ? 'Comprovante de Anuência' : 'Comprovante de Aceite'}</h1>
  <p class="sub">Documento gerado pelo sistema DUX FIDC em ${new Date(ac.aceitoEm).toLocaleString('pt-BR')}</p>

  <div class="proto">
    <p class="proto-label">Número de Protocolo</p>
    <p class="proto-value">${ac.protocolo}</p>
    <p class="proto-date">${new Date(ac.aceitoEm).toLocaleString('pt-BR')}</p>
  </div>

  <div class="section">
    <p class="section-title">Cedente</p>
    <div class="grid">
      <div><p class="field-label">Razão Social</p><p class="field-value">${op.nomeCedente}</p></div>
      <div><p class="field-label">CNPJ</p><p class="field-value">${formatCNPJ(op.cnpjCedente)}</p></div>
    </div>
  </div>

  <div class="section">
    <p class="section-title">Sacado</p>
    <div class="grid">
      <div><p class="field-label">Razão Social</p><p class="field-value">${op.nomeSacado}</p></div>
      ${op.cnpjSacado ? `<div><p class="field-label">CNPJ</p><p class="field-value">${formatCNPJ(op.cnpjSacado)}</p></div>` : ''}
    </div>
  </div>

  <div class="section">
    <p class="section-title">Operação</p>
    <div style="padding:14px 16px">
      <p class="field-label">Valor</p>
      <p class="field-value" style="margin-bottom:${parcelasHtml ? 12 : 0}px">${valorHtml}</p>
      ${parcelasHtml}
    </div>
  </div>

  ${op.bancoNome ? `<div class="section">
    <p class="section-title">Conta Bancária (Escrow)</p>
    <div class="grid">
      <div style="grid-column:1/-1"><p class="field-label">Banco</p><p class="field-value">${op.bancoNome}</p></div>
      ${op.agencia ? `<div><p class="field-label">Agência</p><p class="field-value">${op.agencia}</p></div>` : ''}
      ${op.conta ? `<div><p class="field-label">Conta</p><p class="field-value">${op.conta.length > 1 ? op.conta.slice(0, -1) + '-' + op.conta.slice(-1) : op.conta}</p></div>` : ''}
      ${op.titularConta ? `<div><p class="field-label">Titularidade</p><p class="field-value">${op.titularConta}</p></div>` : ''}
      ${op.cnpjTitular ? `<div><p class="field-label">CNPJ Titular</p><p class="field-value">${formatCNPJ(op.cnpjTitular)}</p></div>` : ''}
    </div>
  </div>` : ''}

  <div class="section">
    <p class="section-title">Signatário</p>
    <div class="grid">
      <div><p class="field-label">Nome</p><p class="field-value">${ac.nome}</p></div>
      <div><p class="field-label">CPF</p><p class="field-value">${ac.cpf}</p></div>
      ${ac.cargo ? `<div><p class="field-label">Cargo</p><p class="field-value">${ac.cargo}</p></div>` : ''}
    </div>
  </div>

  ${(ac.assinaturaDataUrl || ac.fotoIdentidadeDataUrl) ? `<div class="section">
    <p class="section-title">Assinatura</p>
    <div class="sig-box">
      ${ac.assinaturaDataUrl ? `<div><p class="field-label" style="margin-bottom:8px">Assinatura</p><img src="${ac.assinaturaDataUrl}" alt="Assinatura" /></div>` : ''}
      ${ac.fotoIdentidadeDataUrl ? `<div><p class="field-label" style="margin-bottom:8px">Foto com Documento</p><img src="${ac.fotoIdentidadeDataUrl}" alt="Foto com identidade" /></div>` : ''}
    </div>
  </div>` : ''}

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `comprovante-aceite-${ac.protocolo}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Create Modal ───────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.08em',
      paddingBottom: 10, borderBottom: '1px solid var(--gray3)' }}>
      {children}
    </p>
  );
}

interface CedenteOption { id: string; nome: string; cnpj_cpf: string | null; email: string | null; conta_escrow: string | null }
interface SacadoOption  { id: string; cnpj_cpf: string | null; razao_social: string | null }

function _deletedCedenteSearch({ token, value, onChange }: {
  token: string;
  value: CedenteOption | null;
  onChange: (c: CedenteOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<CedenteOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const { onSessionExpired } = useAuth();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.closest('[data-cedente-search]')?.contains(e.target as Node)
        && !dropRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/admin-data?action=list_cedentes', { headers: { 'x-admin-session': token } })
      .then(r => { if (r.status === 401) { onSessionExpired(); throw new Error('401'); } return r.json(); })
      .then(d => setOptions((d.cedentes ?? []).map((c: any) => ({ id: c.id, nome: c.nome, cnpj_cpf: c.cnpj_cpf, email: c.email, conta_escrow: c.conta_escrow ?? null }))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, token]);

  const filtered = query.trim()
    ? options.filter(o => o.nome.toLowerCase().includes(query.toLowerCase()) || (o.cnpj_cpf ?? '').includes(query))
    : options;

  function select(c: CedenteOption) { onChange(c); setOpen(false); setQuery(''); }
  function clear() { onChange(null); setQuery(''); }

  return (
    <div data-cedente-search="" style={{ position: 'relative' }}>
      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
          border: '1.5px solid var(--yellow)', background: 'var(--white)',
          boxShadow: '0 0 0 3px var(--yd)',
        }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value.nome}</span>
          {value.cnpj_cpf && <span style={{ fontSize: 11.5, color: 'var(--gray2)', flexShrink: 0 }}>{formatCNPJ(value.cnpj_cpf)}</span>}
          <button type="button" onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar cedente pelo nome ou CNPJ…"
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>
      )}

      {open && !value && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed',
          top: (inputRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: inputRef.current?.getBoundingClientRect().left ?? 0,
          width: inputRef.current?.getBoundingClientRect().width ?? 320,
          zIndex: 99999,
          background: 'var(--white)',
          border: '1.5px solid var(--gray3)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          maxHeight: 260,
          overflowY: 'auto',
          animation: 'scaleIn .12s ease both',
        }}>
          {loading ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--gray2)' }}>
              {query ? 'Nenhum cedente encontrado.' : 'Nenhum cedente cadastrado.'}
            </div>
          ) : filtered.map(c => (
            <div key={c.id} onClick={() => select(c)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 10 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</p>
                {c.cnpj_cpf && <p style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 1 }}>{formatCNPJ(c.cnpj_cpf)}</p>}
              </div>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Sacado search dropdown ─────────────────────────────────────────────────────
interface SacadoOption { id: string; cnpj_cpf: string | null; razao_social: string | null }

function SacadoSearch({ token, cedenteCnpj, value, onChange }: {
  token: string;
  cedenteCnpj: string;
  value: SacadoOption | null;
  onChange: (s: SacadoOption | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SacadoOption[]>([]);
  const [isFiltered, setIsFiltered] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const { onSessionExpired } = useAuth();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.closest('[data-sacado-search]')?.contains(e.target as Node)
        && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const cnpjClean = cedenteCnpj.replace(/\D/g, '');
    const url = cnpjClean
      ? `/api/admin-data?action=list_sacados_by_cedente&cnpj=${cnpjClean}`
      : '/api/admin-data?action=list_sacados';
    fetch(url, { headers: { 'x-admin-session': token } })
      .then(r => { if (r.status === 401) { onSessionExpired(); throw new Error('401'); } return r.json(); })
      .then(d => { setOptions(d.sacados ?? []); setIsFiltered(d.filtered ?? false); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, cedenteCnpj, token]);

  const filtered = query.trim()
    ? options.filter(o =>
        (o.razao_social ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (o.cnpj_cpf ?? '').includes(query.replace(/\D/g, ''))
      )
    : options;

  function select(s: SacadoOption) { onChange(s); setOpen(false); setQuery(''); }
  function clear() { onChange(null); setQuery(''); }

  return (
    <div data-sacado-search="" style={{ position: 'relative' }}>
      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
          border: '1.5px solid var(--yellow)', background: 'var(--white)',
          boxShadow: '0 0 0 3px var(--yd)',
        }}>
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value.razao_social ?? '-'}
          </span>
          {value.cnpj_cpf && <span style={{ fontSize: 11.5, color: 'var(--gray2)', flexShrink: 0 }}>{formatCNPJ(value.cnpj_cpf)}</span>}
          <button type="button" onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={cedenteCnpj ? 'Buscar sacado…' : 'Selecione um cedente primeiro'}
            disabled={!cedenteCnpj}
            style={{ ...inputStyle, paddingLeft: 32, opacity: cedenteCnpj ? 1 : 0.5, cursor: cedenteCnpj ? 'text' : 'not-allowed' }}
          />
        </div>
      )}

      {open && !value && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed',
          top: (inputRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: inputRef.current?.getBoundingClientRect().left ?? 0,
          width: inputRef.current?.getBoundingClientRect().width ?? 320,
          zIndex: 99999,
          background: 'var(--white)',
          border: '1.5px solid var(--gray3)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          maxHeight: 260,
          overflowY: 'auto',
          animation: 'scaleIn .12s ease both',
        }}>
          {loading ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : (
            <>
              {isFiltered && (
                <div style={{ padding: '8px 14px 6px', fontSize: 10.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--gray3)' }}>
                  Sacados que já operaram com este cedente
                </div>
              )}
              {filtered.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--gray2)' }}>
                  {query ? 'Nenhum sacado encontrado.' : 'Nenhum sacado cadastrado.'}
                </div>
              ) : filtered.map(s => (
                <div key={s.id} onClick={() => select(s)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', gap: 10 }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.razao_social ?? '-'}</p>
                    {s.cnpj_cpf && <p style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 1 }}>{formatCNPJ(s.cnpj_cpf)}</p>}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Solicitação search dropdown ────────────────────────────────────────────────
interface SolicitacaoItem {
  id: string;
  created_at: string;
  nome_contratado: string | null;
  cnpj_contratado: string | null;
  nome_sacado: string | null;
  cnpj_sacado: string | null;
  valor: string | null;
  valor_numerico: number | null;
  prazo_limite: string | null;
  cedente_id: string | null;
  cedente_nome: string | null;
  cedente_cnpj: string | null;
  cedente_email: string | null;
  cedente_email_responsavel: string | null;
  cedente_conta_escrow: string | null;
  sacado_id_db: string | null;
  sacado_razao_social: string | null;
  sacado_cnpj_db: string | null;
  parcelas: string | null;
}

function SolicitacaoSearch({ token, value, onChange }: {
  token: string;
  value: SolicitacaoItem | null;
  onChange: (s: SolicitacaoItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SolicitacaoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const { onSessionExpired } = useAuth();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!inputRef.current?.closest('[data-sol-search]')?.contains(e.target as Node)
        && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/admin-data?action=list_solicitacoes_for_aceite', { headers: { 'x-admin-session': token } })
      .then(r => { if (r.status === 401) { onSessionExpired(); throw new Error('401'); } return r.json(); })
      .then(d => setOptions(d.solicitacoes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, token]);

  const filtered = query.trim()
    ? options.filter(o => {
        const q = query.toLowerCase();
        return (
          (o.cedente_nome ?? o.nome_contratado ?? '').toLowerCase().includes(q) ||
          (o.sacado_razao_social ?? o.nome_sacado ?? '').toLowerCase().includes(q) ||
          (o.cedente_cnpj ?? o.cnpj_contratado ?? '').includes(query.replace(/\D/g, '')) ||
          (o.id ?? '').includes(query)
        );
      })
    : options;

  function select(s: SolicitacaoItem) { onChange(s); setOpen(false); setQuery(''); }
  function clear() { onChange(null); setQuery(''); }

  return (
    <div data-sol-search="" style={{ position: 'relative' }}>
      {value ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 11px', borderRadius: 'var(--radius-sm)',
          border: '1.5px solid var(--yellow)', background: 'var(--white)',
          boxShadow: '0 0 0 3px var(--yd)', minHeight: 38,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {value.cedente_nome ?? value.nome_contratado ?? '-'} → {value.sacado_razao_social ?? value.nome_sacado ?? '-'}
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: 0 }}>
              {value.valor ?? '-'} · Venc. {value.prazo_limite ? formatDate(value.prazo_limite) : '-'}
            </p>
          </div>
          <button type="button" onClick={clear} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Buscar por cedente, sacado ou ID…"
            style={{ ...inputStyle, paddingLeft: 32 }}
          />
        </div>
      )}

      {open && !value && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed',
          top: (inputRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: inputRef.current?.getBoundingClientRect().left ?? 0,
          width: Math.max(inputRef.current?.getBoundingClientRect().width ?? 320, 420),
          zIndex: 99999,
          background: 'var(--white)',
          border: '1.5px solid var(--gray3)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          maxHeight: 300,
          overflowY: 'auto',
          animation: 'scaleIn .12s ease both',
        }}>
          {loading ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: 13, color: 'var(--gray2)' }}>
              {query ? 'Nenhuma solicitação encontrada.' : 'Nenhuma solicitação cadastrada.'}
            </div>
          ) : filtered.map(s => (
            <div key={s.id} onClick={() => select(s)}
              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray3)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.cedente_nome ?? s.nome_contratado ?? '-'}
                </p>
                <span style={{ fontSize: 11, color: 'var(--gray2)', flexShrink: 0 }}>{s.valor ?? '-'}</span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Sacado: {s.sacado_razao_social ?? s.nome_sacado ?? '-'} · Venc. {s.prazo_limite ? formatDate(s.prazo_limite) : '-'}
              </p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

// ── File preview modal (for File objects / blob URLs) ─────────────────────────
function FilePreviewModal({ file, onClose }: { file: File; onClose: () => void }) {
  const isImg = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function download() {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = file.name;
    a.click();
  }

  return createPortal(
    <div className="file-preview-backdrop" onClick={onClose}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">{file.name}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="file-preview-action" onClick={download}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 15V3M7 10l5 5 5-5M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Baixar
            </button>
            <button className="file-preview-close" onClick={onClose}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="file-preview-body">
          {!blobUrl && <div className="file-preview-spinner" />}
          {blobUrl && isImg && <img src={blobUrl} alt={file.name} className="file-preview-img" />}
          {blobUrl && isPdf && <iframe src={blobUrl} className="file-preview-iframe" title={file.name} />}
          {blobUrl && !isImg && !isPdf && (
            <div className="file-preview-unsupported">
              <p>Visualização não disponível para este formato.</p>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={download}>Baixar arquivo</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

function fileIcon(tipo: string) {
  if (tipo === 'application/pdf') return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/><polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function ReadOnlyInfo({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</p>
      <p style={{ fontSize: 13, color: 'var(--black)', fontWeight: 500 }}>{value || '-'}</p>
    </div>
  );
}

type EmailEntry = { address: string; label: string; checked: boolean };
type EmailStep = { op: Operacao; emails: EmailEntry[] };
type SendResultEntry = { address: string; label: string; status: 'sending' | 'success' | 'error'; error?: string };

function CreateModal({ token, onClose, onCreate }: { token: string; onClose: () => void; onCreate: (op: Operacao) => void }) {
  const [tipo, setTipo] = useState<TipoOperacao>('ACEITE_SACADO');
  const [solicitacao, setSolicitacao] = useState<SolicitacaoItem | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dropHover, setDropHover] = useState(false);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep | null>(null);
  const [ccInput, setCcInput] = useState('');
  const [novoEmail, setNovoEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResultEntry[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  async function handleSelectSolicitacao(s: SolicitacaoItem | null) {
    setSolicitacao(s);
    setPendingFiles([]);
    if (!s) return;
    setLoadingFiles(true);
    try {
      const res = await fetch(`/api/admin-data?action=get_solicitacao_files&id=${encodeURIComponent(s.id)}`, {
        headers: { 'x-admin-session': token },
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('[get_solicitacao_files] erro:', res.status, data);
        toast('error', 'Erro ao carregar documentos', data?.error ?? `Status ${res.status}`);
      } else {
        const arquivos: Array<{ nome: string; tipo: string; categoria?: string | null; base64: string }> = data.arquivos ?? [];
        const files = arquivos.map(a => {
          const raw = a.base64.includes(',') ? a.base64.split(',')[1] : a.base64;
          const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
          const file = new File([bytes], a.nome, { type: a.tipo || 'application/octet-stream' });
          (file as any)._categoria = a.categoria ?? null;
          return file;
        });
        setPendingFiles(files);
      }
    } catch (err) {
      console.error('[get_solicitacao_files] falha na requisição:', err);
      toast('error', 'Erro ao carregar documentos da solicitação');
    } finally {
      setLoadingFiles(false);
    }
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const valid: File[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(f.type)) { toast('error', 'Tipo não suportado', `${f.name} - use PDF, JPG ou PNG`); continue; }
      if (f.size > MAX_FILE_SIZE) { toast('error', 'Arquivo muito grande', `${f.name} - máximo 5 MB`); continue; }
      if (pendingFiles.some(p => p.name === f.name && p.size === f.size)) continue;
      valid.push(f);
    }
    setPendingFiles(prev => [...prev, ...valid]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!solicitacao) { toast('error', 'Selecione uma solicitação'); return; }
    const nomeCedente   = solicitacao.cedente_nome   ?? solicitacao.nome_contratado ?? '';
    const cnpjCedente   = (solicitacao.cedente_cnpj  ?? solicitacao.cnpj_contratado ?? '').replace(/\D/g, '');
    const emailCedente             = solicitacao.cedente_email              ?? '';
    const emailCedenteResponsavel  = solicitacao.cedente_email_responsavel  ?? '';
    const nomeSacado    = solicitacao.sacado_razao_social ?? solicitacao.nome_sacado ?? '';
    const cnpjSacado    = (solicitacao.sacado_cnpj_db ?? solicitacao.cnpj_sacado ?? '').replace(/\D/g, '');
    const contaEscrow   = solicitacao.cedente_conta_escrow;
    const parcelasRaw: Array<{ valor: string; valorNumerico: number; vencimento: string }> | null = (() => {
      try { return solicitacao.parcelas ? JSON.parse(String(solicitacao.parcelas)) : null; } catch { return null; }
    })();
    setUploading(true);
    let op: Operacao;
    try {
      op = await createOperacaoApi(token, solicitacao.id, {
        tipo,
        nomeCedente, cnpjCedente, emailCedente, emailCedenteResponsavel, nomeSacado, cnpjSacado,
        ...(parcelasRaw && parcelasRaw.length > 1
          ? { parcelas: parcelasRaw, valorNF: parcelasRaw.reduce((s, p) => s + p.valorNumerico, 0) }
          : {
              ...(solicitacao.valor_numerico != null ? { valorNF: solicitacao.valor_numerico } : {}),
              ...(solicitacao.prazo_limite   ? { vencimento: solicitacao.prazo_limite }        : {}),
            }),
        ...(tipo === 'ACEITE_SACADO' && contaEscrow ? {
          bancoNome: 'QI SOCIEDADE DE CRÉDITO DIRETO S.A. - 329',
          titularConta: nomeCedente,
          cnpjTitular: cnpjCedente,
          agencia: '0001',
          conta: contaEscrow,
        } : {}),
      });
    } catch {
      toast('error', 'Erro ao criar operação');
      setUploading(false);
      return;
    }
    for (const f of pendingFiles) {
      try { await addAnexoApi(token, op.id, f); }
      catch { toast('error', 'Erro ao salvar anexo', f.name); }
    }
    setUploading(false);

    const emails: EmailEntry[] = [];
    const seen = new Set<string>();

    function parseEmails(raw: string | null | undefined, label: string) {
      if (!raw?.trim()) return;
      let list: string[] = [];
      const t = raw.trim();
      if (t.startsWith('[')) {
        try { list = JSON.parse(t).filter((s: unknown) => typeof s === 'string'); } catch { list = [t]; }
      } else {
        list = [t];
      }
      list.forEach((addr, i) => {
        const a = addr.trim();
        if (!a || seen.has(a)) return;
        seen.add(a);
        const lbl = list.length > 1 ? `${label} ${i + 1}` : label;
        emails.push({ address: a, label: lbl, checked: true });
      });
    }

    parseEmails(solicitacao.cedente_email_responsavel, 'E-mail responsável');

    // Mostra o passo de e-mail mesmo sem endereços cadastrados - o operador pode
    // adicionar destinatários manualmente ou optar por "Não enviar".
    setNovoEmail('');
    setEmailStep({ op, emails });
  }

  function parseCcEmails(raw: string): string[] {
    return raw.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@'));
  }

  async function handleSendEmail() {
    if (!emailStep) return;
    const selected = emailStep.emails.filter(e => e.checked);
    if (selected.length === 0) { handleSkipEmail(); return; }

    const cc = parseCcEmails(ccInput);

    setSending(true);
    setSendResults(selected.map(e => ({ address: e.address, label: e.label, status: 'sending' as const })));

    const results = await Promise.allSettled(
      selected.map(async (e) => {
        const res = await fetch('/api/admin-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
          body: JSON.stringify({
            action: 'send_aceite_email',
            to: [e.address],
            ...(cc.length > 0 && { cc }),
            link: emailStep.op.link,
            cedente_nome: emailStep.op.nomeCedente,
            sacado_nome: emailStep.op.nomeSacado,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.detail?.message ?? err?.error ?? 'Erro ao enviar');
        }
        return e;
      })
    );

    const now = new Date().toISOString();
    const finalResults: SendResultEntry[] = selected.map((e, i) => {
      const r = results[i];
      if (r.status === 'fulfilled') return { address: e.address, label: e.label, status: 'success' as const };
      return { address: e.address, label: e.label, status: 'error' as const, error: (r.reason as Error)?.message ?? 'Erro desconhecido' };
    });
    setSendResults(finalResults);
    setSending(false);

    addEmailHistoryApi(token, emailStep.op.id, finalResults.map(r => ({
      address: r.address, label: r.label, sentAt: now,
      success: r.status === 'success', error: r.error,
    } as EmailHistoryEntry)));
  }

  function handleSkipEmail() {
    if (!emailStep) return;
    onCreate(emailStep.op);
    toast('success', 'Operação criada', 'Link gerado com sucesso');
  }

  function toggleAllEmails(checked: boolean) {
    setEmailStep(prev => prev ? { ...prev, emails: prev.emails.map(e => ({ ...e, checked })) } : prev);
  }

  function toggleEmail(address: string) {
    setEmailStep(prev => prev ? { ...prev, emails: prev.emails.map(e => e.address === address ? { ...e, checked: !e.checked } : e) } : prev);
  }

  function addEmailManual() {
    const addr = novoEmail.trim().toLowerCase();
    if (!addr) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) { toast('error', 'E-mail inválido'); return; }
    setEmailStep(prev => {
      if (!prev) return prev;
      if (prev.emails.some(e => e.address.toLowerCase() === addr)) {
        // já existe → apenas garante marcado
        return { ...prev, emails: prev.emails.map(e => e.address.toLowerCase() === addr ? { ...e, checked: true } : e) };
      }
      return { ...prev, emails: [...prev.emails, { address: addr, label: 'Adicionado', checked: true }] };
    });
    setNovoEmail('');
  }

  function removeEmail(address: string) {
    setEmailStep(prev => prev ? { ...prev, emails: prev.emails.filter(e => e.address !== address) } : prev);
  }

  const cedNome  = solicitacao ? (solicitacao.cedente_nome  ?? solicitacao.nome_contratado ?? '-') : null;
  const cedCnpj  = solicitacao ? formatCNPJ(solicitacao.cedente_cnpj  ?? solicitacao.cnpj_contratado  ?? '') : null;
  const sacNome  = solicitacao ? (solicitacao.sacado_razao_social ?? solicitacao.nome_sacado ?? '-') : null;
  const sacCnpj  = solicitacao ? formatCNPJ(solicitacao.sacado_cnpj_db ?? solicitacao.cnpj_sacado ?? '') : null;

  const tipoLabel = tipo === 'ACEITE_SACADO' ? 'Aceite do Sacado' : 'Termo de Anuência';

  return (
    <Modal onClose={onClose} width={560}>
      <ModalHeader title={`Nova Operação - ${tipoLabel}`} onClose={onClose} />
      <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Tipo de operação */}
        <div style={{ display: 'flex', gap: 8 }}>
          {(['ACEITE_SACADO', 'TERMO_ANUENCIA'] as TipoOperacao[]).map(t => {
            const active = tipo === t;
            const label = t === 'ACEITE_SACADO' ? 'Aceite do Sacado' : 'Termo de Anuência';
            const icon  = t === 'ACEITE_SACADO'
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
            return (
              <button key={t} type="button" onClick={() => { setTipo(t); setSolicitacao(null); }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  padding: '10px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  border: active ? '2px solid var(--yellow)' : '1.5px solid var(--gray3)',
                  background: active ? 'rgba(169,224,62,0.07)' : 'var(--white)',
                  color: active ? 'var(--black)' : 'var(--gray)' }}>
                {icon}{label}
              </button>
            );
          })}
        </div>

        {/* Solicitação */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionTitle>Solicitação</SectionTitle>
          <SolicitacaoSearch token={token} value={solicitacao} onChange={handleSelectSolicitacao} />
          {!solicitacao && (
            <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: 0 }}>
              Selecione a solicitação para gerar o {tipoLabel.toLowerCase()}.
            </p>
          )}
        </div>

        {/* Dados da solicitação - somente leitura */}
        {solicitacao && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
            background: 'var(--bg)', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
            <ReadOnlyInfo label="Cedente" value={cedNome!} />
            <ReadOnlyInfo label="CNPJ Cedente" value={cedCnpj!} />
            <ReadOnlyInfo label="Sacado" value={sacNome!} />
            <ReadOnlyInfo label="CNPJ Sacado" value={sacCnpj!} />
          </div>
        )}

        {/* Documentos */}
        {solicitacao && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionTitle>Documentos para o Sacado</SectionTitle>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
            style={{ display: 'none' }} onChange={e => addFiles(e.target.files)} />

          <div
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={() => setDropHover(true)}
            onMouseLeave={() => setDropHover(false)}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
            style={{
              border: `2px dashed ${dragOver || dropHover ? 'var(--yellow)' : 'var(--gray3)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '20px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver || dropHover ? 'var(--yd)' : 'var(--bg)',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: dragOver || dropHover ? 'var(--yellow)' : 'var(--gray2)', margin: '0 auto 8px', display: 'block', transition: 'color 0.15s' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 600, color: dropHover || dragOver ? 'var(--black)' : 'var(--gray)', marginBottom: 2, transition: 'color 0.15s' }}>
              Clique ou arraste arquivos aqui
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>PDF, JPG ou PNG · máx. 5 MB por arquivo</p>
          </div>

          {loadingFiles && (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          )}
          {!loadingFiles && pendingFiles.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhum documento nesta solicitação. Adicione manualmente se necessário.</p>
          )}
          {!loadingFiles && pendingFiles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--gray3)', background: 'var(--white)',
                }}>
                  <span style={{ color: 'var(--gray2)', flexShrink: 0 }}>{fileIcon(f.type)}</span>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  {(f as any)._categoria && <CategoriaTag categoria={(f as any)._categoria} size="xs" />}
                  <span style={{ fontSize: 11.5, color: 'var(--gray2)', flexShrink: 0 }}>{formatBytes(f.size)}</span>
                  <button type="button" title="Visualizar" onClick={() => setPreviewFile(f)}
                    className="file-eye-btn" style={{ flexShrink: 0 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                    </svg>
                  </button>
                  <button type="button" onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                    style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray2)', flexShrink: 0 }}>
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>}
      </form>

      {/* ── Email step (sobrepõe o footer quando ativo) ── */}
      {emailStep && (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--white)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)', margin: 0 }}>Enviar link por e-mail</p>
              <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: 0 }}>
                {sendResults
                  ? sendResults.every(r => r.status === 'sending') ? 'Enviando…'
                    : `${sendResults.filter(r => r.status === 'success').length} de ${sendResults.length} enviado(s)`
                  : 'Operação criada · escolha os destinatários'}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(30,138,62,0.09)', padding: '4px 10px', borderRadius: 99 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: '#15803D' }}>Link gerado</span>
            </div>
          </div>

          {/* Body - seleção ou resultados */}
          <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {!sendResults ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--gray)', margin: 0 }}>
                  Selecione os destinatários do cedente <strong style={{ color: 'var(--black)' }}>{emailStep.op.nomeCedente}</strong> - você pode adicionar outros representantes abaixo.
                </p>
                {emailStep.emails.length > 1 && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => toggleAllEmails(true)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--black)' }}>Marcar tudo</button>
                    <button type="button" onClick={() => toggleAllEmails(false)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--black)' }}>Desmarcar tudo</button>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Com cópia (CC)</label>
                  <textarea
                    value={ccInput}
                    onChange={e => setCcInput(e.target.value)}
                    placeholder={'financeiro@wearedux.com\njuridico@wearedux.com'}
                    rows={2}
                    style={{ fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--bg)', resize: 'vertical', fontFamily: 'inherit', color: 'var(--black)', outline: 'none' }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--gray2)', margin: 0 }}>Separe múltiplos e-mails por vírgula ou quebra de linha.</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Destinatários</label>
                  {emailStep.emails.length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--gray2)', margin: 0 }}>Nenhum e-mail cadastrado - adicione um destinatário abaixo.</p>
                  )}
                  {emailStep.emails.map(e => (
                    <label key={e.address} onClick={() => toggleEmail(e.address)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                        border: `1.5px solid ${e.checked ? 'var(--yellow)' : 'var(--gray3)'}`,
                        background: e.checked ? 'var(--yd)' : 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${e.checked ? 'var(--yellow)' : 'var(--gray3)'}`, background: e.checked ? 'var(--yellow)' : 'var(--white)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                        {e.checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="var(--on-yellow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{e.label}</p>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.address}</p>
                      </div>
                      <button type="button" title="Remover destinatário"
                        onClick={ev => { ev.preventDefault(); ev.stopPropagation(); removeEmail(e.address); }}
                        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </button>
                    </label>
                  ))}
                  {/* Adicionar destinatário manualmente */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <input
                      type="email"
                      value={novoEmail}
                      onChange={ev => setNovoEmail(ev.target.value)}
                      onKeyDown={ev => { if (ev.key === 'Enter') { ev.preventDefault(); addEmailManual(); } }}
                      placeholder="adicionar e-mail do representante…"
                      style={{ flex: 1, fontSize: 13, padding: '9px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--bg)', fontFamily: 'inherit', color: 'var(--black)', outline: 'none' }}
                    />
                    <button type="button" onClick={addEmailManual} disabled={!novoEmail.trim()}
                      className="btn" style={{ padding: '0 14px', height: 38, fontSize: 13, flexShrink: 0 }}>
                      + Adicionar
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sendResults.map(r => (
                  <div key={r.address} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                    border: `1.5px solid ${r.status === 'success' ? 'rgba(30,138,62,0.3)' : r.status === 'error' ? 'rgba(217,48,37,0.3)' : 'var(--gray3)'}`,
                    background: r.status === 'success' ? 'rgba(30,138,62,0.06)' : r.status === 'error' ? 'rgba(217,48,37,0.06)' : 'var(--bg)' }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: r.status === 'success' ? 'rgba(30,138,62,0.12)' : r.status === 'error' ? 'rgba(217,48,37,0.12)' : 'var(--gray3)' }}>
                      {r.status === 'sending' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#999" strokeWidth="2" strokeLinecap="round"/></svg>}
                      {r.status === 'success' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      {r.status === 'error' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0,
                        color: r.status === 'success' ? '#15803D' : r.status === 'error' ? '#B91C1C' : 'var(--gray2)' }}>{r.label}</p>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address}</p>
                      {r.status === 'error' && r.error && <p style={{ fontSize: 11, color: '#B91C1C', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            {!sendResults ? (
              <>
                <button type="button" onClick={handleSkipEmail} className="btn" style={{ padding: '0 16px', height: 36 }}>Não enviar</button>
                <button type="button" onClick={handleSendEmail}
                  disabled={sending || emailStep.emails.every(e => !e.checked)}
                  className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13 }}>
                  Enviar{emailStep.emails.filter(e => e.checked).length > 1 ? ` (${emailStep.emails.filter(e => e.checked).length})` : ''} <IconArrowRight size={13} />
                </button>
              </>
            ) : sendResults.every(r => r.status === 'sending') ? (
              <button disabled className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13, opacity: 0.6 }}><IconSpinner size={13} /> Enviando…</button>
            ) : (
              <button type="button" onClick={() => { onCreate(emailStep.op); }}
                className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13 }}>
                Fechar <IconArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
        <button type="button" onClick={onClose} className="btn" style={{ padding: '0 16px', height: 36 }}>Cancelar</button>
        <button className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13 }}
          disabled={uploading || !solicitacao}
          onClick={e => { e.preventDefault(); const form2 = document.querySelector('form'); form2?.requestSubmit(); }}>
          {uploading ? <><IconSpinner size={13} /> Salvando…</> : <>Criar operação <IconArrowRight size={13} /></>}
        </button>
      </div>
      {previewFile && <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />}
    </Modal>
  );
}

// ── Detail Modal ───────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--black)', fontWeight: 500 }}>{value || '-'}</span>
    </div>
  );
}

function AnexosList({ operacaoId, token }: { operacaoId: string; token: string }) {
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    getAnexosByOperacaoApi(token, operacaoId).then(setAnexos).catch(() => {});
  }, [operacaoId, token]);

  async function handleAdd(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      if (!ALLOWED_TYPES.includes(f.type)) { toast('error', 'Tipo não suportado', f.name); continue; }
      if (f.size > MAX_FILE_SIZE) { toast('error', 'Arquivo muito grande', f.name); continue; }
      try {
        const a = await addAnexoApi(token, operacaoId, f);
        setAnexos(prev => [...prev, a]);
      } catch { toast('error', 'Erro ao salvar', f.name); }
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteAnexoApi(token, id);
      setAnexos(prev => prev.filter(a => a.id !== id));
    } catch { toast('error', 'Erro ao remover anexo'); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp"
        style={{ display: 'none' }} onChange={e => handleAdd(e.target.files)} />
      {anexos.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--gray2)' }}>Nenhum documento anexado.</p>
      )}
      {anexos.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--gray3)', background: 'var(--bg)' }}>
          <span style={{ color: 'var(--gray2)', flexShrink: 0 }}>{fileIcon(a.tipo)}</span>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
          <span style={{ fontSize: 11.5, color: 'var(--gray2)', flexShrink: 0 }}>{formatBytes(a.tamanho)}</span>
          <a href={a.dataUrl} download={a.nome} style={{ flexShrink: 0, color: 'var(--gray2)', display: 'flex' }} title="Baixar">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </a>
          <button type="button" onClick={() => handleRemove(a.id)}
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray2)', flexShrink: 0 }}>
            <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
      ))}
      <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
        + Adicionar documento
      </button>
    </div>
  );
}

type ModalBtnVariant = 'default' | 'danger' | 'primary' | 'success';

function ModalActionBtn({ onClick, variant = 'default', children }: {
  onClick: () => void;
  variant?: ModalBtnVariant;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);

  const cfg: Record<ModalBtnVariant, { base: React.CSSProperties; hover: React.CSSProperties }> = {
    default: {
      base:  { background: 'var(--white)', color: 'var(--black)',  border: '1.5px solid var(--gray3)' },
      hover: { background: 'var(--bg)',    color: 'var(--black)',  border: '1.5px solid var(--gray2)' },
    },
    danger: {
      base:  { background: 'var(--white)',          color: '#B91C1C', border: '1.5px solid rgba(217,48,37,0.3)' },
      hover: { background: 'rgba(217,48,37,0.06)',  color: '#B91C1C', border: '1.5px solid rgba(217,48,37,0.5)' },
    },
    primary: {
      base:  { background: 'var(--yellow)', color: 'var(--on-yellow)', border: '1.5px solid var(--yellow)' },
      hover: { background: '#8BB833',       color: 'var(--on-yellow)', border: '1.5px solid #8BB833' },
    },
    success: {
      base:  { background: 'rgba(30,138,62,0.1)',  color: '#15803D', border: '1.5px solid rgba(30,138,62,0.25)' },
      hover: { background: 'rgba(30,138,62,0.16)', color: '#15803D', border: '1.5px solid rgba(30,138,62,0.4)' },
    },
  };

  const style = hovered ? cfg[variant].hover : cfg[variant].base;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...style,
        height: 36, padding: '0 16px', borderRadius: 100,
        fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        transition: 'background 0.15s, border-color 0.15s, color 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}

// ── Email Modal ────────────────────────────────────────────────────────────────
function EmailModal({ op, token, onClose, onSent }: { op: Operacao; token: string; onClose: () => void; onSent: () => void }) {
  const seen = new Set<string>();
  const initial: EmailEntry[] = [];
  function parseAndAdd(raw: string | undefined, label: string) {
    if (!raw?.trim()) return;
    const t = raw.trim();
    let list: string[] = [];
    if (t.startsWith('[')) { try { list = JSON.parse(t).filter((s: unknown) => typeof s === 'string'); } catch { list = [t]; } }
    else { list = [t]; }
    list.forEach((addr, i) => {
      const a = addr.trim();
      if (!a || seen.has(a)) return;
      seen.add(a);
      initial.push({ address: a, label: list.length > 1 ? `${label} ${i + 1}` : label, checked: true });
    });
  }
  parseAndAdd(op.emailCedenteResponsavel, 'E-mail responsável');
  (op.emailHistory ?? []).forEach(h => {
    if (!seen.has(h.address)) { seen.add(h.address); initial.push({ address: h.address, label: h.label, checked: true }); }
  });

  const [emails, setEmails] = useState<EmailEntry[]>(initial);
  const [ccInput, setCcInput] = useState('');
  const [sendResults, setSendResults] = useState<SendResultEntry[] | null>(null);

  function toggle(addr: string) { setEmails(prev => prev.map(e => e.address === addr ? { ...e, checked: !e.checked } : e)); }
  function toggleAll(v: boolean) { setEmails(prev => prev.map(e => ({ ...e, checked: v }))); }

  function parseCc(raw: string): string[] {
    return raw.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.includes('@'));
  }

  async function handleSend() {
    const selected = emails.filter(e => e.checked);
    if (!selected.length) return;
    const cc = parseCc(ccInput);
    setSendResults(selected.map(e => ({ address: e.address, label: e.label, status: 'sending' as const })));
    const results = await Promise.allSettled(selected.map(async (e) => {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'send_aceite_email', to: [e.address], ...(cc.length > 0 && { cc }), link: op.link, cedente_nome: op.nomeCedente, sacado_nome: op.nomeSacado }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.detail?.message ?? err?.error ?? 'Erro ao enviar'); }
      return e;
    }));
    const now = new Date().toISOString();
    const final: SendResultEntry[] = selected.map((e, i) => {
      const r = results[i];
      return r.status === 'fulfilled'
        ? { address: e.address, label: e.label, status: 'success' as const }
        : { address: e.address, label: e.label, status: 'error' as const, error: (r.reason as Error)?.message ?? 'Erro' };
    });
    setSendResults(final);
    addEmailHistoryApi(token, op.id, final.map(r => ({ address: r.address, label: r.label, sentAt: now, success: r.status === 'success', error: r.error } as EmailHistoryEntry)));
    onSent();
  }

  const allDone = sendResults !== null && sendResults.every(r => r.status !== 'sending');
  const sending = sendResults !== null && sendResults.some(r => r.status === 'sending');

  return (
    <Modal onClose={onClose} width={480}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)', margin: 0 }}>Enviar link por e-mail</p>
          <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: 0 }}>
            {!sendResults ? `Cedente: ${op.nomeCedente}`
              : sending ? 'Enviando…'
              : `${sendResults.filter(r => r.status === 'success').length} de ${sendResults.length} enviado(s)`}
          </p>
        </div>
        <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
        </button>
      </div>

      <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!sendResults ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Com cópia (CC)</label>
              <textarea
                value={ccInput}
                onChange={e => setCcInput(e.target.value)}
                placeholder={'financeiro@wearedux.com\njuridico@wearedux.com'}
                rows={2}
                style={{ fontSize: 13, padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)', background: 'var(--bg)', resize: 'vertical', fontFamily: 'inherit', color: 'var(--black)', outline: 'none' }}
              />
              <p style={{ fontSize: 11, color: 'var(--gray2)', margin: 0 }}>Separe múltiplos e-mails por vírgula ou quebra de linha.</p>
            </div>
            {emails.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--gray2)', margin: 0 }}>Nenhum e-mail encontrado para este cedente.</p>
              : <>
                  {emails.length > 1 && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => toggleAll(true)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--black)' }}>Marcar tudo</button>
                      <button type="button" onClick={() => toggleAll(false)} style={{ fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 6, border: '1.5px solid var(--gray3)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--black)' }}>Desmarcar tudo</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {emails.map(e => (
                      <label key={e.address} onClick={() => toggle(e.address)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                          border: `1.5px solid ${e.checked ? 'var(--yellow)' : 'var(--gray3)'}`,
                          background: e.checked ? 'var(--yd)' : 'var(--bg)', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}>
                        <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${e.checked ? 'var(--yellow)' : 'var(--gray3)'}`, background: e.checked ? 'var(--yellow)' : 'var(--white)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {e.checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="var(--on-yellow)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>{e.label}</p>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.address}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
            }
            {/* Histórico anterior */}
            {(op.emailHistory ?? []).length > 0 && (
              <div style={{ borderTop: '1px solid var(--gray3)', paddingTop: 12 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Histórico de envios</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[...(op.emailHistory ?? [])].reverse().map((h, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, background: h.success ? 'rgba(30,138,62,0.06)' : 'rgba(217,48,37,0.06)', border: `1px solid ${h.success ? 'rgba(30,138,62,0.2)' : 'rgba(217,48,37,0.2)'}` }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: h.success ? 'rgba(30,138,62,0.12)' : 'rgba(217,48,37,0.12)' }}>
                        {h.success ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          : <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round"/></svg>}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.address}</p>
                        {h.error && <p style={{ fontSize: 11, color: '#B91C1C', margin: 0 }}>{h.error}</p>}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--gray2)', flexShrink: 0 }}>{new Date(h.sentAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sendResults.map(r => (
              <div key={r.address} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 'var(--radius-md)',
                border: `1.5px solid ${r.status === 'success' ? 'rgba(30,138,62,0.3)' : r.status === 'error' ? 'rgba(217,48,37,0.3)' : 'var(--gray3)'}`,
                background: r.status === 'success' ? 'rgba(30,138,62,0.06)' : r.status === 'error' ? 'rgba(217,48,37,0.06)' : 'var(--bg)' }}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: r.status === 'success' ? 'rgba(30,138,62,0.12)' : r.status === 'error' ? 'rgba(217,48,37,0.12)' : 'var(--gray3)' }}>
                  {r.status === 'sending' && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite' }}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#999" strokeWidth="2" strokeLinecap="round"/></svg>}
                  {r.status === 'success' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#15803D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  {r.status === 'error' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="#B91C1C" strokeWidth="2.5" strokeLinecap="round"/></svg>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, color: r.status === 'success' ? '#15803D' : r.status === 'error' ? '#B91C1C' : 'var(--gray2)' }}>{r.label}</p>
                  <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address}</p>
                  {r.error && <p style={{ fontSize: 11, color: '#B91C1C', margin: '2px 0 0' }}>{r.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '16px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
        {!sendResults ? (
          <>
            <button type="button" onClick={onClose} className="btn" style={{ padding: '0 16px', height: 36 }}>Cancelar</button>
            <button type="button" onClick={handleSend} disabled={emails.every(e => !e.checked)} className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13 }}>
              Enviar{emails.filter(e => e.checked).length > 1 ? ` (${emails.filter(e => e.checked).length})` : ''} <IconArrowRight size={13} />
            </button>
          </>
        ) : !allDone ? (
          <button disabled className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13, opacity: 0.6 }}><IconSpinner size={13} /> Enviando…</button>
        ) : (
          <>
            <button type="button" onClick={() => setSendResults(null)} className="btn" style={{ padding: '0 16px', height: 36 }}>Tentar novamente</button>
            <button type="button" onClick={onClose} className="btn btn-primary" style={{ padding: '0 20px', height: 36, fontSize: 13 }}>Fechar <IconArrowRight size={13} /></button>
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Detail Modal ────────────────────────────────────────────────────────────────
function DetailModal({ op, token, onClose, onUpdate, onDelete }: { op: Operacao; token: string; onClose: () => void; onUpdate: () => void; onDelete: () => void }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(op.link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast('success', 'Link copiado!');
  }

  async function handleReenviar() {
    try {
      await reenviarApi(token, op.id);
      onUpdate();
      toast('success', 'Link renovado', 'Nova expiração em 7 dias');
    } catch { toast('error', 'Erro ao renovar link'); }
  }

  async function handleCancelar() {
    try {
      await updateStatusApi(token, op.id, 'RECUSADO');
      onUpdate();
      toast('info', 'Operação cancelada');
      onClose();
    } catch { toast('error', 'Erro ao cancelar'); }
  }

  async function handleDelete() {
    try {
      await deleteOperacaoApi(token, op.id);
      toast('success', 'Operação excluída');
      onDelete();
      onClose();
    } catch { toast('error', 'Erro ao excluir'); }
  }

  return (
    <Modal onClose={onClose} width={600}>
      {/* Custom header with email icon */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--gray3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--black)', margin: 0 }}>Detalhes da Operação</p>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
            background: op.tipo === 'TERMO_ANUENCIA' ? 'rgba(99,102,241,0.1)' : 'rgba(169,224,62,0.12)',
            color: op.tipo === 'TERMO_ANUENCIA' ? '#4F46E5' : '#B45309' }}>
            {op.tipo === 'TERMO_ANUENCIA' ? 'Termo de Anuência' : 'Aceite do Sacado'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setShowEmailModal(true)}
            title="Enviar por e-mail"
            style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}
            onMouseEnter={e => { const b = e.currentTarget; b.style.color = 'var(--black)'; b.style.background = 'var(--gray3)'; }}
            onMouseLeave={e => { const b = e.currentTarget; b.style.color = 'var(--gray)'; b.style.background = 'var(--bg)'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M2 8l10 7 10-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Status + protocolo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusBadge status={op.status} />
          <span style={{ fontSize: 11.5, color: 'var(--gray2)' }}>Criado em {formatDate(op.criadoEm.slice(0,10))}</span>
        </div>

        {/* Link */}
        {op.status !== 'ACEITO' && op.status !== 'RECUSADO' && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-sm)', padding: '10px 12px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--gray)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.link}</span>
            <button onClick={copyLink} style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
              border: 'none', background: copied ? 'var(--green)' : 'var(--yellow)', color: copied ? '#fff' : 'var(--on-yellow)', cursor: 'pointer' }}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionTitle>Cedente</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <InfoRow label="Razão Social" value={op.nomeCedente} />
            <InfoRow label="CNPJ" value={formatCNPJ(op.cnpjCedente)} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionTitle>{op.tipo === 'TERMO_ANUENCIA' ? 'Anuente' : 'Sacado'}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <InfoRow label="Razão Social" value={op.nomeSacado} />
            <InfoRow label="CNPJ" value={op.cnpjSacado ? formatCNPJ(op.cnpjSacado) : '-'} />
          </div>
        </div>

        {op.tipo !== 'TERMO_ANUENCIA' && op.bancoNome && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SectionTitle>Conta Bancária (Escrow)</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <InfoRow label="Banco" value={op.bancoNome ?? ''} />
              <InfoRow label="Agência" value={op.agencia ?? ''} />
              <InfoRow label="Conta" value={op.conta && op.conta.length > 1 ? `${op.conta.slice(0, -1)}-${op.conta.slice(-1)}` : (op.conta ?? '')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InfoRow label="Titularidade" value={op.titularConta ?? ''} />
              <InfoRow label="CNPJ" value={op.cnpjTitular ? formatCNPJ(op.cnpjTitular) : ''} />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SectionTitle>Documentos</SectionTitle>
          <AnexosList operacaoId={op.id} token={token} />
        </div>

        {op.aceitante && (
          <div style={{ background: 'rgba(30,138,62,0.06)', border: '1px solid rgba(30,138,62,0.2)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Aceite Confirmado</p>
              <button
                onClick={() => downloadComprovante(op)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#15803D',
                  background: 'rgba(30,138,62,0.12)', border: '1px solid rgba(30,138,62,0.25)', borderRadius: 7,
                  padding: '5px 11px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(30,138,62,0.2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(30,138,62,0.12)')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Baixar comprovante
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <InfoRow label="Signatário" value={op.aceitante.nome} />
              <InfoRow label="CPF" value={op.aceitante.cpf} />
              <InfoRow label="Cargo" value={op.aceitante.cargo} />
              <InfoRow label="Protocolo" value={op.aceitante.protocolo} />
              <InfoRow label="Aceito em" value={new Date(op.aceitante.aceitoEm).toLocaleString('pt-BR')} />
              {op.aceitante.d4signDocUUID && <InfoRow label="D4Sign UUID" value={op.aceitante.d4signDocUUID} />}
            </div>
            {(op.aceitante.assinaturaDataUrl || op.aceitante.fotoIdentidadeDataUrl) && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(30,138,62,0.2)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {op.aceitante.assinaturaDataUrl && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Assinatura</p>
                    <img
                      src={op.aceitante.assinaturaDataUrl}
                      alt="Assinatura do sacado"
                      style={{ maxWidth: 220, border: '1px solid rgba(30,138,62,0.2)', borderRadius: 8, background: '#fff', display: 'block' }}
                    />
                  </div>
                )}
                {op.aceitante.fotoIdentidadeDataUrl && (
                  <div>
                    <p style={{ fontSize: 10.5, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Foto com Documento</p>
                    <img
                      src={op.aceitante.fotoIdentidadeDataUrl}
                      alt="Foto com identidade"
                      style={{ maxWidth: 220, border: '1px solid rgba(30,138,62,0.2)', borderRadius: 8, display: 'block', objectFit: 'cover' }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
        <button
          onClick={() => setConfirmDelete(true)}
          title="Excluir operação"
          style={{ marginRight: 'auto', width: 30, height: 30, borderRadius: 7, border: 'none',
            background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray2)' }}
          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#DC2626'; b.style.background = 'rgba(220,38,38,0.08)'; }}
          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.color = 'var(--gray2)'; b.style.background = 'none'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {op.status === 'PENDENTE' && (
          <ModalActionBtn onClick={handleCancelar} variant="danger">Cancelar operação</ModalActionBtn>
        )}
        {(op.status === 'PENDENTE' || op.status === 'EXPIRADO') && (
          <ModalActionBtn onClick={handleReenviar} variant="default">Renovar link</ModalActionBtn>
        )}
        {op.status !== 'ACEITO' && op.status !== 'RECUSADO' && (
          <ModalActionBtn onClick={() => window.open(op.link, '_blank')} variant="primary">
            Abrir link
          </ModalActionBtn>
        )}
        {op.status === 'RECUSADO' && (
          <ModalActionBtn onClick={handleReenviar} variant="success">Reativar operação</ModalActionBtn>
        )}
      </div>

      {showEmailModal && <EmailModal op={op} token={token} onClose={() => setShowEmailModal(false)} onSent={onUpdate} />}

      {confirmDelete && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--white)', borderRadius: 14, padding: '28px 28px 22px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--black)', marginBottom: 8 }}>Excluir operação?</p>
            <p style={{ fontSize: 13, color: '#666', lineHeight: 1.5, marginBottom: 22 }}>
              Esta ação é permanente e não pode ser desfeita. A operação de <strong>{op.nomeCedente}</strong> será removida da base.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ fontSize: 13, fontWeight: 600, padding: '7px 16px', borderRadius: 7,
                  border: '1.5px solid var(--gray3)', background: 'transparent', color: 'var(--black)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                style={{ fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 7,
                  border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer' }}
              >
                Sim, excluir
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Modal>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AceiteSacadoPage({ token }: { token: string }) {
  const [ops, setOps] = useState<Operacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterTipo, setFilterTipo] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<Operacao | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await getOperacoesApi(token);
      setOps(data);
    } catch { /* keep empty on error */ }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = ops.filter(op => {
    if (filterStatus.length > 0 && !filterStatus.includes(op.status)) return false;
    if (filterTipo.length > 0) {
      const t = op.tipo ?? 'ACEITE_SACADO';
      if (!filterTipo.includes(t)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return op.nomeCedente.toLowerCase().includes(q) || op.nomeSacado.toLowerCase().includes(q);
    }
    return true;
  });

  const counts = {
    total: ops.length,
    pendente: ops.filter(o => o.status === 'PENDENTE').length,
    aceito: ops.filter(o => o.status === 'ACEITO').length,
    recusado: ops.filter(o => o.status === 'RECUSADO' || o.status === 'EXPIRADO').length,
  };

  return (
    <div className="admin-content-wrap">
      {/* Header */}
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Aceites & Anuências</h1>
          <p className="admin-page-desc">Gerencie confirmações de aceite do sacado e termos de anuência</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}>
          + Nova operação
        </button>
      </div>

      {/* Stats */}
      <div className="admin-stats">
        <StatCard label="Total de operações"   desc="criadas no sistema"        value={counts.total}    accent="var(--yellow)" />
        <StatCard label="Pendentes"             desc="aguardando resposta"       value={counts.pendente} accent="#F59E0B" />
        <StatCard label="Aceitas"               desc="confirmadas pelo sacado"   value={counts.aceito}   accent="#22C55E" />
        <StatCard label="Recusadas / Expiradas" desc="não prosseguiram"          value={counts.recusado} accent="#EF4444" />
      </div>

      {/* Toolbar */}
      <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filtrar</span>
        <div style={{ position: 'relative' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cedente ou sacado…"
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7,
              fontSize: 13, border: '1.5px solid var(--gray3)', borderRadius: 7,
              outline: 'none', background: 'var(--white)', color: 'var(--black)',
              width: 220, fontFamily: 'inherit',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--yellow)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--gray3)')}
          />
        </div>
        <FilterDropdown
          label="Status"
          values={filterStatus}
          onChange={setFilterStatus}
          options={[
            { value: 'PENDENTE', label: 'Pendente' },
            { value: 'ACEITO',   label: 'Aceito' },
            { value: 'RECUSADO', label: 'Recusado' },
            { value: 'EXPIRADO', label: 'Expirado' },
          ]}
        />
        <FilterDropdown
          label="Tipo"
          values={filterTipo}
          onChange={setFilterTipo}
          options={[
            { value: 'ACEITE_SACADO',  label: 'Aceite do Sacado' },
            { value: 'TERMO_ANUENCIA', label: 'Termo de Anuência' },
          ]}
        />
        <div className="admin-toolbar-spacer" />
      </div>

      {/* Table */}
      <div className="admin-table-wrap">
        {loading ? (
          <div className="admin-empty" style={{ padding: '56px 0' }}>
            <div style={{ width: 26, height: 26, border: '3px solid var(--gray3)', borderTopColor: 'var(--yellow)', borderRadius: '50%', animation: 'spin .7s linear infinite', margin: '0 auto' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="admin-empty">
            <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--yd)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <svg width="27" height="27" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="4" width="14" height="17" rx="2.5" stroke="var(--yellow)" strokeWidth="1.7" />
                <path d="M9 4.2a1.6 1.6 0 011.6-1.6h2.8A1.6 1.6 0 0115 4.2v.6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-.6z" fill="var(--yellow)" />
                <path d="M8.6 12.4l2.2 2.2 4.6-4.6" stroke="var(--yellow)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p>{ops.length === 0 ? 'Nenhuma operação criada ainda.' : 'Nenhuma operação encontrada.'}</p>
            {ops.length === 0 && (
              <button onClick={() => setShowCreate(true)} className="btn btn-primary btn-sm" style={{ marginTop: 14 }}>
                Criar primeira operação
              </button>
            )}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                {['Cedente', 'Sacado', 'Tipo', 'Status', 'Criado em'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(op => (
                <TableRow key={op.id} op={op} onClick={() => setDetail(op)} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateModal token={token} onClose={() => setShowCreate(false)} onCreate={op => { load(); setDetail(op); setShowCreate(false); }} />
      )}
      {detail && (
        <DetailModal op={ops.find(o => o.id === detail.id) ?? detail} token={token} onClose={() => setDetail(null)} onUpdate={load} onDelete={() => { load(); setDetail(null); }} />
      )}
    </div>
  );
}

function TableRow({ op, onClick }: { op: Operacao; onClick: () => void }) {
  return (
    <tr onClick={onClick}>
      <td>
        <p style={{ fontWeight: 600 }}>{op.nomeCedente}</p>
        <p className="admin-cell-sub" style={{ fontSize: 11.5 }}>{formatCNPJ(op.cnpjCedente)}</p>
      </td>
      <td>
        <p>{op.nomeSacado}</p>
        {op.cnpjSacado && <p className="admin-cell-sub" style={{ fontSize: 11.5 }}>{formatCNPJ(op.cnpjSacado)}</p>}
      </td>
      <td>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99, whiteSpace: 'nowrap',
          background: op.tipo === 'TERMO_ANUENCIA' ? 'rgba(99,102,241,0.1)' : 'rgba(169,224,62,0.12)',
          color: op.tipo === 'TERMO_ANUENCIA' ? '#4F46E5' : '#B45309' }}>
          {op.tipo === 'TERMO_ANUENCIA' ? 'Anuência' : 'Aceite'}
        </span>
      </td>
      <td><StatusBadge status={op.status} /></td>
      <td style={{ fontSize: 12, color: 'var(--gray2)', whiteSpace: 'nowrap' }}>{formatDate(op.criadoEm.slice(0,10))}</td>
    </tr>
  );
}
