import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useToast, useAuth } from './AdminApp';
import { IconClip, IconLink, IconDoc, IconX, IconInbox, IconChevronUp, IconChevronDown, IconChevronUpDown } from '../components/icons';
import { maskCNPJ, maskPhone, maskCEP } from '../lib/masks';
import { lookupCNPJ } from '../lib/cnpjApi';
import { lookupCEP } from '../lib/cepApi';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { definirImagemArrasto } from '../lib/dragImage';

// ── Filtro multi-seleção (mesmo estilo de Solicitações) ─────────────────────
function FilterDropdown({ label, values, options, onChange }: {
  label: string; values: string[]; options: { value: string; label: string }[]; onChange: (v: string[]) => void;
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
        <div ref={dropRef} className="filter-dropdown-list" style={{ top: pos.top, left: pos.left }}>
          {hasSelection && <div className="filter-dropdown-clear" onClick={() => onChange([])}>Limpar seleção</div>}
          {options.map(o => {
            const checked = values.includes(o.value);
            return (
              <div key={o.value} className={`filter-dropdown-option${checked ? ' active' : ''}`} onClick={() => toggle(o.value)}>
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

type Etapa = string;

// Chaves âncora protegidas (semântica de gating público).
const CHAVE_APROVADO = 'aprovado';
const CHAVE_REJEITADO = 'rejeitado';

interface Column { id: number; chave: string; nome: string; cor: string; locked?: number }

// Colunas placeholder enquanto o board carrega.
const SKELETON_COLS = [
  { cor: '#FFB400' }, { cor: '#0066CC' }, { cor: '#1E8A3E' }, { cor: '#D93025' },
];

interface Cadastro {
  id: string;
  nome: string;
  cnpj_cpf: string | null;
  razao_social: string | null;
  natureza_juridica: string | null;
  email: string | null;
  nome_responsavel: string | null;
  email_responsavel: string | null;
  cpf_responsavel: string | null;
  wpp_contato: string | null;
  endereco_pj: string | null;
  endereco_responsavel: string | null;
  cadastro_extra: string | null;
  link_drive?: string | null;
  aprovacao_status: Etapa;
  criado_em: string;
  cadastro_movido_em: string | null;
  arquivo_count: number;
}

interface Arquivo { id: number; nome: string; tipo: string; tamanho: number; categoria?: string | null; criado_em: string }
interface Pendencia { id: number; descricao: string; categoria: string | null; resolvida: number; criado_em: string; resolvido_em: string | null }
const PEND_CATEGORIAS = ['Documento', 'Cadastro', 'Endereço', 'Financeiro', 'Bancário', 'Outros'] as const;

function maskCnpj(v: string | null): string {
  if (!v) return '-';
  const d = v.replace(/\D/g, '');
  if (d.length !== 14) return v;
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function parseJSON(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function fmtAddress(s: string | null): string {
  const a = parseJSON(s);
  if (!a) return '-';
  return [a.logradouro, a.complemento, a.bairro, [a.cidade, a.estado].filter(Boolean).join('/'), a.cep]
    .filter(Boolean).join(' · ');
}

// ── Espelho do formulário público de onboarding ─────────────────────────────
// Limite por anexo (arquivos maiores devem ser enviados como link).
const MAX_ANEXO_MB = 3;
const MAX_ANEXO_BYTES = MAX_ANEXO_MB * 1024 * 1024;
// Categorias de documentos do onboarding (mesmas do formulário público).
const DOC_CATEGORIAS = [
  'RG', 'CPF', 'CNH', 'Contrato Social',
  'Comprovante de Endereço (Empresa)', 'Comprovante de Endereço (Representante)',
  'IRPF', 'IRPJ', 'Declaração de Faturamento', 'Balanço Patrimonial',
  'Notas Fiscais', 'Contratos', 'Outros',
] as const;

function inferDocCat(categoria: string | null | undefined, nome: string): string {
  if (categoria && (DOC_CATEGORIAS as readonly string[]).includes(categoria)) return categoria;
  const pref = DOC_CATEGORIAS.find(c => nome.startsWith(`${c} - `) || nome.startsWith(`${c} - `));
  return pref ?? 'Outros';
}

interface AddrForm { cep: string; numero: string; logradouro: string; bairro: string; cidade: string; estado: string; complemento: string }
const emptyAddr = (): AddrForm => ({ cep: '', numero: '', logradouro: '', bairro: '', cidade: '', estado: '', complemento: '' });

// Mantém o mesmo shape do formulário público (numero embutido no logradouro).
function serializeAddr(a: AddrForm): string {
  return JSON.stringify({
    logradouro: [a.logradouro.trim(), a.numero.trim()].filter(Boolean).join(', '),
    complemento: a.complemento.trim(),
    bairro: a.bairro.trim(),
    cidade: a.cidade.trim(),
    estado: a.estado.trim(),
    cep: a.cep.replace(/\D/g, ''),
  });
}
function parseAddr(json: string | null): AddrForm {
  const o = parseJSON(json) || {};
  let logradouro = String(o.logradouro || ''); let numero = '';
  const idx = logradouro.lastIndexOf(', ');
  if (idx >= 0) { numero = logradouro.slice(idx + 2); logradouro = logradouro.slice(0, idx); }
  return {
    cep: o.cep ? maskCEP(String(o.cep)) : '', numero, logradouro,
    bairro: String(o.bairro || ''), cidade: String(o.cidade || ''),
    estado: String(o.estado || ''), complemento: String(o.complemento || ''),
  };
}

// Dropdown de categoria (padrão do sistema, via portal). Aceita lista de opções.
function DocCatSelect({ value, onChange, options = DOC_CATEGORIAS as unknown as readonly string[] }: { value: string; onChange: (v: string) => void; options?: readonly string[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function openDropdown() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const dropH = Math.min(options.length * 34 + 8, 300);
    const spaceBelow = window.innerHeight - rect.bottom;
    const flipUp = spaceBelow < dropH && rect.top > dropH;
    setPos({ top: flipUp ? rect.top - dropH - 4 : rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 210) });
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
      <button ref={triggerRef} type="button" className="anexo-cat-trigger" title="Categoria" style={{ maxWidth: 210 }} onClick={e => { e.stopPropagation(); openDropdown(); }}>
        <span>{value || 'Outros'}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} className="status-select-dropdown" style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10002 }}>
          {options.map(c => (
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

function LInput({ label, value, onChange, placeholder, type = 'text', required, inputMode, maxLength, onBlur, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; required?: boolean; inputMode?: string; maxLength?: number;
  onBlur?: () => void; hint?: string;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}{required && ' *'}{hint && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: 'var(--yellow)' }}>{hint}</span>}</label>
      <input className="form-input" type={type} value={value} placeholder={placeholder} maxLength={maxLength}
        inputMode={inputMode as any} onChange={e => onChange(e.target.value)} onBlur={onBlur} />
    </div>
  );
}

function AddrEditor({ addr, onChange }: { addr: AddrForm; onChange: (a: AddrForm) => void }) {
  const [loadingCep, setLoadingCep] = useState(false);
  const set = (k: keyof AddrForm, v: string) => onChange({ ...addr, [k]: v });

  async function buscarCep() {
    const digits = addr.cep.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setLoadingCep(true);
    try {
      const d = await lookupCEP(digits);
      if (d) {
        onChange({
          ...addr,
          logradouro: d.logradouro || addr.logradouro,
          bairro: d.bairro || addr.bairro,
          cidade: d.cidade || addr.cidade,
          estado: d.estado || addr.estado,
        });
      }
    } finally {
      setLoadingCep(false);
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <LInput label="CEP" value={addr.cep} onChange={v => set('cep', maskCEP(v))} onBlur={buscarCep}
        placeholder="00000-000" inputMode="numeric" hint={loadingCep ? 'buscando…' : undefined} />
      <LInput label="Número" value={addr.numero} onChange={v => set('numero', v)} />
      <div style={{ gridColumn: '1 / -1' }}><LInput label="Logradouro" value={addr.logradouro} onChange={v => set('logradouro', v)} /></div>
      <LInput label="Bairro" value={addr.bairro} onChange={v => set('bairro', v)} />
      <LInput label="Cidade" value={addr.cidade} onChange={v => set('cidade', v)} />
      <LInput label="Estado" value={addr.estado} onChange={v => set('estado', v.toUpperCase().slice(0, 2))} maxLength={2} />
      <LInput label="Complemento" value={addr.complemento} onChange={v => set('complemento', v)} />
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 800, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>{title}</p>
        <div style={{ flex: 1, height: 1, background: 'var(--gray3)' }} />
      </div>
      {children}
    </section>
  );
}

// ── Modal completo: criar / editar onboarding (espelho do formulário público) ─
function OnboardingFormModal({ api, editId, onClose, onSaved, onDeleted }: {
  api: (path: string, method?: string, body?: any) => Promise<any>;
  editId?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!editId;
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const [empresa, setEmpresa] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [naturezaJuridica, setNaturezaJuridica] = useState('');
  const [nome, setNome] = useState('');
  const [cargo, setCargo] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [emailRep, setEmailRep] = useState('');
  const [endEmpresa, setEndEmpresa] = useState<AddrForm>(emptyAddr());
  const [endResp, setEndResp] = useState<AddrForm>(emptyAddr());
  const [banco, setBanco] = useState({ titular: '', nome: '', agencia: '', conta: '' });
  const [chavePix, setChavePix] = useState('');
  const [linkDrive, setLinkDrive] = useState('');

  const [orig, setOrig] = useState<any>(null); // cedente original (preserva campos não editados no update)
  const [existing, setExisting] = useState<Array<{ id: number; nome: string; tipo: string; tamanho: number; categoria: string | null }>>([]);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [catChanges, setCatChanges] = useState<Record<number, string>>({});
  const [novos, setNovos] = useState<Array<{ tempId: number; nome: string; tipo: string; tamanho: number; base64: string; categoria: string }>>([]);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkNome, setLinkNome] = useState('');
  const [cnpjLoading, setCnpjLoading] = useState(false);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const d = await api(`?action=cadastro_detail&id=${encodeURIComponent(editId)}`);
        const c = d.cedente; if (!c) { toast('error', 'Cadastro não encontrado'); return; }
        setOrig(c);
        const extra = parseJSON(c.cadastro_extra) || {};
        setEmpresa(c.razao_social || c.nome || '');
        setCnpj(c.cnpj_cpf ? maskCNPJ(String(c.cnpj_cpf)) : '');
        setNaturezaJuridica(c.natureza_juridica || '');
        setNome(c.nome_responsavel || '');
        setCargo(extra.cargo || '');
        setEmail(c.email || '');
        setWhatsapp(c.wpp_contato || '');
        setEmailRep(c.email_responsavel || '');
        setEndEmpresa(parseAddr(c.endereco_pj));
        setEndResp(parseAddr(c.endereco_responsavel));
        setBanco({ titular: extra.banco?.titular || '', nome: extra.banco?.nome || '', agencia: extra.banco?.agencia || '', conta: extra.banco?.conta || '' });
        setChavePix(extra.chavePix || '');
        setLinkDrive(c.link_drive || '');
        setExisting((d.arquivos || []).map((a: any) => ({ id: a.id, nome: a.nome, tipo: a.tipo, tamanho: a.tamanho, categoria: a.categoria })));
      } finally {
        setLoading(false);
      }
    })();
  }, [editId]);

  function onAddFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    for (const file of files) {
      if (file.size > MAX_ANEXO_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        toast('error', `Arquivo excede o limite de ${MAX_ANEXO_MB} MB`, `"${file.name}" tem ${mb} MB. Anexe um link (Google Drive, etc.) no campo abaixo.`);
        setShowLinkForm(true);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setNovos(prev => [...prev, { tempId: Date.now() + prev.length, nome: file.name, tipo: file.type, tamanho: file.size, base64: String(reader.result), categoria: 'Outros' }]);
      };
      reader.readAsDataURL(file);
    }
  }

  async function buscarCnpj() {
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const d = await lookupCNPJ(digits);
      if (!d) { toast('info', 'CNPJ não encontrado na Receita', 'Preencha os dados manualmente.'); return; }
      setEmpresa(d.razao_social || d.nome_fantasia || '');
      if (d.natureza_juridica) setNaturezaJuridica(d.natureza_juridica);
      // Pré-preenche o endereço da empresa (apenas se ainda vazio, para não sobrescrever o que foi digitado)
      setEndEmpresa(prev => (prev.logradouro || prev.cep) ? prev : {
        ...prev,
        cep: d.cep ? maskCEP(d.cep) : prev.cep,
        logradouro: d.logradouro || prev.logradouro,
        bairro: d.bairro || prev.bairro,
        cidade: d.municipio || prev.cidade,
        estado: d.uf || prev.estado,
      });
    } catch {
      toast('error', 'Erro ao consultar CNPJ');
    } finally {
      setCnpjLoading(false);
    }
  }

  function addLinkOnb() {
    let url = linkUrl.trim();
    if (!url) { toast('error', 'Informe o link'); return; }
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    setNovos(prev => [...prev, { tempId: Date.now() + prev.length, nome: linkNome.trim() || url, tipo: 'link', tamanho: 0, base64: url, categoria: 'Outros' }]);
    setLinkUrl(''); setLinkNome(''); setShowLinkForm(false);
  }

  async function openExistingLink(fileId: number) {
    try {
      const d = await api(`?action=get_cedente_arquivo_base64&id=${fileId}`);
      if (d?.base64) window.open(d.base64, '_blank', 'noopener');
      else toast('error', 'Link indisponível');
    } catch { toast('error', 'Link indisponível'); }
  }

  async function submit() {
    if (!empresa.trim()) { toast('error', 'Informe a empresa / razão social'); return; }
    // Defensivo: bloqueia anexos acima do limite antes de tentar salvar (evita falha críptica no upload).
    const grande = novos.find(f => f.tipo !== 'link' && f.tamanho > MAX_ANEXO_BYTES);
    if (grande) {
      toast('error', `Anexo excede ${MAX_ANEXO_MB} MB`, `Remova "${grande.nome}" ou substitua por um link antes de salvar.`);
      setShowLinkForm(true);
      return;
    }
    setSaving(true);
    try {
      const cadastro_extra = JSON.stringify({
        cargo: cargo.trim() || null,
        // Preserva documentType já existente (campo não é mais editado aqui - docs vão direto em Anexos)
        ...(parseJSON(orig?.cadastro_extra)?.documentType ? { documentType: parseJSON(orig?.cadastro_extra).documentType } : {}),
        banco: { titular: banco.titular.trim(), nome: banco.nome.trim(), agencia: banco.agencia.trim(), conta: banco.conta.trim() },
        chavePix: chavePix.trim() || null,
      });
      const payload: any = {
        nome: empresa.trim(),
        razao_social: empresa.trim(),
        cnpj_cpf: cnpj.replace(/\D/g, '') || null,
        natureza_juridica: naturezaJuridica.trim() || null,
        email: email.trim() || null,
        nome_responsavel: nome.trim() || null,
        email_responsavel: emailRep.trim() || null,
        wpp_contato: whatsapp.trim() || null,
        endereco_pj: serializeAddr(endEmpresa),
        endereco_responsavel: serializeAddr(endResp),
        cadastro_extra,
        link_drive: linkDrive.trim() || null,
        origem: 'Auto-cadastro',
      };

      let cedenteId = editId;
      if (isEdit) {
        // Preserva campos comerciais não expostos neste formulário (evita zerá-los no UPDATE).
        const preserved = {
          status: orig?.status, flags: orig?.flags, segmento: orig?.segmento, sub_segmento: orig?.sub_segmento,
          origem_comercial: orig?.origem_comercial, canal_aquisicao: orig?.canal_aquisicao, parceiro: orig?.parceiro,
          valores_em_aberto: orig?.valores_em_aberto, limite_operacao: orig?.limite_operacao, rating: orig?.rating,
          obs: orig?.obs, cpf_responsavel: orig?.cpf_responsavel, possui_escrow: orig?.possui_escrow,
          conta_escrow: orig?.conta_escrow,
        };
        await api('', 'POST', { action: 'update_cedente', id: editId, ...preserved, ...payload });
      } else {
        const res = await api('', 'POST', { action: 'create_cedente', ...payload });
        cedenteId = res?.cedente?.id;
        if (!cedenteId) { toast('error', 'Erro ao criar onboarding', res?.error); setSaving(false); return; }
      }

      await Promise.all([
        ...[...removed].map(id => api('', 'POST', { action: 'delete_cedente_arquivo', id })),
        ...Object.entries(catChanges)
          .filter(([id]) => !removed.has(Number(id)))
          .map(([id, categoria]) => api('', 'POST', { action: 'update_cedente_arquivo_categoria', id: Number(id), categoria })),
        ...novos.map(f => api('', 'POST', { action: 'upload_cedente_arquivo', cedente_id: cedenteId, nome: f.nome, tipo: f.tipo, tamanho: f.tamanho, base64: f.base64, categoria: f.categoria })),
      ]);

      toast('success', isEdit ? 'Onboarding atualizado' : 'Onboarding cadastrado', isEdit ? undefined : 'Adicionado ao pipeline.');
      onSaved();
      onClose();
    } catch (e: any) {
      // Erro típico de payload grande: a resposta não é JSON (413) → mensagem clara sobre o limite.
      const msg = String(e?.message ?? '');
      if (/JSON|Unexpected token|Failed to fetch|413|large/i.test(msg)) {
        toast('error', 'Não foi possível salvar', `Algum anexo pode ter ultrapassado o limite de ${MAX_ANEXO_MB} MB. Use um link para arquivos maiores.`);
      } else {
        toast('error', 'Erro ao salvar', msg || undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editId) return;
    setSaving(true);
    try {
      await api('', 'POST', { action: 'delete_cedente', id: editId });
      toast('success', 'Onboarding excluído');
      onDeleted();
      onClose();
    } catch (e: any) {
      toast('error', 'Erro ao excluir', e?.message);
    } finally {
      setSaving(false);
    }
  }

  const visiveis = existing.filter(f => !removed.has(f.id));
  const fmtKB = (n: number) => `${Math.max(1, Math.round((n || 0) / 1024))} KB`;

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ width: 'min(640px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{isEdit ? 'Editar onboarding' : 'Novo onboarding'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray2)' }}>Espelho do formulário de cadastro do cedente</p>
          </div>
          <button className="admin-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="admin-modal-body" style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 26 }}>
          {loading ? (
            <div className="dux-spinner-row" style={{ padding: '30px 0' }}><span className="dux-spinner" /></div>
          ) : (
            <>
              <FormSection title="Dados básicos">
                <LInput label="Empresa / Razão social" value={empresa} onChange={setEmpresa} placeholder="Nome da empresa" required hint={cnpjLoading ? 'preenchendo pelo CNPJ…' : undefined} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <LInput label="CNPJ" value={cnpj} onChange={v => setCnpj(maskCNPJ(v))} onBlur={buscarCnpj} placeholder="00.000.000/0000-00" inputMode="numeric" hint={cnpjLoading ? 'consultando…' : undefined} />
                  <LInput label="Natureza jurídica" value={naturezaJuridica} onChange={setNaturezaJuridica} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <LInput label="Nome do contato" value={nome} onChange={setNome} />
                  <LInput label="Cargo" value={cargo} onChange={setCargo} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <LInput label="E-mail de contato" value={email} onChange={setEmail} type="email" placeholder="email@empresa.com" />
                  <LInput label="WhatsApp" value={whatsapp} onChange={v => setWhatsapp(maskPhone(v))} placeholder="(00) 00000-0000" inputMode="numeric" />
                </div>
              </FormSection>

              <FormSection title="Representante legal">
                <LInput label="E-mail do representante legal" value={emailRep} onChange={setEmailRep} type="email" placeholder="representante@empresa.com" />
              </FormSection>

              <FormSection title="Endereço da empresa">
                <AddrEditor addr={endEmpresa} onChange={setEndEmpresa} />
              </FormSection>

              <FormSection title="Endereço do representante legal">
                <AddrEditor addr={endResp} onChange={setEndResp} />
              </FormSection>

              <FormSection title="Dados bancários">
                <LInput label="Titular da conta" value={banco.titular} onChange={v => setBanco(b => ({ ...b, titular: v }))} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <LInput label="Banco" value={banco.nome} onChange={v => setBanco(b => ({ ...b, nome: v }))} />
                  <LInput label="Agência" value={banco.agencia} onChange={v => setBanco(b => ({ ...b, agencia: v }))} />
                  <LInput label="Conta" value={banco.conta} onChange={v => setBanco(b => ({ ...b, conta: v }))} />
                </div>
                <LInput label="Chave PIX (opcional)" value={chavePix} onChange={setChavePix} />
              </FormSection>

              <FormSection title="Anexos">
                <div className="form-group">
                  <label className="form-label">Link da pasta de documentos (Drive)</label>
                  <input className="form-input" type="url" placeholder="https://drive.google.com/drive/folders/..."
                    value={linkDrive} onChange={e => setLinkDrive(e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--gray2)' }}>
                    {visiveis.length + novos.length} documento(s)
                    <span style={{ fontSize: 10.5, marginLeft: 6, opacity: 0.8 }}>· até {MAX_ANEXO_MB} MB por arquivo (maiores: use link)</span>
                  </span>
                  <label className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: 12, padding: '5px 12px' }}>
                    + Adicionar
                    <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={onAddFiles} />
                  </label>
                </div>
                {showLinkForm && (
                  <div style={{ border: '1px solid var(--gray3)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)' }}>
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--gray)' }}><IconLink size={13} /> Anexar link (Google Drive, etc.)</p>
                    <input className="form-input" placeholder="https://drive.google.com/..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLinkOnb(); }} autoFocus />
                    <input className="form-input" placeholder="Nome do documento (opcional)" value={linkNome} onChange={e => setLinkNome(e.target.value)} />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                      <button type="button" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowLinkForm(false); setLinkUrl(''); setLinkNome(''); }}>Cancelar</button>
                      <button type="button" className="btn btn-primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addLinkOnb}>Anexar link</button>
                    </div>
                  </div>
                )}
                {visiveis.length === 0 && novos.length === 0 && !showLinkForm && (
                  <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhum anexo.</p>
                )}
                {visiveis.map(f => {
                  const isLink = f.tipo === 'link';
                  return (
                    <div key={`e-${f.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--gray3)', borderRadius: 10 }}>
                      <span style={{ flexShrink: 0 }}>{isLink ? <IconLink size={15} /> : <IconDoc size={15} />}</span>
                      {isLink ? (
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#0066CC', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="Abrir link" onClick={() => openExistingLink(f.id)}>{f.nome}</span>
                      ) : (
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.nome}</span>
                      )}
                      {!isLink && <span style={{ fontSize: 11, color: 'var(--gray2)', flexShrink: 0 }}>{fmtKB(f.tamanho)}</span>}
                      <DocCatSelect value={catChanges[f.id] ?? inferDocCat(f.categoria, f.nome)} onChange={c => setCatChanges(prev => ({ ...prev, [f.id]: c }))} />
                      <button type="button" title="Remover" onClick={() => setRemoved(prev => new Set(prev).add(f.id))}
                        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', color: 'var(--gray2)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color var(--transition), background var(--transition)' }}><IconX size={13} /></button>
                    </div>
                  );
                })}
                {novos.map(f => {
                  const isLink = f.tipo === 'link';
                  return (
                    <div key={`n-${f.tempId}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--green)', borderRadius: 10, background: 'rgba(30,138,62,.04)' }}>
                      <span style={{ flexShrink: 0 }}>{isLink ? <IconLink size={15} /> : <IconDoc size={15} />}</span>
                      {isLink ? (
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#0066CC', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title="Abrir link" onClick={() => window.open(f.base64, '_blank', 'noopener')}>
                          {f.nome} <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>NOVO</span>
                        </span>
                      ) : (
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.nome} <span style={{ color: 'var(--green)', fontSize: 10, fontWeight: 700 }}>NOVO</span>
                        </span>
                      )}
                      {!isLink && <span style={{ fontSize: 11, color: 'var(--gray2)', flexShrink: 0 }}>{fmtKB(f.tamanho)}</span>}
                      <DocCatSelect value={f.categoria} onChange={c => setNovos(prev => prev.map(x => x.tempId === f.tempId ? { ...x, categoria: c } : x))} />
                      <button type="button" title="Remover" onClick={() => setNovos(prev => prev.filter(x => x.tempId !== f.tempId))}
                        style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'var(--bg)', cursor: 'pointer', color: 'var(--gray2)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'color var(--transition), background var(--transition)' }}><IconX size={13} /></button>
                    </div>
                  );
                })}
              </FormSection>
            </>
          )}
        </div>

        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--gray3)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            {isEdit && (
              confirmDel ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>Excluir?</span>
                  <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 10px', background: 'var(--red)', borderColor: 'var(--red)' }} onClick={handleDelete} disabled={saving}>Sim, excluir</button>
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => setConfirmDel(false)} disabled={saving}>Não</button>
                </div>
              ) : (
                <button className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => setConfirmDel(true)} disabled={saving}>Excluir</button>
              )
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || loading}>{saving ? 'Salvando…' : isEdit ? 'Salvar' : 'Cadastrar'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CadastrosPipelinePage({ token, openCard, onCardOpened }: {
  token: string;
  // Card vindo da busca rápida - abre o detalhe ao entrar na página.
  openCard?: { id: string; nonce: number };
  onCardOpened?: () => void;
}) {
  const { toast } = useToast();
  const { onSessionExpired } = useAuth();
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<Etapa | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterEmpresa, setFilterEmpresa] = useState<string[]>([]);
  const [filterResponsavel, setFilterResponsavel] = useState<string[]>([]);
  const [filterEtapa, setFilterEtapa] = useState<string[]>([]);
  const [view, setView] = useState<'kanban' | 'lista'>('kanban');
  const [sortCol, setSortCol] = useState<string>('criado_em');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll horizontal suave enquanto arrasta um card até as bordas do board.
  useEffect(() => {
    if (!draggedId) return;
    const el = boardRef.current;
    if (!el) return;
    let raf = 0;
    let clientX = -1;
    const onOver = (e: DragEvent) => { clientX = e.clientX; };
    const onEnd = () => { setDraggedId(null); setDragOver(null); };
    const EDGE = 110;
    const MAX_SPEED = 26;
    const loop = () => {
      if (clientX >= 0) {
        const rect = el.getBoundingClientRect();
        const left = clientX - rect.left;
        const right = rect.right - clientX;
        let dx = 0;
        if (left < EDGE) dx = -MAX_SPEED * (1 - Math.max(0, left) / EDGE);
        else if (right < EDGE) dx = MAX_SPEED * (1 - Math.max(0, right) / EDGE);
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

  const api = useCallback(async (path: string, method = 'GET', body?: any) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [board, cfg] = await Promise.all([
        api('?action=cadastros_board'),
        api('?action=cadastro_status_configs'),
      ]);
      setCadastros(board.cadastros ?? []);
      setColumns(cfg.etapas ?? []);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  // Busca rápida pediu um cadastro específico
  useEffect(() => {
    if (!openCard) return;
    setDetailId(openCard.id);
    onCardOpened?.();
  }, [openCard?.nonce]);

  async function move(id: string, status: Etapa) {
    const card = cadastros.find(c => c.id === id);
    if (!card || card.aprovacao_status === status) return;
    setCadastros(prev => prev.map(c => c.id === id ? { ...c, aprovacao_status: status } : c));
    await api('', 'POST', { action: 'move_cadastro', id, aprovacao_status: status });
    const col = columns.find(c => c.chave === status);
    toast(status === CHAVE_APROVADO ? 'success' : status === CHAVE_REJEITADO ? 'error' : 'info',
      `Cadastro movido para ${col?.nome ?? status}`,
      status === CHAVE_APROVADO ? 'CNPJ liberado para enviar solicitações.' : undefined);
  }

  // ── Filtros ──────────────────────────────────────────────────────────────
  const unique = <T,>(arr: T[]): T[] => [...new Set(arr.filter((v): v is T => v != null && v !== ''))];
  const empresaOptions = unique(cadastros.map(c => c.nome)).map(v => ({ value: v, label: v }));
  const responsavelOptions = unique(cadastros.map(c => c.nome_responsavel)).map(v => ({ value: v!, label: v! }));
  const etapaOptions = columns.map(c => ({ value: c.chave, label: c.nome }));

  const hasFilter = filterEmpresa.length > 0 || filterResponsavel.length > 0 || filterEtapa.length > 0;
  function clearFilters() { setFilterEmpresa([]); setFilterResponsavel([]); setFilterEtapa([]); }

  const filtered = cadastros.filter(c => {
    if (filterEmpresa.length > 0 && !filterEmpresa.includes(c.nome)) return false;
    if (filterResponsavel.length > 0 && !filterResponsavel.includes(c.nome_responsavel ?? '')) return false;
    if (filterEtapa.length > 0 && !filterEtapa.includes(c.aprovacao_status ?? 'pendente')) return false;
    return true;
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total = cadastros.length;
  const aprovados = cadastros.filter(c => c.aprovacao_status === CHAVE_APROVADO).length;
  const rejeitados = cadastros.filter(c => c.aprovacao_status === CHAVE_REJEITADO).length;
  const emAnalise = total - aprovados - rejeitados;

  function toggleEtapaFilter(key: Etapa) {
    setFilterEtapa(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  }

  // ── Ordenação (lista) ────────────────────────────────────────────────────
  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    let av: string | number, bv: string | number;
    switch (sortCol) {
      case 'nome':            av = a.nome ?? '';                 bv = b.nome ?? '';                 break;
      case 'nome_responsavel': av = a.nome_responsavel ?? '';    bv = b.nome_responsavel ?? '';     break;
      case 'aprovacao_status': av = a.aprovacao_status ?? '';    bv = b.aprovacao_status ?? '';     break;
      case 'arquivo_count':   av = a.arquivo_count;              bv = b.arquivo_count;              break;
      default:                av = a.criado_em ?? '';            bv = b.criado_em ?? '';            break;
    }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Onboarding</h1>
          <p className="admin-page-desc">Cedentes que se cadastraram pelo formulário público</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button className="admin-toolbar-btn" onClick={load} title="Atualizar" disabled={loading}>
            <svg
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              style={{ animation: loading ? 'spin 0.7s linear infinite' : undefined }}
            >
              <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.49 9A9 9 0 005.64 5.64L1 10M23 14l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary" style={{ height: 38, padding: '0 16px', fontSize: 13, flexShrink: 0 }}>
            + Novo onboarding
          </button>
        </div>
      </div>

      {/* Stats */}
      {loading ? (
        <div className="admin-stats">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="admin-stat-card-v2" style={{ '--accent-color': 'var(--gray3)', gap: 8, animationDelay: `${i * 0.05}s` } as any}>
              <Sk w="55%" h={11} />
              <Sk w={44} h={30} radius={6} />
              <Sk w="70%" h={10} />
            </div>
          ))}
        </div>
      ) : (
        <div className="admin-stats">
          <div className="admin-stat-card-v2" style={{ '--accent-color': 'var(--yellow)', animationDelay: '0s' } as any}>
            <p className="stat-v2-label">Total de cadastros</p>
            <p className="stat-v2-value">{total}</p>
            <p className="stat-v2-desc">recebidos no sistema</p>
          </div>
          <div className="admin-stat-card-v2" style={{ '--accent-color': '#6366F1', animationDelay: '0.05s' } as any}>
            <p className="stat-v2-label">Em análise</p>
            <p className="stat-v2-value">{emAnalise}</p>
            <p className="stat-v2-desc">aguardando aprovação</p>
          </div>
          <div
            className={`admin-stat-card-v2${filterEtapa.includes('aprovado') ? ' active-filter' : ''}`}
            style={{ '--accent-color': '#1E8A3E', animationDelay: '0.1s', cursor: 'pointer' } as any}
            onClick={() => toggleEtapaFilter('aprovado')}
          >
            <p className="stat-v2-label">Aprovados</p>
            <p className="stat-v2-value">{aprovados}</p>
            <p className="stat-v2-desc">liberados para operar</p>
          </div>
          <div
            className={`admin-stat-card-v2${filterEtapa.includes('rejeitado') ? ' active-filter' : ''}`}
            style={{ '--accent-color': '#D93025', animationDelay: '0.15s', cursor: 'pointer' } as any}
            onClick={() => toggleEtapaFilter('rejeitado')}
          >
            <p className="stat-v2-label">Rejeitados</p>
            <p className="stat-v2-value">{rejeitados}</p>
            <p className="stat-v2-desc">não prosseguiram</p>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {!loading && (
        <div className="admin-toolbar">
          <span className="admin-toolbar-label">Filtrar</span>
          <FilterDropdown label="Empresa" values={filterEmpresa} options={empresaOptions} onChange={setFilterEmpresa} />
          <FilterDropdown label="Responsável" values={filterResponsavel} options={responsavelOptions} onChange={setFilterResponsavel} />
          <FilterDropdown label="Etapa" values={filterEtapa} options={etapaOptions} onChange={setFilterEtapa} />
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
        </div>
      )}

      {loading ? (
        <PipelineSkeleton />
      ) : cadastros.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>Nenhum cadastro recebido ainda</p>
        </div>
      ) : view === 'lista' ? (
        <div className="admin-table-wrap animate">
          <table className="admin-table">
            <thead>
              <tr>
                {([
                  ['criado_em', 'Data'],
                  ['nome', 'Empresa'],
                  ['nome_responsavel', 'Responsável'],
                  ['aprovacao_status', 'Etapa'],
                  ['arquivo_count', 'Docs'],
                ] as [string, string][]).map(([col, label]) => (
                  <th
                    key={col}
                    className={`sortable-th${sortCol === col ? ' sorted' : ''}`}
                    onClick={() => toggleSort(col)}
                  >
                    {label}
                    <span className="sort-arrow">
                      {sortCol === col
                        ? (sortDir === 'asc' ? <IconChevronUp size={11} /> : <IconChevronDown size={11} />)
                        : <IconChevronUpDown size={11} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => {
                const col = columns.find(x => x.chave === c.aprovacao_status);
                return (
                  <tr key={c.id} onClick={() => setDetailId(c.id)}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(c.criado_em).toLocaleDateString('pt-BR')}</td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{c.nome ?? '-'}</p>
                      <p className="admin-cell-sub">{maskCnpj(c.cnpj_cpf)}</p>
                    </td>
                    <td>
                      <p style={{ fontWeight: 600 }}>{c.nome_responsavel ?? '-'}</p>
                      <p className="admin-cell-sub">{c.email ?? ''}</p>
                    </td>
                    <td>
                      {col ? (
                        <span className="admin-badge" style={{ background: `${col.cor}18`, color: col.cor }}>{col.nome}</span>
                      ) : <span style={{ color: 'var(--gray2)', fontSize: 12 }}>-</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {c.arquivo_count > 0 ? <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconClip size={12} /> {c.arquivo_count}</span> : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kanban-board" ref={boardRef}>
          {columns.map(col => {
            const cards = filtered.filter(c => c.aprovacao_status === col.chave);
            const isOver = dragOver === col.chave;
            return (
              <div
                key={col.chave}
                className={`kanban-column${isOver ? ' drag-over' : ''}`}
                style={{ '--col-color': col.cor } as any}
                onDragOver={e => { e.preventDefault(); setDragOver(col.chave); }}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => { e.preventDefault(); setDragOver(null); if (draggedId) move(draggedId, col.chave); setDraggedId(null); }}
              >
                <div className="kanban-column-header">
                  <div className="kanban-column-title">
                    <span className="kanban-dot" style={{ background: col.cor }} />
                    {col.nome}
                  </div>
                  <span className="kanban-count">{cards.length}</span>
                </div>
                <div className="kanban-column-body">
                  {cards.map(c => {
                    const days = daysSince(c.cadastro_movido_em ?? c.criado_em);
                    return (
                      <div
                        key={c.id}
                        className="kanban-card"
                        style={{ '--col-color': col.cor, position: 'relative' } as any}
                        draggable
                        onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; definirImagemArrasto(e); setDraggedId(c.id); }}
                        onClick={() => setDetailId(c.id)}
                      >
                        <p className="kanban-card-title">{c.nome ?? '-'}</p>
                        <p className="kanban-card-sub">{c.nome_responsavel ?? '-'}</p>
                        <div className="kanban-card-meta">
                          <span className="kanban-card-value">{maskCnpj(c.cnpj_cpf)}</span>
                          {days > 0 && <span className={`kanban-card-days${days >= 7 ? ' late' : ''}`}>{days}d</span>}
                        </div>
                        {c.arquivo_count > 0 && <p className="kanban-card-files"><IconClip size={12} /> {c.arquivo_count}</p>}
                      </div>
                    );
                  })}
                  {cards.length === 0 && <div className="kanban-empty-slot">Arraste cards aqui</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {detailId && (
        <CadastroDetailModal
          token={token}
          cadastroId={detailId}
          onClose={() => setDetailId(null)}
          onMove={async (status) => { await move(detailId, status); setDetailId(null); }}
          onEdit={() => { setEditId(detailId); setDetailId(null); }}
        />
      )}

      {(showCreate || editId) && (
        <OnboardingFormModal
          api={api}
          editId={editId}
          onClose={() => { setShowCreate(false); setEditId(null); }}
          onSaved={load}
          onDeleted={load}
        />
      )}
    </div>
  );
}

// ── Detail / review modal ──────────────────────────────────────────────────

function CadastroDetailModal({ token, cadastroId, onClose, onMove, onEdit }: {
  token: string; cadastroId: string; onClose: () => void; onMove: (status: Etapa) => void; onEdit: () => void;
}) {
  const { onSessionExpired } = useAuth();
  const [cedente, setCedente] = useState<Cadastro | null>(null);
  const [arquivos, setArquivos] = useState<Arquivo[]>([]);
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [novaPend, setNovaPend] = useState('');
  const [novaPendCat, setNovaPendCat] = useState<string>('Documento');
  const [addingPend, setAddingPend] = useState(false);
  const [preview, setPreview] = useState<{ nome: string; tipo: string; url: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const apiGet = useCallback(async (params: string) => {
    const res = await fetch(`/api/admin-data?${params}`, { headers: { 'x-admin-session': token } });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);

  const apiPost = useCallback(async (body: any) => {
    const res = await fetch('/api/admin-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-session': token }, body: JSON.stringify(body) });
    if (res.status === 401) { onSessionExpired(); return {}; }
    return res.json();
  }, [token, onSessionExpired]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await apiGet(`action=cadastro_detail&id=${cadastroId}`);
      setCedente(data.cedente ?? null);
      setArquivos(data.arquivos ?? []);
      setPendencias(data.pendencias ?? []);
      setLoading(false);
    })();
  }, [cadastroId, apiGet]);

  async function fetchBase64Url(a: Arquivo): Promise<string | null> {
    const data = await apiGet(`action=get_cedente_arquivo_base64&id=${a.id}`);
    if (!data.base64) return null;
    return data.base64.startsWith('data:') ? data.base64 : `data:${a.tipo};base64,${data.base64}`;
  }

  async function download(a: Arquivo) {
    const url = await fetchBase64Url(a);
    if (!url) return;
    if (a.tipo === 'link') { window.open(url, '_blank', 'noopener'); return; }
    const link = document.createElement('a');
    link.href = url; link.download = a.nome; link.click();
  }

  async function visualizar(a: Arquivo) {
    if (a.tipo === 'link') { const url = await fetchBase64Url(a); if (url) window.open(url, '_blank', 'noopener'); return; }
    const url = await fetchBase64Url(a);
    if (url) setPreview({ nome: a.nome, tipo: a.tipo, url });
  }

  // ── Pendências ──
  const abertas = pendencias.filter(p => !p.resolvida).length;
  async function addPendencia() {
    const desc = novaPend.trim();
    if (!desc || addingPend) return;
    setAddingPend(true);
    try {
      await apiPost({ action: 'add_cedente_pendencias', cedente_id: cadastroId, itens: [{ descricao: desc, categoria: novaPendCat }] });
      const d = await apiGet(`action=cadastro_detail&id=${cadastroId}`);
      setPendencias(d.pendencias ?? []);
      setNovaPend('');
    } finally { setAddingPend(false); }
  }
  async function togglePendencia(id: number, resolvida: boolean) {
    setPendencias(prev => prev.map(p => p.id === id ? { ...p, resolvida: resolvida ? 1 : 0 } : p));
    await apiPost({ action: 'toggle_cedente_pendencia', id, resolvida });
  }
  async function deletePendencia(id: number) {
    setPendencias(prev => prev.filter(p => p.id !== id));
    await apiPost({ action: 'delete_cedente_pendencia', id });
  }
  async function updatePendCategoria(id: number, categoria: string) {
    setPendencias(prev => prev.map(p => p.id === id ? { ...p, categoria } : p));
    await apiPost({ action: 'update_cedente_pendencia', id, categoria });
  }

  const extra = parseJSON(cedente?.cadastro_extra ?? null);
  const banco = extra?.banco;

  return createPortal(
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" style={{ width: 'min(620px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{cedente?.nome ?? 'Cadastro'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray2)' }}>{maskCnpj(cedente?.cnpj_cpf ?? null)}</p>
          </div>
          <button className="admin-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="admin-modal-body" style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <DetailSkeleton />
          ) : cedente && (
            <>
              <Section title="Contato">
                <Row label="Responsável" value={cedente.nome_responsavel} />
                <Row label="Cargo" value={extra?.cargo} />
                <Row label="E-mail" value={cedente.email} />
                <Row label="WhatsApp" value={cedente.wpp_contato} />
                <Row label="E-mail representante legal" value={cedente.email_responsavel} />
              </Section>
              <Section title="Empresa">
                <Row label="Razão social" value={cedente.razao_social} />
                <Row label="Natureza jurídica" value={cedente.natureza_juridica} />
                <Row label="Endereço" value={fmtAddress(cedente.endereco_pj)} />
              </Section>
              <Section title="Representante legal">
                <Row label="Endereço" value={fmtAddress(cedente.endereco_responsavel)} />
              </Section>
              {banco && (
                <Section title="Dados bancários">
                  <Row label="Titular" value={banco.titular} />
                  <Row label="Banco" value={banco.nome} />
                  <Row label="Agência / Conta" value={[banco.agencia, banco.conta].filter(Boolean).join(' / ')} />
                  <Row label="Chave PIX" value={extra?.chavePix} />
                </Section>
              )}
              <Section title={`Documentos (${arquivos.length})`}>
                {cedente?.link_drive && (
                  <a href={cedente.link_drive} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#0066CC', textDecoration: 'none', marginBottom: 10 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Abrir pasta de documentos no Drive
                  </a>
                )}
                {arquivos.length === 0 && <p style={{ fontSize: 12, color: 'var(--gray2)' }}>Nenhum documento.</p>}
                {arquivos.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--gray3)' }}>
                    <span style={{ fontSize: 12.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: 'var(--gray3)', color: 'var(--gray)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {inferDocCat(a.categoria, a.nome)}
                    </span>
                    {a.tipo !== 'link' && (
                      <button className="btn btn-secondary" title="Visualizar" style={{ fontSize: 11, padding: '4px 8px', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }} onClick={() => visualizar(a)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/></svg>
                      </button>
                    )}
                    <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px', flexShrink: 0 }} onClick={() => download(a)}>{a.tipo === 'link' ? 'Abrir' : 'Baixar'}</button>
                  </div>
                ))}
              </Section>

              <Section title={`Pendências${pendencias.length > 0 ? ` · ${abertas > 0 ? `${abertas} aberta(s)` : 'resolvidas'}` : ''}`}>
                {pendencias.length === 0 && <p style={{ fontSize: 12, color: 'var(--gray2)', margin: '0 0 8px' }}>Nenhuma pendência registrada.</p>}
                {pendencias.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--gray3)' }}>
                    <input type="checkbox" checked={!!p.resolvida} onChange={e => togglePendencia(p.id, e.target.checked)}
                      style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--green)' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 500, wordBreak: 'break-word',
                      textDecoration: p.resolvida ? 'line-through' : 'none', color: p.resolvida ? 'var(--gray2)' : 'var(--black)' }}>{p.descricao}</span>
                    <DocCatSelect value={PEND_CATEGORIAS.includes((p.categoria ?? '') as any) ? p.categoria! : 'Outros'} options={PEND_CATEGORIAS} onChange={c => updatePendCategoria(p.id, c)} />
                    <button title="Excluir" onClick={() => deletePendencia(p.id)}
                      style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--gray2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
                  <input className="form-input" style={{ flex: 1 }} placeholder="Nova pendência…" value={novaPend}
                    onChange={e => setNovaPend(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPendencia(); }} />
                  <DocCatSelect value={novaPendCat} options={PEND_CATEGORIAS} onChange={setNovaPendCat} />
                  <button className="btn btn-secondary" style={{ fontSize: 12, padding: '7px 12px', flexShrink: 0 }} onClick={addPendencia} disabled={!novaPend.trim() || addingPend}>
                    {addingPend ? '…' : 'Adicionar'}
                  </button>
                </div>
              </Section>
            </>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '14px 24px', borderTop: '1px solid var(--gray3)', flexShrink: 0 }}>
          <button className="btn btn-secondary" style={{ color: 'var(--red)' }} onClick={() => onMove('rejeitado')}>Rejeitar</button>
          <button className="btn btn-secondary" onClick={onEdit}>Editar</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onMove('aprovado')}>Aprovar cadastro</button>
        </div>
      </div>

      {/* Preview de documento (sobre o modal) */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={(e) => { e.stopPropagation(); setPreview(null); }}>
          <div style={{ width: 'min(900px, 96vw)', height: 'min(88vh, 900px)', background: 'var(--white)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--gray3)' }}>
              <span style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.nome}</span>
              <button className="admin-modal-close" onClick={() => setPreview(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, background: 'var(--bg)', overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {preview.tipo.startsWith('image/')
                ? <img src={preview.url} alt={preview.nome} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <iframe src={preview.url} title={preview.nome} style={{ width: '100%', height: '100%', border: 'none' }} />}
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gray2)', marginBottom: 8 }}>{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ fontSize: 12.5, color: 'var(--gray2)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', wordBreak: 'break-word' }}>{value || '-'}</span>
    </div>
  );
}

// ── Skeletons ──────────────────────────────────────────────────────────────
function Sk({ w, h, radius = 6 }: { w: string | number; h: string | number; radius?: number }) {
  return <div className="sk-block" style={{ width: w, height: h, borderRadius: radius }} />;
}

function PipelineSkeleton() {
  return (
    <div className="kanban-board sk-wrap">
      {SKELETON_COLS.map((col, ci) => (
        <div key={ci} className="kanban-column" style={{ opacity: 1 - ci * 0.12, pointerEvents: 'none', '--col-color': col.cor } as any}>
          <div className="kanban-column-header">
            <div className="kanban-column-title">
              <span className="kanban-dot" style={{ background: col.cor }} />
              <Sk w={70} h={12} />
            </div>
            <Sk w={22} h={22} radius={11} />
          </div>
          <div className="kanban-column-body">
            {Array.from({ length: 3 - (ci % 2) }).map((_, i) => (
              <div key={i} className="kanban-card" style={{ pointerEvents: 'none', gap: 8 }}>
                <Sk w="70%" h={12} />
                <Sk w="50%" h={10} />
                <Sk w="85%" h={10} />
                <Sk w="30%" h={10} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="sk-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {[4, 3, 1, 4].map((rows, si) => (
        <div key={si}>
          <Sk w={90} h={9} radius={4} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 12 }}>
            {Array.from({ length: rows }).map((_, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <Sk w={90} h={11} />
                <Sk w={`${40 + ((i * 17) % 45)}%`} h={11} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
