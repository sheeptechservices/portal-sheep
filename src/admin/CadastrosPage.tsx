import { useState, useEffect, useRef, useCallback, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToast, useAuth } from './AdminApp';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { Abas, AbaPainel } from '../components/Abas';
import { IconDoc, IconZip, IconImage, IconCheck, IconSpinner, IconExternal } from '../components/icons';

function useApi(token: string) {
  const { onSessionExpired } = useAuth();
  return useCallback(async function call(path: string, method = 'GET', body?: any) {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddressJSON {
  logradouro: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}
const EMPTY_ADDRESS: AddressJSON = { logradouro: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' };

function parseAddress(s: string | null): AddressJSON {
  if (!s) return { ...EMPTY_ADDRESS };
  try { return { ...EMPTY_ADDRESS, ...JSON.parse(s) }; } catch { return { ...EMPTY_ADDRESS }; }
}

function getCidadeEstado(jsonStr: string | null): string {
  const a = parseAddress(jsonStr);
  return [a.cidade, a.estado].filter(Boolean).join(' - ');
}

interface Cedente {
  id: string;
  nome: string;
  cnpj_cpf: string | null;
  razao_social: string | null;
  status: string | null;
  flags: string | null;
  origem: string | null;
  segmento: string | null;
  sub_segmento: string | null;
  origem_comercial: string | null;
  canal_aquisicao: string | null;
  parceiro: number;
  natureza_juridica: string | null;
  valores_em_aberto: number | null;
  limite_operacao: number | null;
  rating: number | null;
  obs: string | null;
  email: string | null;
  endereco_pj: string | null;
  nome_responsavel: string | null;
  email_responsavel: string | null;
  endereco_responsavel: string | null;
  cpf_responsavel: string | null;
  possui_escrow: number;
  wpp_contato: string | null;
  conta_escrow: string | null;
  link_drive: string | null;
  criado_em: string;
}

type CedenteForm = Omit<Cedente, 'id' | 'criado_em' | 'endereco_pj' | 'endereco_responsavel' | 'link_drive'> & {
  endereco_pj: AddressJSON;
  endereco_responsavel: AddressJSON;
  link_drive: string;
};

interface CedenteOptions {
  segmentos: string[];
  sub_segmentos: string[];
  origens_comerciais: string[];
  canais_aquisicao: string[];
}

const EMPTY_FORM: CedenteForm = {
  nome: '', cnpj_cpf: '', razao_social: '', status: 'Ativo', flags: 'Regular',
  origem: '', segmento: '', sub_segmento: '', origem_comercial: '', canal_aquisicao: '',
  parceiro: 0, natureza_juridica: '', valores_em_aberto: null,
  limite_operacao: null, rating: null, obs: '', email: '',
  endereco_pj: { ...EMPTY_ADDRESS },
  nome_responsavel: '', email_responsavel: '',
  endereco_responsavel: { ...EMPTY_ADDRESS }, cpf_responsavel: '',
  possui_escrow: 0, wpp_contato: '', conta_escrow: '', link_drive: '',
};

// ── Constants ─────────────────────────────────────────────────────────────────

const NATUREZA_JURIDICA = [
  '8885 - Microempreendedor Individual (MEI)',
  '2135 - Empresário Individual',
  '2216 - EIRELI',
  '2062 - Sociedade Limitada (Ltda)',
  '2046 - Sociedade Anônima Aberta (S/A)',
  '2054 - Sociedade Anônima Fechada (S/A)',
  '5010 - Sociedade Simples Pura',
  '5029 - Sociedade Simples Limitada',
  '2143 - Cooperativa',
  '4090 - Associação Privada',
  '3069 - Fundação Privada',
  '2127 - Sociedade em Conta de Participação (SCP)',
  '2070 - Sociedade em Nome Coletivo',
  '2089 - Sociedade em Comandita Simples',
  '2097 - Sociedade em Comandita por Ações',
  '2011 - Empresa Pública',
  '2038 - Sociedade de Economia Mista',
  '4014 - Serviço Social Autônomo',
  '4111 - Organização Religiosa',
];

const STATUS_OPTIONS = ['Ativo', 'Parado', 'Banido'];
const FLAGS_OPTIONS = ['Regular', 'Com pendências', 'Inadimplente'];
const ORIGEM_OPTIONS = ['Prematch', 'App', 'Cashforce', 'DUX'];

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  'Ativo':   { bg: 'rgba(22,163,74,.13)',  color: '#15803D' },
  'Parado':  { bg: 'rgba(217,119,6,.13)',  color: '#B45309' },
  'Banido':  { bg: 'rgba(217,48,37,.13)',  color: '#D93025' },
};
const FLAGS_STYLE: Record<string, { bg: string; color: string }> = {
  'Regular':        { bg: 'rgba(22,163,74,.13)',  color: '#15803D' },
  'Com pendências': { bg: 'rgba(217,119,6,.13)',  color: '#B45309' },
  'Inadimplente':   { bg: 'rgba(217,48,37,.13)',  color: '#D93025' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let sum = 0, p = n - 7;
    for (let i = n; i >= 1; i--) { sum += +d[n - i] * p--; if (p < 2) p = 9; }
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return calc(12) === +d[12] && calc(13) === +d[13];
}

function matchNaturezaJuridica(raw: string | undefined): string {
  if (!raw) return '';
  const t = raw.trim();
  // Código numérico de 4 dígitos exatos (retornado pelo CNPJ.ws como object.id)
  if (/^\d{4}$/.test(t)) {
    return NATUREZA_JURIDICA.find(n => n.startsWith(t + ' - ')) ?? '';
  }
  // BrasilAPI retorna no formato "XXX-X Descrição" → extrai código 4 dígitos
  const brasilApiCode = t.match(/^(\d{3}-\d)\s/);
  if (brasilApiCode) {
    const code = brasilApiCode[1].replace('-', '');
    const found = NATUREZA_JURIDICA.find(n => n.startsWith(code + ' - '));
    if (found) return found;
  }
  // Descrição textual (ReceitaWS / fallback): busca opção que contenha o texto ou vice-versa
  const normalized = t.toLowerCase();
  return NATUREZA_JURIDICA.find(n => {
    const desc = n.split(' - ').slice(1).join(' - ').toLowerCase();
    return desc.includes(normalized) || normalized.includes(desc);
  }) ?? '';
}

async function buscarCNPJ(cnpj: string, token: string): Promise<{ razao_social?: string; endereco?: AddressJSON; natureza_juridica?: string } | null> {
  const digits = cnpj.replace(/\D/g, '');
  try {
    // A consulta sai da nossa infraestrutura e custa: o endpoint exige sessão.
    const res = await fetch(`/api/cnpj-lookup?cnpj=${digits}`, {
      headers: { 'x-admin-session': token },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const endereco: AddressJSON = {
      logradouro: data.logradouro ?? '',
      complemento: data.complemento ?? '',
      bairro: data.bairro ?? '',
      cidade: data.municipio ?? '',
      estado: data.uf ?? '',
      cep: (data.cep ?? '').replace(/\D/g, ''),
    };
    return { razao_social: data.razao_social, endereco, natureza_juridica: matchNaturezaJuridica(data.natureza_juridica) };
  } catch { return null; }
}

async function buscarCEP(cep: string): Promise<Partial<AddressJSON> | null> {
  const d = cep.replace(/\D/g, '');
  if (d.length !== 8) return null;
  // BrasilAPI
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v2/${d}`);
    if (r.ok) {
      const data = await r.json();
      if (!data.errors) {
        return { logradouro: data.street ?? '', bairro: data.neighborhood ?? '', cidade: data.city ?? '', estado: data.state ?? '', cep: d };
      }
    }
  } catch {}
  // ViaCEP fallback
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
    if (r.ok) {
      const data = await r.json();
      if (!data.erro) {
        return { logradouro: data.logradouro ?? '', bairro: data.bairro ?? '', cidade: data.localidade ?? '', estado: data.uf ?? '', cep: d };
      }
    }
  } catch {}
  return null;
}

// ── Sub-Components ────────────────────────────────────────────────────────────

function Badge({ value, styleMap }: { value: string | null; styleMap: Record<string, { bg: string; color: string }> }) {
  if (!value) return <span style={{ color: 'var(--gray2)' }}>-</span>;
  const s = styleMap[value];
  const style = s ? { background: s.bg, color: s.color } : { background: 'var(--bg)', color: 'var(--gray)' };
  return <span className="admin-badge" style={style}>{value}</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray2)', marginBottom: 14, marginTop: 0 }}>
      {children}
    </p>
  );
}

function FormRow({ children, full }: { children: ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      {children}
    </div>
  );
}

function FLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="form-label">
      {children}{required && <span style={{ color: '#D93025' }}> *</span>}
    </label>
  );
}

function InfoTooltip({ text }: { text: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: string } | null>(null);
  const tipW = 260;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onMouseEnter={() => {
          const rect = btnRef.current?.getBoundingClientRect();
          if (!rect) return;
          const rawLeft = rect.left + rect.width / 2 - tipW / 2;
          const clampedLeft = Math.min(Math.max(8, rawLeft), window.innerWidth - tipW - 8);
          setPos({ top: rect.top - 8, left: clampedLeft, arrowLeft: `${rect.left + rect.width / 2 - clampedLeft}px` });
        }}
        onMouseLeave={() => setPos(null)}
        style={{ width: 15, height: 15, borderRadius: '50%', background: 'var(--gray3)', color: 'var(--gray)', fontSize: 10,
          fontWeight: 700, border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'default', flexShrink: 0, padding: 0, lineHeight: 1 }}
      >?</button>
      {pos && createPortal(
        <span className="tooltip-box" role="tooltip"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: tipW, transform: 'translateY(-100%)', '--arrow-left': pos.arrowLeft, zIndex: 2000 } as CSSProperties}>
          {text}
        </span>,
        document.body
      )}
    </>
  );
}

function FInput({ value, onChange, placeholder, type = 'text', disabled, style }: {
  value: string | number | null; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean; style?: CSSProperties;
}) {
  return (
    <input
      className="form-input"
      type={type}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={style}
    />
  );
}

// ── Masks ─────────────────────────────────────────────────────────────────────

function maskCNPJCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11)
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10)
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

function maskCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCEP(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

// ── Email list helpers ────────────────────────────────────────────────────────

function parseEmails(raw: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(e => typeof e === 'string' && e.trim());
  } catch {}
  // backwards compat: plain single email or comma-separated
  return raw.split(',').map(e => e.trim()).filter(Boolean);
}

function serializeEmails(emails: string[]): string | null {
  const clean = emails.filter(e => e.trim());
  if (clean.length === 0) return null;
  if (clean.length === 1) return clean[0];
  return JSON.stringify(clean);
}

// ── Currency ──────────────────────────────────────────────────────────────────

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CurrencyInput({ value, onChange, placeholder }: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
}) {
  const [display, setDisplay] = useState(() =>
    value != null ? formatBRL(Math.round(value * 100)) : ''
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '');
    if (digits === '') { setDisplay(''); onChange(null); return; }
    const cents = parseInt(digits, 10);
    setDisplay(formatBRL(cents));
    onChange(cents / 100);
  }

  function handleBlur() {
    if (value != null) setDisplay(formatBRL(Math.round(value * 100)));
  }

  return (
    <input
      className="form-input"
      value={display}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder ?? 'R$ 0,00'}
      inputMode="numeric"
    />
  );
}

function FSelect({ value, onChange, options, placeholder, disabled, className }: {
  value: string | null; onChange: (v: string) => void;
  options: string[]; placeholder?: string; disabled?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    if (disabled) return;
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  const hasValue = value !== null && value !== '';
  const btnLabel = hasValue ? value! : (placeholder ?? 'Selecionar…');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`filter-dropdown-btn fselect-trigger${hasValue ? ' active' : ''}${disabled ? ' disabled' : ''}${className ? ` ${className}` : ''}`}
        onClick={openDropdown}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{btnLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {hasValue && (
            <div className="filter-dropdown-clear" onClick={() => { onChange(''); setOpen(false); }}>
              Limpar seleção
            </div>
          )}
          {options.map(o => (
            <div
              key={o}
              className={`filter-dropdown-option${value === o ? ' active' : ''}`}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function FMultiSelect({ values, onChange, options, placeholder, className }: {
  values: string[]; onChange: (v: string[]) => void;
  options: string[]; placeholder?: string; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  function toggle(o: string) {
    onChange(values.includes(o) ? values.filter(v => v !== o) : [...values, o]);
  }

  const hasValue = values.length > 0;
  const btnLabel = values.length === 0
    ? (placeholder ?? 'Selecionar…')
    : values.length === 1
    ? values[0]
    : `${placeholder ?? 'Seleção'} (${values.length})`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`filter-dropdown-btn fselect-trigger${hasValue ? ' active' : ''}${className ? ` ${className}` : ''}`}
        onClick={openDropdown}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{btnLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {hasValue && (
            <div className="filter-dropdown-clear" onClick={() => onChange([])}>
              Limpar seleção
            </div>
          )}
          {options.map(o => {
            const checked = values.includes(o);
            return (
              <div
                key={o}
                className={`filter-dropdown-option${checked ? ' active' : ''}`}
                onClick={() => toggle(o)}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{
                  display: 'inline-flex', flexShrink: 0, width: 14, height: 14, borderRadius: 3,
                  border: checked ? 'none' : '1.5px solid var(--gray3)',
                  background: checked ? 'var(--black)' : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </span>
                {o}
              </div>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

function FTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string | null; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  return (
    <textarea
      className="form-input"
      style={{ resize: 'vertical', minHeight: rows * 24 }}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      rows={rows}
    />
  );
}

function EmailListInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const emails = parseEmails(value);

  const isValidDraft = draft.trim().length > 0 && draft.includes('@') && draft.includes('.');
  const isDuplicate  = emails.includes(draft.trim().toLowerCase());

  function add() {
    const email = draft.trim().toLowerCase();
    if (!email || !isValidDraft || isDuplicate) return;
    onChange(serializeEmails([...emails, email]));
    setDraft('');
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function remove(idx: number) {
    onChange(serializeEmails(emails.filter((_, i) => i !== idx)));
  }

  return (
    <div>
      {emails.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {emails.map((email, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 8px 3px 10px', borderRadius: 99,
              background: 'var(--bg)', border: '1px solid var(--gray3)',
              fontSize: 12.5, color: 'var(--black)', fontWeight: 500,
            }}>
              {email}
              <button
                type="button"
                onClick={() => remove(i)}
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', padding: 0, display: 'flex', lineHeight: 1, flexShrink: 0 }}
                title="Remover e-mail"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          ref={inputRef}
          className="form-input"
          type="email"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={emails.length === 0 ? 'contato@empresa.com.br' : 'Inserir outro e-mail…'}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn"
          onClick={add}
          disabled={!isValidDraft || isDuplicate}
          style={{ padding: '0 12px', flexShrink: 0, fontSize: 12.5 }}
        >
          Salvar
        </button>
      </div>
      {isDuplicate && <p style={{ fontSize: 11, color: '#D93025', marginTop: 4 }}>E-mail já adicionado.</p>}
      {emails.length === 0 && <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 4 }}>Nenhum e-mail cadastrado.</p>}
    </div>
  );
}

function CreatableField({ value, onChange, options, onAdd, placeholder }: {
  value: string | null;
  onChange: (v: string) => void;
  options: string[];
  onAdd: (nome: string) => Promise<void>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newVal, setNewVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setAdding(false);
    setNewVal('');
    setOpen(o => !o);
  }

  useDropdownDismiss(open, [triggerRef, dropRef], () => setOpen(false));

  useEffect(() => { if (adding && open) inputRef.current?.focus(); }, [adding, open]);

  async function doAdd() {
    if (!newVal.trim() || saving) return;
    setSaving(true);
    try {
      await onAdd(newVal.trim());
      onChange(newVal.trim());
      setOpen(false);
      setAdding(false);
      setNewVal('');
    } finally {
      setSaving(false);
    }
  }

  const hasValue = value !== null && value !== '';
  const btnLabel = hasValue ? value! : (placeholder ?? 'Selecionar…');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`filter-dropdown-btn fselect-trigger${hasValue ? ' active' : ''}`}
        onClick={openDropdown}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>{btnLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
          {hasValue && (
            <div className="filter-dropdown-clear" onClick={() => { onChange(''); setOpen(false); }}>
              Limpar seleção
            </div>
          )}
          {options.map(o => (
            <div
              key={o}
              className={`filter-dropdown-option${value === o ? ' active' : ''}`}
              onClick={() => { onChange(o); setOpen(false); }}
            >
              {o}
            </div>
          ))}
          {adding ? (
            <div style={{ padding: '6px 8px', borderTop: '1px solid var(--gray3)', marginTop: 4 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={inputRef}
                  className="form-input"
                  style={{ flex: 1, height: 30, fontSize: 12, padding: '0 8px' }}
                  placeholder="Nome…"
                  value={newVal}
                  onChange={e => setNewVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
                    if (e.key === 'Escape') { setAdding(false); setNewVal(''); }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '0 10px', height: 30, fontSize: 12, flexShrink: 0 }}
                  onClick={doAdd}
                  disabled={saving || !newVal.trim()}
                >
                  {saving ? '…' : 'OK'}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="filter-dropdown-option creatable-add-row"
              onClick={() => setAdding(true)}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ marginRight: 6, flexShrink: 0 }}>
                <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              Adicionar novo…
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function CepHelper({ label, onFill }: { label: string; onFill: (addr: Partial<AddressJSON>) => void }) {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);

  async function lookup() {
    const d = cep.replace(/\D/g, '');
    if (d.length !== 8) return;
    setLoading(true); setErr(false);
    try {
      const result = await buscarCEP(d);
      if (result) { onFill(result); setCep(''); }
      else setErr(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
      <input
        className="form-input"
        style={{ maxWidth: 130, fontSize: 12 }}
        placeholder="CEP (preencher)"
        value={cep}
        onChange={e => { setCep(maskCEP(e.target.value)); setErr(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }}
        maxLength={9}
      />
      <button
        type="button"
        className="btn"
        style={{ padding: '0 10px', fontSize: 12, flexShrink: 0 }}
        onClick={lookup}
        disabled={loading || cep.replace(/\D/g,'').length !== 8}
      >
        {loading ? '…' : `Preencher ${label}`}
      </button>
      {err && <span style={{ fontSize: 11, color: '#D93025', alignSelf: 'center' }}>CEP não encontrado</span>}
    </div>
  );
}

function AddressBlock({ value, onChange, cepLabel }: {
  value: AddressJSON;
  onChange: (addr: AddressJSON) => void;
  cepLabel: string;
}) {
  function set(key: keyof AddressJSON, v: string) { onChange({ ...value, [key]: v }); }
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <FLabel>Logradouro</FLabel>
          <FInput value={value.logradouro} onChange={v => set('logradouro', v)} placeholder="Rua, avenida, número…" />
        </div>
        <div>
          <FLabel>Complemento</FLabel>
          <FInput value={value.complemento} onChange={v => set('complemento', v)} placeholder="Sala, andar…" />
        </div>
        <div>
          <FLabel>Bairro</FLabel>
          <FInput value={value.bairro} onChange={v => set('bairro', v)} placeholder="Bairro" />
        </div>
        <div>
          <FLabel>Cidade</FLabel>
          <FInput value={value.cidade} onChange={v => set('cidade', v)} placeholder="São Paulo" />
        </div>
        <div>
          <FLabel>Estado</FLabel>
          <FInput value={value.estado} onChange={v => set('estado', v)} placeholder="SP" />
        </div>
        <div>
          <FLabel>CEP</FLabel>
          <FInput value={maskCEP(value.cep)} onChange={v => set('cep', v.replace(/\D/g, '').slice(0, 8))} placeholder="00000-000" />
        </div>
      </div>
      <CepHelper label={cepLabel} onFill={addr => onChange({ ...value, ...addr })} />
    </>
  );
}

// ── Cedente Documentos ────────────────────────────────────────────────────────

interface CedenteArquivo {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
  criado_em: string;
}

type CedentePreviewState = { nome: string; tipo: string; base64: string | null };

function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function CedenteFilePreviewModal({ state, onClose, onDownload }: {
  state: CedentePreviewState;
  onClose: () => void;
  onDownload: () => void;
}) {
  const loading = state.base64 === null;
  const ext = state.nome.split('.').pop()?.toLowerCase() ?? '';
  const isImg = state.tipo.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
  const isPdf = state.tipo === 'application/pdf' || ext === 'pdf';
  const dataUrl = state.base64
    ? (state.base64.startsWith('data:') ? state.base64 : `data:${state.tipo};base64,${state.base64}`)
    : '';
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

function CedenteDocumentos({ cedenteId, token }: { cedenteId: string; token: string }) {
  const [arquivos, setArquivos] = useState<CedenteArquivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [localNames, setLocalNames] = useState<Record<number, string>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmNome, setDeleteConfirmNome] = useState('');
  const [previewState, setPreviewState] = useState<CedentePreviewState | null>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const apiPost = useCallback(async (body: any) => {
    const res = await fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(body),
    });
    return res.json();
  }, [token]);

  const apiGet = useCallback(async (params: string) => {
    const res = await fetch(`/api/admin-data?${params}`, { headers: { 'x-admin-session': token } });
    return res.json();
  }, [token]);

  async function load() {
    setLoading(true);
    try {
      const data = await apiGet(`action=list_cedente_arquivos&cedente_id=${cedenteId}`);
      setArquivos(data.arquivos ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [cedenteId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Limite: 10 MB.'); return; }
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await apiPost({ action: 'upload_cedente_arquivo', cedente_id: cedenteId, nome: file.name, tipo: file.type, tamanho: file.size, base64 });
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile(id: number, nome: string, tipo: string) {
    const displayName = localNames[id] ?? nome;
    const data = await apiGet(`action=get_cedente_arquivo_base64&id=${id}`);
    if (data.base64) {
      const a = document.createElement('a');
      a.href = data.base64.startsWith('data:') ? data.base64 : `data:${tipo};base64,${data.base64}`;
      a.download = displayName;
      a.click();
    }
  }

  async function openPreview(f: CedenteArquivo) {
    const displayName = localNames[f.id] ?? f.nome;
    setPreviewState({ nome: displayName, tipo: f.tipo, base64: null });
    const data = await apiGet(`action=get_cedente_arquivo_base64&id=${f.id}`);
    setPreviewState({ nome: displayName, tipo: f.tipo, base64: data.base64 });
  }

  function startEdit(f: CedenteArquivo) {
    setEditingId(f.id);
    setEditValue(localNames[f.id] ?? f.nome);
    setTimeout(() => editRef.current?.select(), 0);
  }

  async function commitEdit(id: number, originalNome: string) {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== (localNames[id] ?? originalNome)) {
      setLocalNames(prev => ({ ...prev, [id]: trimmed }));
      await apiPost({ action: 'rename_cedente_arquivo', id, nome: trimmed });
    }
    setEditingId(null);
  }

  async function confirmDelete() {
    if (!deleteConfirmId) return;
    await apiPost({ action: 'delete_cedente_arquivo', id: deleteConfirmId });
    setArquivos(prev => prev.filter(a => a.id !== deleteConfirmId));
    setDeleteConfirmId(null);
  }

  const canPreview = (tipo: string, nome: string) => {
    if (tipo.startsWith('image/') || tipo === 'application/pdf') return true;
    const ext = nome.split('.').pop()?.toLowerCase() ?? '';
    return ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className="admin-section-title" style={{ marginBottom: 0 }}>
          Documentos
          {arquivos.length > 0 && (
            <span style={{ marginLeft: 6, fontSize: 10, background: 'var(--gray3)', color: 'var(--gray)', padding: '1px 6px', borderRadius: 99, fontWeight: 700 }}>
              {arquivos.length}
            </span>
          )}
        </p>
        <label className="detail-attach-btn" title="Inserir documento" style={{ cursor: uploading ? 'wait' : 'pointer', opacity: uploading ? 0.5 : 1 }}>
          <input type="file" style={{ display: 'none' }} onChange={handleUpload} disabled={uploading} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66L9.64 17.2a2 2 0 01-2.83-2.83l8.49-8.48" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </label>
      </div>

      {loading && <div className="dux-spinner-row" style={{ padding: '8px 0' }}><span className="dux-spinner sm" /></div>}
      {!loading && arquivos.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, textAlign: 'center', padding: '8px 0' }}>Nenhum documento anexado.</p>
      )}
      {!loading && arquivos.length > 0 && (
        <div className="admin-file-list">
          {arquivos.map(f => {
            const displayName = localNames[f.id] ?? f.nome;
            const isEditing = editingId === f.id;
            const isPdf = f.tipo === 'application/pdf';
            const isZip = f.tipo === 'application/zip' || f.nome?.endsWith('.zip');
            return (
              <div key={f.id} className="admin-file-item">
                <div className={`detail-file-icon ${isPdf ? 'pdf' : isZip ? 'zip' : 'img'}`}>
                  {isPdf ? <IconDoc size={15} /> : isZip ? <IconZip size={15} /> : <IconImage size={15} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <input
                      ref={editRef}
                      className="file-name-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => commitEdit(f.id, f.nome)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEdit(f.id, f.nome); }
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <p
                      className="decision-file-name editable"
                      title="Clique para renomear"
                      style={{ fontSize: 12, fontWeight: 600 }}
                      onClick={() => startEdit(f)}
                    >
                      {displayName}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 1 }}>{formatFileSize(f.tamanho)}</p>
                </div>
                <button className="file-eye-btn" title="Visualizar" onClick={() => openPreview(f)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  </svg>
                </button>
                <button className="admin-file-download" title="Baixar" onClick={() => downloadFile(f.id, f.nome, f.tipo)}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M12 3v13M7 11l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5 20h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </button>
                <button
                  className="file-delete-btn"
                  title="Excluir documento"
                  onClick={() => { setDeleteConfirmId(f.id); setDeleteConfirmNome(displayName); }}
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
          })}
        </div>
      )}

      {previewState && (
        <CedenteFilePreviewModal
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

      {deleteConfirmId !== null && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteConfirmId(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir documento</p>
            <p className="delete-confirm-desc">Tem certeza que deseja excluir "<strong>{deleteConfirmNome}</strong>"? Esta ação não pode ser desfeita.</p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteConfirmId(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={confirmDelete}>Excluir</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Cedente Panel (side panel form) ───────────────────────────────────────────

function CedentePanel({
  editing, form, setForm, options, onAddOption, onSave, onClose, saving, token,
}: {
  editing: Cedente | null;
  form: CedenteForm;
  setForm: (f: CedenteForm) => void;
  options: CedenteOptions;
  onAddOption: (list: string, nome: string) => Promise<void>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  token: string;
}) {
  const [cnpjStatus, setCnpjStatus] = useState<'idle'|'loading'|'ok'|'err'>('idle');
  const cnpjTimer = useRef<ReturnType<typeof setTimeout>>();

  function upd(key: keyof CedenteForm, val: any) {
    setForm({ ...form, [key]: val });
  }

  function handleCnpjChange(val: string) {
    const d = val.replace(/\D/g, '').slice(0, 14);
    upd('cnpj_cpf', d);
    clearTimeout(cnpjTimer.current);
    if (validarCNPJ(d)) {
      setCnpjStatus('loading');
      const snapshot = form;
      cnpjTimer.current = setTimeout(async () => {
        const result = await buscarCNPJ(d, token);
        if (result) {
          setCnpjStatus('ok');
          setForm({
            ...snapshot,
            cnpj_cpf: val,
            razao_social: result.razao_social ?? snapshot.razao_social,
            endereco_pj: result.endereco ?? snapshot.endereco_pj,
            natureza_juridica: result.natureza_juridica || snapshot.natureza_juridica,
          });
        } else {
          setCnpjStatus('err');
        }
      }, 600);
    } else {
      setCnpjStatus('idle');
    }
  }

  const sep = (
    <div style={{ borderTop: '1px solid var(--gray3)', marginTop: 24, paddingTop: 20 }} />
  );

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal"
        style={{ width: 'min(560px, 96vw)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="admin-modal-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: 'var(--black)' }}>
              {editing ? 'Editar Cedente' : 'Novo Cedente'}
            </p>
            {editing && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray2)' }}>
                #{editing.id.slice(0, 8)} · cadastrado {new Date(editing.criado_em).toLocaleDateString('pt-BR')}
              </p>
            )}
          </div>
          <button className="admin-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="admin-modal-body" style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>

          {/* ── IDENTIFICAÇÃO ─────────────────────────── */}
          <SectionTitle>Identificação</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow full>
              <FLabel required>Nome</FLabel>
              <FInput value={form.nome} onChange={v => upd('nome', v)} placeholder="Nome fantasia ou razão social" />
            </FormRow>
            <FormRow>
              <FLabel>CNPJ / CPF</FLabel>
              <div style={{ position: 'relative' }}>
                <FInput
                  value={maskCNPJCPF(form.cnpj_cpf ?? '')}
                  onChange={handleCnpjChange}
                  placeholder="00.000.000/0001-00"
                  style={{ paddingRight: cnpjStatus !== 'idle' ? 36 : undefined }}
                />
                {cnpjStatus === 'loading' && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray2)', display: 'inline-flex' }}><IconSpinner size={14} /></span>
                )}
                {cnpjStatus === 'ok' && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#15803D', display: 'inline-flex' }}><IconCheck size={14} /></span>
                )}
                {cnpjStatus === 'err' && (
                  <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#D93025', fontSize: 12 }}>!</span>
                )}
              </div>
              {cnpjStatus === 'ok' && (
                <p style={{ fontSize: 11, color: '#15803D', marginTop: 4 }}>Dados preenchidos automaticamente</p>
              )}
              {cnpjStatus === 'err' && (
                <p style={{ fontSize: 11, color: '#D93025', marginTop: 4 }}>CNPJ não encontrado na Receita</p>
              )}
            </FormRow>
            <FormRow>
              <FLabel>Razão Social</FLabel>
              <FInput value={form.razao_social} onChange={v => upd('razao_social', v)} placeholder="Preenchida automaticamente via CNPJ" />
            </FormRow>
            <FormRow full>
              <FLabel>Natureza Jurídica</FLabel>
              <FSelect value={form.natureza_juridica} onChange={v => upd('natureza_juridica', v)} options={NATUREZA_JURIDICA} placeholder="Selecionar…" />
            </FormRow>
          </div>

          {sep}
          {/* ── STATUS & CLASSIFICAÇÃO ───────────────── */}
          <SectionTitle>Status & Classificação</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow>
              <FLabel>Status</FLabel>
              <FSelect value={form.status} onChange={v => upd('status', v)} options={STATUS_OPTIONS} />
            </FormRow>
            <FormRow>
              <FLabel>Flags</FLabel>
              <FSelect value={form.flags} onChange={v => upd('flags', v)} options={FLAGS_OPTIONS} />
            </FormRow>
            <FormRow>
              <FLabel>Rating (0 a 10)</FLabel>
              <FInput value={form.rating} onChange={v => upd('rating', v === '' ? null : Number(v))} type="number" placeholder="Ex: 8.5" />
            </FormRow>
            <FormRow>
              <FLabel>Segmento</FLabel>
              <CreatableField
                value={form.segmento}
                onChange={v => upd('segmento', v)}
                options={options.segmentos}
                onAdd={nome => onAddOption('segmentos', nome)}
                placeholder="Selecionar…"
              />
            </FormRow>
            <FormRow>
              <FLabel>Sub-Segmento</FLabel>
              <CreatableField
                value={form.sub_segmento}
                onChange={v => upd('sub_segmento', v)}
                options={options.sub_segmentos}
                onAdd={nome => onAddOption('sub_segmentos', nome)}
                placeholder="Selecionar…"
              />
            </FormRow>
          </div>

          {sep}
          {/* ── COMERCIAL ────────────────────────────── */}
          <SectionTitle>Comercial</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow>
              <FLabel>Origem</FLabel>
              <FSelect value={form.origem} onChange={v => upd('origem', v)} options={ORIGEM_OPTIONS} placeholder="Selecionar…" />
            </FormRow>
            <FormRow>
              <FLabel>Origem Comercial</FLabel>
              <CreatableField
                value={form.origem_comercial}
                onChange={v => upd('origem_comercial', v)}
                options={options.origens_comerciais}
                onAdd={nome => onAddOption('origens_comerciais', nome)}
                placeholder="Selecionar…"
              />
            </FormRow>
            <FormRow>
              <FLabel>Canal de Aquisição</FLabel>
              <CreatableField
                value={form.canal_aquisicao}
                onChange={v => upd('canal_aquisicao', v)}
                options={options.canais_aquisicao}
                onAdd={nome => onAddOption('canais_aquisicao', nome)}
                placeholder="Selecionar…"
              />
            </FormRow>
            <FormRow>
              <FLabel>Parceiro?</FLabel>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={!!form.parceiro}
                  onChange={e => upd('parceiro', e.target.checked ? 1 : 0)}
                />
                <span>É parceiro</span>
              </label>
            </FormRow>
          </div>

          {sep}
          {/* ── LOCALIZAÇÃO & CONTATO ─────────────────── */}
          <SectionTitle>Localização & Contato</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow full>
              <FLabel>E-mails</FLabel>
              <EmailListInput value={form.email} onChange={v => upd('email', v)} />
            </FormRow>
            <FormRow>
              <FLabel>WPP Contato</FLabel>
              <FInput value={maskPhone(form.wpp_contato ?? '')} onChange={v => upd('wpp_contato', v.replace(/\D/g, '').slice(0, 11))} placeholder="(11) 99999-9999" />
            </FormRow>
            <FormRow full>
              <FLabel>Endereço PJ</FLabel>
              <AddressBlock value={form.endereco_pj} onChange={v => upd('endereco_pj', v)} cepLabel="endereço PJ" />
            </FormRow>
          </div>

          {sep}
          {/* ── RESPONSÁVEL ──────────────────────────── */}
          <SectionTitle>Responsável</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow>
              <FLabel>Nome</FLabel>
              <FInput value={form.nome_responsavel} onChange={v => upd('nome_responsavel', v)} placeholder="Nome do responsável" />
            </FormRow>
            <FormRow>
              <FLabel>CPF</FLabel>
              <FInput value={maskCPF(form.cpf_responsavel ?? '')} onChange={v => upd('cpf_responsavel', v.replace(/\D/g, '').slice(0, 11))} placeholder="000.000.000-00" />
            </FormRow>
            <FormRow full>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FLabel>Email</FLabel>
                <InfoTooltip text="Este e-mail recebe notificações específicas da operação, como o link de aceite do sacado. Use aqui o contato direto do responsável - diferente dos e-mails gerais do cedente (financeiro, jurídico etc.)." />
              </div>
              <FInput value={form.email_responsavel} onChange={v => upd('email_responsavel', v)} placeholder="responsavel@empresa.com.br" type="email" />
            </FormRow>
            <FormRow full>
              <FLabel>Endereço</FLabel>
              <AddressBlock value={form.endereco_responsavel} onChange={v => upd('endereco_responsavel', v)} cepLabel="endereço responsável" />
            </FormRow>
          </div>

          {sep}
          {/* ── FINANCEIRO ───────────────────────────── */}
          <SectionTitle>Financeiro</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow full>
              <FLabel>Limite de Operação (R$)</FLabel>
              <CurrencyInput
                value={form.limite_operacao}
                onChange={v => upd('limite_operacao', v)}
                placeholder="R$ 0,00"
              />
            </FormRow>
          </div>

          {sep}
          {/* ── ESCROW ───────────────────────────────── */}
          <SectionTitle>Escrow</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <FormRow>
              <FLabel>Possui Conta Escrow?</FLabel>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  className="form-checkbox"
                  checked={!!form.possui_escrow}
                  onChange={e => upd('possui_escrow', e.target.checked ? 1 : 0)}
                />
                <span>Sim, possui escrow</span>
              </label>
            </FormRow>
            {!!form.possui_escrow && (
              <FormRow>
                <FLabel>Nº da Conta Escrow</FLabel>
                <FInput
                  value={form.conta_escrow && form.conta_escrow.length > 1 ? `${form.conta_escrow.slice(0, -1)}-${form.conta_escrow.slice(-1)}` : (form.conta_escrow ?? '')}
                  onChange={v => upd('conta_escrow', v.replace(/-/g, '').slice(0, 8))}
                  placeholder="0000000-0"
                />
              </FormRow>
            )}
          </div>

          {sep}
          {/* ── OBSERVAÇÕES ──────────────────────────── */}
          <SectionTitle>Observações</SectionTitle>
          <FTextarea value={form.obs} onChange={v => upd('obs', v)} placeholder="Notas internas…" rows={4} />

          {sep}
          {/* ── DOCUMENTAÇÃO ─────────────────────────── */}
          <SectionTitle>Documentação</SectionTitle>
          <div style={{ marginBottom: 16 }}>
            <FLabel>Link do Drive</FLabel>
            <FInput
              value={form.link_drive}
              onChange={v => upd('link_drive', v)}
              placeholder="https://drive.google.com/…"
            />
            {form.link_drive && (
              <a
                href={form.link_drive}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: 'var(--blue)', marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                Abrir pasta no Drive <IconExternal size={11} />
              </a>
            )}
          </div>

          {editing ? (
            <CedenteDocumentos cedenteId={editing.id} token={token} />
          ) : (
            <p style={{ fontSize: 11, color: 'var(--gray2)', margin: 0 }}>
              Salve o cedente primeiro para poder anexar arquivos.
            </p>
          )}

          <div style={{ height: 24 }} />
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', gap: 10, justifyContent: 'flex-end', background: 'var(--white)', flexShrink: 0 }}>
          <button className="delete-confirm-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving || !form.nome.trim()}>
            {saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar cedente'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Table Skeleton ────────────────────────────────────────────────────────────

function SkBlock({ w, h, radius = 6 }: { w: string | number; h: string | number; radius?: number }) {
  return <div className="sk-block" style={{ width: w, height: h, borderRadius: radius }} />;
}

function TableSkeleton() {
  return (
    <div className="admin-table-wrap sk-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {['Nome / Razão Social', 'CNPJ/CPF', 'Status', 'Flags', 'Segmento', 'Cidade/Estado', 'Cadastrado', ''].map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[200, 170, 220, 190, 160].map((w, i) => (
            <tr key={i} style={{ opacity: Math.max(0.15, 1 - i * 0.18) }}>
              <td><SkBlock w={w} h={13} /></td>
              <td><SkBlock w={120} h={12} /></td>
              <td><SkBlock w={55} h={20} radius={20} /></td>
              <td><SkBlock w={90} h={20} radius={20} /></td>
              <td><SkBlock w={80} h={12} /></td>
              <td><SkBlock w={100} h={12} /></td>
              <td><SkBlock w={70} h={12} /></td>
              <td><SkBlock w={28} h={28} radius={8} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cedentes Tab ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

interface NewCedente { cnpj: string; razao_social: string; natureza_juridica?: string }

function CedentesTab({ token, newCedente }: { token: string; newCedente?: NewCedente }) {
  const api = useApi(token);
  const { toast } = useToast();

  const [cedentes, setCedentes] = useState<Cedente[]>([]);
  const [options, setOptions] = useState<CedenteOptions>({ segmentos: [], sub_segmentos: [], origens_comerciais: [], canais_aquisicao: [] });
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Cedente | null>(null);
  const [form, setForm] = useState<CedenteForm>(EMPTY_FORM);
  const newCedenteHandled = useRef(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Cedente | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterFlags, setFilterFlags] = useState<string[]>([]);
  const [filterSegmento, setFilterSegmento] = useState<string[]>([]);
  const [filterOrigem, setFilterOrigem] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const data = await api('?action=list_cedentes');
      setCedentes(data.cedentes ?? []);
      if (data.options) setOptions(data.options);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!loading && newCedente && !newCedenteHandled.current) {
      newCedenteHandled.current = true;
      setEditing(null);
      setForm({ ...EMPTY_FORM, nome: newCedente.razao_social, razao_social: newCedente.razao_social, cnpj_cpf: newCedente.cnpj, natureza_juridica: newCedente.natureza_juridica ?? '' });
      setPanelOpen(true);
    }
  }, [loading]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function openEdit(c: Cedente) {
    setEditing(c);
    setForm({
      nome: c.nome, cnpj_cpf: (c.cnpj_cpf ?? '').replace(/\D/g, ''), razao_social: c.razao_social ?? '',
      status: c.status ?? 'Ativo', flags: c.flags ?? 'Regular', origem: c.origem ?? '',
      segmento: c.segmento ?? '', sub_segmento: c.sub_segmento ?? '',
      origem_comercial: c.origem_comercial ?? '', canal_aquisicao: c.canal_aquisicao ?? '',
      parceiro: c.parceiro ?? 0,
      natureza_juridica: c.natureza_juridica ?? '', valores_em_aberto: c.valores_em_aberto,
      limite_operacao: c.limite_operacao, rating: c.rating, obs: c.obs ?? '',
      email: c.email ?? '', endereco_pj: parseAddress(c.endereco_pj),
      nome_responsavel: c.nome_responsavel ?? '', email_responsavel: (() => { const r = c.email_responsavel ?? ''; try { const p = JSON.parse(r); if (Array.isArray(p)) return p[0] ?? ''; } catch {} return r; })(),
      endereco_responsavel: parseAddress(c.endereco_responsavel),
      cpf_responsavel: (c.cpf_responsavel ?? '').replace(/\D/g, ''),
      possui_escrow: c.possui_escrow ?? 0, wpp_contato: (c.wpp_contato ?? '').replace(/\D/g, ''),
      conta_escrow: c.conta_escrow ?? '', link_drive: c.link_drive ?? '',
    });
    setPanelOpen(true);
  }

  function normalizeForm(f: CedenteForm) {
    const str = (v: string | null | undefined) => v?.trim() || null;
    const addrStr = (a: AddressJSON) => {
      const empty = !a.logradouro && !a.cidade && !a.estado && !a.cep;
      return empty ? null : JSON.stringify(a);
    };
    return {
      ...f,
      nome: f.nome.trim(),
      cnpj_cpf: f.cnpj_cpf ? f.cnpj_cpf.replace(/\D/g, '') || null : null,
      razao_social: str(f.razao_social),
      status: str(f.status) ?? 'Ativo',
      flags: str(f.flags) ?? 'Regular',
      origem: str(f.origem),
      segmento: str(f.segmento),
      sub_segmento: str(f.sub_segmento),
      origem_comercial: str(f.origem_comercial),
      canal_aquisicao: str(f.canal_aquisicao),
      natureza_juridica: str(f.natureza_juridica),
      obs: str(f.obs),
      email: str(f.email),
      endereco_pj: addrStr(f.endereco_pj),
      nome_responsavel: str(f.nome_responsavel),
      email_responsavel: str(f.email_responsavel),
      endereco_responsavel: addrStr(f.endereco_responsavel),
      cpf_responsavel: f.cpf_responsavel ? f.cpf_responsavel.replace(/\D/g, '') || null : null,
      wpp_contato: str(f.wpp_contato),
      conta_escrow: f.conta_escrow ? f.conta_escrow.replace(/-/g, '') || null : null,
      link_drive: str(f.link_drive),
    };
  }

  async function handleSave() {
    if (!form.nome.trim()) return;
    setSaving(true);
    try {
      const data = normalizeForm(form);
      if (editing) {
        const res = await api('', 'POST', { action: 'update_cedente', id: editing.id, ...data });
        if (res.error) throw new Error(res.error);
        setCedentes(prev => prev.map(c => c.id === editing.id ? { ...c, ...(data as unknown as Partial<Cedente>) } : c));
        toast('success', 'Cedente atualizado');
      } else {
        const res = await api('', 'POST', { action: 'create_cedente', ...data });
        if (res.error) throw new Error(res.error);
        setCedentes(prev => [...prev, res.cedente]);
        toast('success', 'Cedente cadastrado');
      }
      setPanelOpen(false);
    } catch {
      toast('error', 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api('', 'POST', { action: 'delete_cedente', id: deleteTarget.id });
      setCedentes(prev => prev.filter(c => c.id !== deleteTarget.id));
      toast('success', 'Cedente excluído');
      setDeleteTarget(null);
    } catch {
      toast('error', 'Erro ao excluir');
    } finally {
      setDeleting(false);
    }
  }

  async function addOption(list: string, nome: string) {
    await api('', 'POST', { action: 'add_cedente_option', list, nome });
    setOptions(prev => {
      const next = { ...prev };
      const key = list as keyof CedenteOptions;
      if (!next[key].includes(nome)) next[key] = [...next[key], nome].sort();
      return next;
    });
  }

  const q = search.toLowerCase().trim();
  const filtered = cedentes.filter(c => {
    if (q && !(
      c.nome.toLowerCase().includes(q) ||
      (c.razao_social ?? '').toLowerCase().includes(q) ||
      (c.cnpj_cpf ?? '').includes(q) ||
      (c.endereco_pj ?? '').toLowerCase().includes(q)
    )) return false;
    if (filterStatus.length > 0 && !filterStatus.includes(c.status ?? '')) return false;
    if (filterFlags.length > 0 && !filterFlags.includes(c.flags ?? '')) return false;
    if (filterSegmento.length > 0 && !filterSegmento.includes(c.segmento ?? '')) return false;
    if (filterOrigem.length > 0 && !filterOrigem.includes(c.origem ?? '')) return false;
    return true;
  });

  const activeFilters = [filterStatus, filterFlags, filterSegmento, filterOrigem].filter(a => a.length > 0).length;

  const segmentoOptions = Array.from(new Set(cedentes.map(c => c.segmento).filter(Boolean))) as string[];

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function fmt(iso: string) { return new Date(iso).toLocaleDateString('pt-BR'); }

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Cedentes</h1>
          <p className="admin-page-desc">
            {loading ? '' : `${cedentes.length} empresa${cedentes.length !== 1 ? 's' : ''} cadastrada${cedentes.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        {!loading && (
          <button className="btn btn-primary" onClick={openCreate} style={{ whiteSpace: 'nowrap' }}>
            + Novo cedente
          </button>
        )}
      </div>

      {!loading && cedentes.length > 0 && (
        <div className="admin-toolbar">
          <span className="admin-toolbar-label">Filtrar</span>
          <input
            className="form-input"
            style={{ maxWidth: 280, flex: '0 0 auto', height: 32, padding: '0 10px', fontSize: 12, borderRadius: 8 }}
            placeholder="Buscar por nome, CNPJ ou cidade…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
          <FMultiSelect
            values={filterStatus}
            onChange={v => { setFilterStatus(v); setPage(1); }}
            options={STATUS_OPTIONS}
            placeholder="Status"
            className="inline"
          />
          <FMultiSelect
            values={filterFlags}
            onChange={v => { setFilterFlags(v); setPage(1); }}
            options={FLAGS_OPTIONS}
            placeholder="Flag"
            className="inline"
          />
          <FMultiSelect
            values={filterSegmento}
            onChange={v => { setFilterSegmento(v); setPage(1); }}
            options={segmentoOptions.sort()}
            placeholder="Segmento"
            className="inline"
          />
          <FMultiSelect
            values={filterOrigem}
            onChange={v => { setFilterOrigem(v); setPage(1); }}
            options={ORIGEM_OPTIONS}
            placeholder="Origem"
            className="inline"
          />
          {activeFilters > 0 && (
            <button
              className="btn"
              style={{ fontSize: 12, padding: '5px 10px', color: 'var(--gray2)' }}
              onClick={() => { setFilterStatus([]); setFilterFlags([]); setFilterSegmento([]); setFilterOrigem([]); setPage(1); }}
            >
              Limpar filtros ({activeFilters})
            </button>
          )}
        </div>
      )}

      {loading ? (
        <TableSkeleton />
      ) : cedentes.length === 0 ? (
        <div className="cadastro-empty">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--gray3)' }}>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M8 12h8M8 8h5M8 16h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <p>Nenhum cedente cadastrado ainda</p>
          <button className="btn btn-primary" onClick={openCreate}>+ Cadastrar primeiro cedente</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="cadastro-empty" style={{ padding: '40px 0' }}>
          <p style={{ color: 'var(--gray2)', fontSize: 13 }}>Nenhum resultado para "<strong>{search}</strong>"</p>
          <button className="btn" style={{ marginTop: 8 }} onClick={() => setSearch('')}>Limpar busca</button>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Nome</th>
                  <th style={{ minWidth: 140 }}>CNPJ / CPF</th>
                  <th>Status</th>
                  <th>Flags</th>
                  <th>Segmento</th>
                  <th>Cidade / Estado</th>
                  <th>Cadastrado</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map(c => (
                  <tr key={c.id} onClick={() => openEdit(c)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--black)', display: 'block' }}>{c.nome}</span>
                      {c.razao_social && c.razao_social !== c.nome && (
                        <span style={{ fontSize: 11, color: 'var(--gray2)', display: 'block' }}>{c.razao_social}</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--gray)' }}>
                      {c.cnpj_cpf ? maskCNPJCPF(c.cnpj_cpf) : <span style={{ color: 'var(--gray2)' }}>-</span>}
                    </td>
                    <td><Badge value={c.status} styleMap={STATUS_STYLE} /></td>
                    <td><Badge value={c.flags} styleMap={FLAGS_STYLE} /></td>
                    <td className="admin-cell-sub">{c.segmento || <span style={{ color: 'var(--gray2)' }}>-</span>}</td>
                    <td className="admin-cell-sub">{getCidadeEstado(c.endereco_pj) || <span style={{ color: 'var(--gray2)' }}>-</span>}</td>
                    <td className="admin-cell-sub">{fmt(c.criado_em)}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button
                        className="status-action-btn danger"
                        onClick={() => setDeleteTarget(c)}
                        title="Excluir cedente"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                          <polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: 'var(--gray)' }}>
              <button className="btn" style={{ padding: '4px 12px' }} disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>‹ Anterior</button>
              <span>Página {safePage} de {totalPages} · {filtered.length} cedentes</span>
              <button className="btn" style={{ padding: '4px 12px' }} disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>Próxima ›</button>
            </div>
          )}
        </>
      )}

      {/* Form panel */}
      {panelOpen && (
        <CedentePanel
          editing={editing}
          form={form}
          setForm={setForm}
          options={options}
          onAddOption={addOption}
          onSave={handleSave}
          onClose={() => setPanelOpen(false)}
          saving={saving}
          token={token}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && createPortal(
        <div
          className="admin-modal-overlay"
          style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setDeleteTarget(null)}
        >
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir cedente?</p>
            <p className="delete-confirm-desc">
              <strong>{deleteTarget.nome}</strong> será removido do sistema. Esta ação não pode ser desfeita.
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function SacadosTableSkeleton() {
  return (
    <div className="admin-table-wrap sk-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            {['Razão Social', 'CNPJ / CPF', 'Cadastrado'].map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[220, 180, 200, 160, 190].map((w, i) => (
            <tr key={i} style={{ opacity: Math.max(0.15, 1 - i * 0.18) }}>
              <td><SkBlock w={w} h={13} /></td>
              <td><SkBlock w={130} h={12} /></td>
              <td><SkBlock w={70} h={12} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sacados Tab ───────────────────────────────────────────────────────────────

interface Sacado {
  id: string;
  cnpj_cpf: string | null;
  razao_social: string | null;
  criado_em: string;
}

function SacadosTab({ token }: { token: string }) {
  const api = useApi(token);
  const { toast } = useToast();
  const [sacados, setSacados] = useState<Sacado[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Sacado | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api('?action=list_sacados')
      .then(d => { setSacados(d.sacados ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api('', 'POST', { action: 'delete_sacado', id: deleteTarget.id });
      setSacados(prev => prev.filter(s => s.id !== deleteTarget.id));
      toast('success', 'Sacado removido');
      setDeleteTarget(null);
    } catch {
      toast('error', 'Erro ao remover');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = sacados.filter(s => {
    const q = search.toLowerCase();
    return !q
      || (s.razao_social ?? '').toLowerCase().includes(q)
      || (s.cnpj_cpf ?? '').includes(q);
  });

  return (
    <>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Sacados</h1>
          <p className="admin-page-desc">
            {loading ? '' : `${sacados.length} empresa${sacados.length !== 1 ? 's' : ''} cadastrada${sacados.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <span className="admin-toolbar-label">Filtrar</span>
        <input
          className="form-input"
          style={{ maxWidth: 280, flex: '0 0 auto', height: 32, padding: '0 10px', fontSize: 12, borderRadius: 8 }}
          placeholder="Buscar por nome ou CNPJ…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <SacadosTableSkeleton />
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--gray2)' }}>
          {search ? 'Nenhum resultado.' : 'Nenhum sacado cadastrado ainda.'}
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ minWidth: 220 }}>Razão Social</th>
                <th style={{ minWidth: 160 }}>CNPJ / CPF</th>
                <th>Cadastrado</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600, color: 'var(--black)' }}>
                    {s.razao_social || <span style={{ color: 'var(--gray2)' }}>-</span>}
                  </td>
                  <td style={{ color: 'var(--gray)' }}>
                    {s.cnpj_cpf ? maskCNPJCPF(s.cnpj_cpf) : <span style={{ color: 'var(--gray2)' }}>-</span>}
                  </td>
                  <td style={{ color: 'var(--gray2)' }}>
                    {new Date(s.criado_em).toLocaleDateString('pt-BR')}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="status-action-btn danger" onClick={() => setDeleteTarget(s)} title="Remover sacado">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                        <polyline points="3,6 5,6 21,6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }} onClick={() => setDeleteTarget(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Remover sacado?</p>
            <p className="delete-confirm-desc">
              <strong>{deleteTarget.razao_social || maskCNPJCPF(deleteTarget.cnpj_cpf ?? '')}</strong> será removido da lista.
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removendo…' : 'Remover'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type CadastroTab = 'cedentes' | 'sacados';

export default function CadastrosPage({ token, newCedente }: { token: string; newCedente?: NewCedente }) {
  const [activeTab, setActiveTab] = useState<CadastroTab>('cedentes');

  return (
    <div className="admin-content-wrap">
      <Abas
        valor={activeTab}
        onChange={setActiveTab}
        opcoes={[{ valor: 'cedentes', label: 'Cedentes' }, { valor: 'sacados', label: 'Sacados' }]}
      />

      <AbaPainel key={activeTab}>
      {activeTab === 'cedentes' && <CedentesTab token={token} newCedente={newCedente} />}

      {activeTab === 'sacados' && <SacadosTab token={token} />}
      </AbaPainel>
    </div>
  );
}
