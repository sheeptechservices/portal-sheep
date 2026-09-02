// Gerador de Contratos - porte do "DUX Gerador de Propostas" para a esteira.
// Módulos portados: proposta avulsa e lote de propostas. Os documentos saem dos
// mesmos templates Word do original (api/_templates), gerados em
// api/gerar-documento.ts.
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconArrowRight, IconSpinner } from '../components/icons';
import { createPortal } from 'react-dom';
import { DatePicker } from '../components/DatePicker';
import { PreviaDocx } from '../components/PreviaDocx';
import { SegSwitch as Segmentado } from '../components/SegSwitch';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ajustarBannerDocx, fixarRodapeImpressao } from '../lib/docxBanner';
import { useAuth, useToast } from './AdminApp';
import { maskCurrency, parseCurrency } from '../lib/masks';
import { isoAddMonths } from '../lib/parcelas';
import { extractDocs } from '../lib/ocrExtractor';
import { extrairDadosNf, extracaoOk, type DadosNf } from '../lib/nfseParser';
import {
  simular, fmtMoeda, fmtPct, fmtPctAuto, fmtIntervalo,
  type ResultadoSimulacao,
} from '../lib/simuladorTaxas';
import {
  ajustarParaDiaUtil, brParaIso, fmtDocumento, hojeIso, isoParaBr, maskPct,
  MAX_PARCELAS, MIME_DOCX, normalizaPct, parseMoedaBR, parsePct, rotuloNumeroDoc,
  soDigitos, TIPOS_DOC, type Marca, type TipoDoc,
} from '../lib/gerador';

// O lote só entra no bundle quando o analista abre a aba
const GeradorLotePropostas = lazy(() => import('./GeradorLotePropostas'));

// Cada página do painel define seu próprio `useApi` - mesma convenção das demais
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

/**
 * Passos do wizard — porte do `wz-*` do "DUX Gerador de Propostas". A diferença
 * é a porta de entrada: lá era o upload da NF, aqui é o lead do kanban
 * (com o upload solto e o preenchimento manual como saídas alternativas).
 */
type PassoWz = 'origem' | 'anexos' | 'vencimentos' | 'pronto';

type Modulo = 'propostas' | 'lote' | 'contratos' | 'atualizar';

// ── Parte (cedente ou sacado) ────────────────────────────────────────────────

interface Parte {
  id?: string | number;
  nome: string;
  documento: string;
  /** Campos extras do cadastro, usados pelo módulo de contratos */
  extra?: Record<string, unknown>;
  /** Veio da leitura do documento e não está no cadastro da esteira */
  avulso?: boolean;
}

function SeletorParte({
  label, itens, valor, onChange, carregando, placeholder,
}: {
  label: string;
  itens: Parte[];
  valor: Parte | null;
  onChange: (p: Parte | null) => void;
  carregando: boolean;
  placeholder: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const digitos = busca.replace(/\D/g, '');
  const filtrados = busca.trim()
    ? itens.filter(i =>
        i.nome.toLowerCase().includes(busca.toLowerCase())
        || (digitos.length > 0 && i.documento.replace(/\D/g, '').includes(digitos)))
    : itens;

  return (
    <div>
      <label className="form-label" style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {valor ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, padding: '6px 11px',
            borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--yellow)',
            background: 'var(--white)', boxShadow: '0 0 0 3px var(--yd)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {valor.nome}
              </p>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {valor.documento && fmtDocumento(valor.documento)}
                {valor.avulso && (
                  <span
                    title="Lido do documento; não consta no cadastro da esteira"
                    style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase',
                      color: '#B45309', background: 'rgba(180,83,9,0.12)', padding: '1px 6px', borderRadius: 'var(--radius-pill)' }}
                  >fora do cadastro</span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', fontSize: 18, lineHeight: 1 }}
            >×</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { setAberto(a => !a); setTimeout(() => inputRef.current?.focus(), 0); }}
            style={{
              width: '100%', height: 38, padding: '0 11px', textAlign: 'left',
              borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)',
              background: 'var(--white)', color: 'var(--gray2)', fontSize: 13.5,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >{placeholder}</button>
        )}

        {aberto && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40,
            background: 'var(--white)', border: '1.5px solid var(--gray3)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card-hover)',
            maxHeight: 280, overflowY: 'auto',
          }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--gray3)', position: 'sticky', top: 0, background: 'var(--white)' }}>
              <input
                ref={inputRef}
                className="form-input"
                style={{ height: 34, fontSize: 13 }}
                placeholder="Buscar por nome ou CNPJ…"
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            {carregando && <div className="dux-spinner-row" style={{ padding: '12px' }}><span className="dux-spinner sm" /></div>}
            {!carregando && filtrados.length === 0 && (
              <p style={{ padding: 12, fontSize: 12, color: 'var(--gray2)' }}>Nenhum resultado.</p>
            )}
            {filtrados.slice(0, 80).map((i, idx) => (
              <button
                key={`${i.id ?? idx}`}
                type="button"
                onClick={() => { onChange(i); setAberto(false); setBusca(''); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px',
                  border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray4, var(--bg))'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
              >
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--black)' }}>{i.nome}</span>
                {i.documento && <span style={{ display: 'block', fontSize: 11, color: 'var(--gray2)' }}>{fmtDocumento(i.documento)}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Select no padrão do sistema ──────────────────────────────────────────────
// Mesmas classes do FormSelect das Leads (.liquidez-trigger /
// .status-select-dropdown); duplicado aqui só para não puxar aquele módulo
// inteiro para dentro deste chunk. Sem opção vazia: o campo é obrigatório.
function SelectSistema<T extends string>({ valor, onChange, opcoes }: {
  valor: T;
  onChange: (v: T) => void;
  opcoes: { valor: T; label: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const atual = opcoes.find(o => o.valor === valor);

  function abrir() {
    const rect = triggerRef.current!.getBoundingClientRect();
    const altura = Math.min(8 + opcoes.length * 36, 320);
    const espacoAbaixo = window.innerHeight - rect.bottom - 8;
    const paraCima = espacoAbaixo < altura && rect.top > altura;
    setPos({
      top: paraCima ? rect.top - altura - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 180),
    });
    setAberto(o => !o);
  }

  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={abrir}
        className="liquidez-trigger"
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0,
          height: 38, padding: '0 11px', borderRadius: 'var(--radius-sm)',
          fontSize: 13.5, fontWeight: 500, background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}
      >
        <span>{atual?.label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ transition: 'transform .15s', transform: aberto ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 10000 }}>
          {opcoes.map(o => (
            <div
              key={o.valor}
              className={`status-select-option${valor === o.valor ? ' active' : ''}`}
              onClick={() => { onChange(o.valor); setAberto(false); }}
            >
              <span>{o.label}</span>
              {valor === o.valor && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 'auto' }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Lead do kanban ────────────────────────────────────────────────────

interface LeadOpt {
  id: string;
  /** Etapa atual — o anexo entra vinculado a ela */
  etapaId: number | null;
  cedente: string;
  cedenteCnpj: string;
  sacado: string;
  sacadoCnpj: string;
  valor: string;
  etapa: string;
  etapaCor: string;
}

/** Anexo do lead; `etapa` distingue as duas tabelas de arquivos. */
interface AnexoOpt {
  id: number;
  nome: string;
  tipo: string;
  tamanho: number;
  categoria: string;
  etapa: boolean;
  /** PDF ou imagem - só nesses dá para rodar a leitura */
  legivel: boolean;
}

function chaveAnexo(a: AnexoOpt) { return `${a.etapa ? 'e' : 'f'}-${a.id}`; }

function tamanhoLegivel(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SeletorLead({ itens, valor, onChange, carregando }: {
  itens: LeadOpt[];
  valor: LeadOpt | null;
  onChange: (s: LeadOpt | null) => void;
  carregando: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // O dropdown vai num portal com posição fixa (medida do gatilho) para não ser
  // cortado pelo overflow do container da página (.admin-content-wrap).
  function abrir() {
    const rect = wrapRef.current!.getBoundingClientRect();
    const altura = 340;
    const espacoAbaixo = window.innerHeight - rect.bottom - 8;
    const paraCima = espacoAbaixo < altura && rect.top > espacoAbaixo;
    setPos({
      top: paraCima ? Math.max(8, rect.top - altura - 4) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
    setAberto(a => !a);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  useDropdownDismiss(aberto, [wrapRef, dropRef], () => setAberto(false));

  const digitos = busca.replace(/\D/g, '');
  const filtrados = busca.trim()
    ? itens.filter(i =>
        `${i.cedente} ${i.sacado}`.toLowerCase().includes(busca.toLowerCase())
        || (digitos.length > 0 && `${i.cedenteCnpj}${i.sacadoCnpj}`.replace(/\D/g, '').includes(digitos)))
    : itens;

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {valor ? (
        <div
          role="button"
          tabIndex={0}
          title="Clique para trocar o lead"
          onClick={abrir}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } }}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, minHeight: 38, padding: '6px 11px', cursor: 'pointer',
            borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--yellow)',
            background: 'var(--white)', boxShadow: '0 0 0 3px var(--yd)',
          }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {valor.cedente} <span style={{ color: 'var(--gray2)', fontWeight: 500 }}>&rarr;</span> {valor.sacado}
            </p>
            <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {valor.valor}
              {valor.etapa && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: valor.etapaCor }} />
                  {valor.etapa}
                </span>
              )}
            </p>
          </div>
          <button type="button" title="Limpar" onClick={e => { e.stopPropagation(); onChange(null); }}
            style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--gray2)', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          style={{
            width: '100%', height: 38, padding: '0 11px', textAlign: 'left',
            borderRadius: 'var(--radius-sm)', border: '1.5px solid var(--gray3)',
            background: 'var(--white)', color: 'var(--gray2)', fontSize: 13.5,
            fontFamily: 'inherit', cursor: 'pointer',
          }}
        >Selecione o lead&hellip;</button>
      )}

      {aberto && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000,
          background: 'var(--white)', border: '1.5px solid var(--gray3)',
          borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-card-hover)',
          maxHeight: 340, overflowY: 'auto',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--gray3)', position: 'sticky', top: 0, background: 'var(--white)' }}>
            <input ref={inputRef} className="form-input" style={{ height: 34, fontSize: 13 }}
              placeholder="Buscar por cedente, sacado ou CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          {carregando && <div className="dux-spinner-row" style={{ padding: '12px' }}><span className="dux-spinner sm" /></div>}
          {!carregando && filtrados.length === 0 && (
            <p style={{ padding: 12, fontSize: 12, color: 'var(--gray2)' }}>Nenhum lead encontrada.</p>
          )}
          {filtrados.slice(0, 80).map(i => (
            <button key={i.id} type="button"
              onClick={() => { onChange(i); setAberto(false); setBusca(''); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--gray4, var(--bg))'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--black)' }}>
                {i.cedente} <span style={{ color: 'var(--gray2)' }}>&rarr;</span> {i.sacado}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--gray2)' }}>
                {i.valor}
                {i.etapa && <><span style={{ width: 5, height: 5, borderRadius: '50%', background: i.etapaCor }} />{i.etapa}</>}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * Junta o que foi lido de vários anexos numa proposta só. Campos de identidade
 * ficam com o primeiro documento que os trouxe; o valor é somado e as parcelas
 * são concatenadas - mesmo espírito do "agrupar notas" do original, para quando
 * a operação cobre mais de uma nota.
 */
function mesclarExtracoes(lista: DadosNf[]): DadosNf {
  const validos = lista.filter(d => Object.keys(d).length > 0);
  if (validos.length <= 1) return validos[0] ?? {};

  const out: DadosNf = {};
  const CHAVES: (keyof DadosNf)[] = ['cliente_razao', 'cliente_cnpj', 'sacado_razao', 'sacado_cnpj',
    'data_emissao', 'servico', 'cod_verificacao', 'tipo_documento'];
  for (const k of CHAVES) {
    const achado = validos.find(d => d[k] != null && String(d[k]).trim());
    if (achado) (out as Record<string, unknown>)[k] = achado[k];
  }

  const numeros = validos.map(d => d.numero_nf).filter(Boolean) as string[];
  if (numeros.length) out.numero_nf = Array.from(new Set(numeros)).join(', ');

  const total = validos.reduce((acc, d) => acc + (d.valor_total ? parseMoedaBR(d.valor_total) : 0), 0);
  if (total > 0) out.valor_total = total.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const todas: { venc: string; valor: string }[] = [];
  for (const d of validos) {
    const datas = (d.datas_vencimento ?? '').split(',').map(x => x.trim()).filter(Boolean);
    const valores = (d.valores_parcelas ?? '').split(/,\s+(?=\d)/).map(x => x.trim()).filter(Boolean);
    datas.forEach((venc, i) => todas.push({ venc, valor: valores[i] ?? '' }));
  }
  if (todas.length) {
    todas.sort((a, b) => brParaIso(a.venc).localeCompare(brParaIso(b.venc)));
    out.datas_vencimento = todas.map(x => x.venc).join(', ');
    out.n_parcelas = String(todas.length);
    out.valores_parcelas = todas.every(x => x.valor) ? todas.map(x => x.valor).join(', ') : '';
  }
  return out;
}

// ── Blocos ───────────────────────────────────────────────────────────────────

function Campo({ label, hint, children }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>{label}</label>
      {children}
      {hint && <p style={{ fontSize: 11, color: 'var(--gray2)', marginTop: 5 }}>{hint}</p>}
    </div>
  );
}


function TabelaResultado({ r, dataAntecipacao, ocultarTaxa }: {
  r: ResultadoSimulacao; dataAntecipacao: string; ocultarTaxa: boolean;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="gd-tabela">
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>Parc.</th>
            <th style={{ textAlign: 'right' }}>Valor</th>
            <th style={{ textAlign: 'center' }}>Intervalo</th>
            <th style={{ textAlign: 'center' }}>Duração</th>
            {!ocultarTaxa && <th style={{ textAlign: 'center' }}>Taxa</th>}
            <th style={{ textAlign: 'right' }}>Deságio</th>
            <th style={{ textAlign: 'right' }}>Valor líquido</th>
          </tr>
        </thead>
        <tbody>
          {r.parcelas.map(p => (
            <tr key={p.n}>
              <td style={{ textAlign: 'center', color: 'var(--gray2)' }}>{p.n}</td>
              <td style={{ textAlign: 'right' }}>{fmtMoeda(p.valor)}</td>
              <td style={{ textAlign: 'center' }}>
                {fmtIntervalo(dataAntecipacao, p.vencimento)}
                {!p.diaUtil && <span title="Vencimento em fim de semana ou feriado" style={{ marginLeft: 5, color: '#B45309', fontWeight: 800 }}>!</span>}
              </td>
              <td style={{ textAlign: 'center' }}>{p.dias} dias</td>
              {!ocultarTaxa && <td style={{ textAlign: 'center' }}>{fmtPct(p.taxa * 100, 2)}</td>}
              <td style={{ textAlign: 'right', color: '#B45309' }}>{fmtMoeda(p.juros)}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(p.liquido)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalBruto)}</td>
            <td colSpan={ocultarTaxa ? 2 : 3} />
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalJuros)}</td>
            <td style={{ textAlign: 'right' }}>{fmtMoeda(r.totalLiquido)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EmBreve({ titulo, itens }: { titulo: string; itens: string[] }) {
  return (
    <div className="gd-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
      <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--black)' }}>{titulo}</p>
      <p style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 6, maxWidth: 460, marginInline: 'auto', lineHeight: 1.55 }}>
        Ainda não portado. O que entra aqui:
      </p>
      <ul style={{ listStyle: 'none', marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        {itens.map(i => (
          <li key={i} style={{ fontSize: 12, color: 'var(--gray)' }}>· {i}</li>
        ))}
      </ul>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function GeradorDocumentosPage({ token }: { token: string }) {
  const api = useApi(token);
  const { toast } = useToast();

  const [modulo, setModulo] = useState<Modulo>('propostas');

  // Cadastro da esteira
  const [cedentes, setCedentes] = useState<Parte[]>([]);
  const [sacados, setSacados] = useState<Parte[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Documento
  const [marca, setMarca] = useState<Marca>('dux');
  const [tipo, setTipo] = useState<'avista' | 'parcelado'>('avista');
  const [tipoDoc, setTipoDoc] = useState<TipoDoc>('nf');
  const [ocultarTaxa, setOcultarTaxa] = useState(false);

  // Partes
  const [cedente, setCedente] = useState<Parte | null>(null);
  const [sacado, setSacado] = useState<Parte | null>(null);

  // Operação
  const [valorTotal, setValorTotal] = useState('');
  const [valorAntecipado, setValorAntecipado] = useState('');
  const [numeroNf, setNumeroNf] = useState('');
  const [servico, setServico] = useState('');
  const [dataEmissao, setDataEmissao] = useState(hojeIso());
  const [dataAntecipacao, setDataAntecipacao] = useState(hojeIso());
  const [taxa, setTaxa] = useState('');

  // Parcelas
  const [nParcelas, setNParcelas] = useState(3);
  const [valoresVariaveis, setValoresVariaveis] = useState(false);
  const [vencUnico, setVencUnico] = useState('');
  const [linhas, setLinhas] = useState<{ vencimento: string; valor: string }[]>(
    () => Array.from({ length: 3 }, () => ({ vencimento: '', valor: '' })),
  );

  const [gerando, setGerando] = useState(false);
  // Documento pronto: fica em memória até o analista baixar, anexar ou fechar
  const [documento, setDocumento] = useState<{ nome: string; base64: string } | null>(null);
  const [anexando, setAnexando] = useState(false);
  const [anexado, setAnexado] = useState(false);
  const [preparandoPdf, setPreparandoPdf] = useState(false);
  // Enquanto o analista não mexer no valor a antecipar, ele acompanha o valor do
  // documento (é o `_editadoManualmente` do original)
  const [antecipadoTocado, setAntecipadoTocado] = useState(false);
  // Vencimentos que o sistema empurrou para o próximo dia útil
  const [ajustesData, setAjustesData] = useState<{ de: string; para: string }[]>([]);
  // Última taxa usada com este cedente, para sugerir
  const [taxaSugerida, setTaxaSugerida] = useState<number | null>(null);
  // Texto do campo de %, separado do valor para não brigar enquanto digita
  const [pctTexto, setPctTexto] = useState('');

  // Lead da esteira: traz os dados já cadastrados e a lista de anexos
  const [leads, setLeads] = useState<LeadOpt[]>([]);
  const [lead, setLead] = useState<LeadOpt | null>(null);
  const [anexos, setAnexos] = useState<AnexoOpt[]>([]);
  const [anexosSel, setAnexosSel] = useState<Set<string>>(new Set());
  const [carregandoDemanda, setCarregandoDemanda] = useState(false);

  // Wizard
  const [passo, setPasso] = useState<PassoWz>('origem');
  const [viaManual, setViaManual] = useState(false);
  const [qtdLida, setQtdLida] = useState(0);

  // Leitura do documento (NFS-e, fatura, nota de débito ou contrato em PDF)
  const [lendo, setLendo] = useState('');
  const [lido, setLido] = useState<{ arquivo: string; campos: number; parcial: boolean } | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [c, s, board] = await Promise.all([
          api('?action=list_cedentes'),
          api('?action=list_sacados'),
          api('?action=board'),
        ]);
        if (!vivo) return;
        const etapasPorId = new Map<number, { nome: string; cor: string; fora: boolean }>(
          (board?.statuses ?? []).map((e: any) => [Number(e.id), {
            nome: String(e.nome ?? ''),
            cor: String(e.cor ?? '#AAAAAA'),
            // Operação já executada ou etapa desconsiderada não gera proposta nova
            fora: Number(e.is_conversion ?? 0) === 1 || Number(e.is_excluded ?? 0) === 1,
          }]),
        );
        setLeads((board?.submissions ?? [])
          .filter((x: any) => !etapasPorId.get(Number(x.current_status_id))?.fora)
          .map((x: any) => {
            const et = etapasPorId.get(Number(x.current_status_id));
            return {
              id: String(x.id),
              etapaId: x.current_status_id == null ? null : Number(x.current_status_id),
              cedente: x.nome_contratado || '-',
              cedenteCnpj: x.cnpj_contratado ?? '',
              sacado: x.nome_sacado || '-',
              sacadoCnpj: x.cnpj_sacado ?? '',
              valor: x.valor ?? '',
              etapa: et?.nome ?? '',
              etapaCor: et?.cor ?? '#AAAAAA',
            } as LeadOpt;
          }));
        setCedentes((c?.cedentes ?? []).map((x: any) => ({
          id: x.id,
          nome: x.razao_social || x.nome || '-',
          documento: x.cnpj_cpf ?? '',
          extra: x,
        })));
        setSacados((s?.sacados ?? []).map((x: any) => ({
          id: x.id,
          nome: x.razao_social || '-',
          documento: x.cnpj_cpf ?? '',
          extra: x,
        })));
      } catch (e) {
        // sem cadastro carregado dá para seguir digitando as partes à mão
        console.error('[gerador] cadastro', e);
        if (vivo) toast('error', 'Não foi possível carregar o cadastro', 'Cedentes e sacados podem não aparecer na lista.');
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [api, toast]);

  // Última taxa usada com este cedente: sugere sem atropelar o que já foi digitado
  useEffect(() => {
    const cnpj = soDigitos(cedente?.documento ?? '');
    if (!cnpj) { setTaxaSugerida(null); return; }
    let vivo = true;
    api(`?action=taxa_sugerida&cnpj=${cnpj}`)
      .then(r => {
        if (!vivo) return;
        const t = r?.taxa;
        if (typeof t !== 'number' || !(t > 0)) { setTaxaSugerida(null); return; }
        setTaxaSugerida(t);
        setTaxa(atual => (atual.trim() ? atual : normalizaPct(String(t).replace('.', ','))));
      })
      .catch(() => { if (vivo) setTaxaSugerida(null); });
    return () => { vivo = false; };
  }, [cedente?.documento, api]);

  const valorTotalNum = parseCurrency(valorTotal);
  const valorAntecipadoNum = parseCurrency(valorAntecipado) || valorTotalNum;
  const taxaNum = parsePct(taxa);

  function ajustarNParcelas(n: number) {
    const alvo = Math.min(Math.max(1, n), MAX_PARCELAS);
    setNParcelas(alvo);
    setLinhas(prev => {
      const prox = [...prev];
      while (prox.length < alvo) prox.push({ vencimento: '', valor: '' });
      return prox.slice(0, alvo);
    });
  }

  function preencherMensal() {
    if (!dataAntecipacao) return;
    setLinhas(prev => prev.map((l, i) => ({ ...l, vencimento: isoAddMonths(dataAntecipacao, i + 1) })));
  }

  function atualizarLinha(i: number, patch: Partial<{ vencimento: string; valor: string }>) {
    // Mexeu na data à mão: o aviso do ajuste automático perde a validade
    if (patch.vencimento !== undefined) setAjustesData([]);
    setLinhas(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  // Parcelas resolvidas - o cálculo roda sobre o valor a antecipar
  const parcelas = useMemo(() => {
    if (tipo === 'avista') {
      return vencUnico ? [{ vencimento: vencUnico, valor: valorAntecipadoNum }] : [];
    }
    const usadas = linhas.slice(0, nParcelas);
    if (usadas.some(l => !l.vencimento)) return [];
    if (valoresVariaveis) {
      const vals = usadas.map(l => parseCurrency(l.valor));
      if (vals.some(v => v <= 0)) return [];
      return usadas.map((l, i) => ({ vencimento: l.vencimento, valor: vals[i] }));
    }
    return usadas.map(l => ({ vencimento: l.vencimento, valor: valorAntecipadoNum / nParcelas }));
  }, [tipo, vencUnico, valorAntecipadoNum, linhas, nParcelas, valoresVariaveis]);

  const pronto = !!cedente && !!sacado && valorTotalNum > 0 && taxaNum > 0
    && !!dataAntecipacao && parcelas.length > 0;

  const previa = useMemo(() => {
    if (!pronto) return null;
    return simular({ dataAntecipacao, taxaMensalPct: taxaNum, parcelas });
  }, [pronto, dataAntecipacao, taxaNum, parcelas]);

  const pctAntecipado = valorTotalNum > 0 ? (valorAntecipadoNum / valorTotalNum) * 100 : 0;

  /** Digitou o percentual: recalcula o valor a antecipar sobre o total. */
  function aplicarPercentual(txt: string) {
    // Dígitos e uma vírgula (o ponto vira vírgula), até 2 casas — dá para 82,5%
    let limpo = txt.replace(/[^\d,.]/g, '').replace(/\./g, ',');
    const partes = limpo.split(',');
    limpo = partes.length > 1
      ? `${partes[0].slice(0, 3)},${partes.slice(1).join('').slice(0, 2)}`
      : partes[0].slice(0, 3);
    setPctTexto(limpo);
    setAntecipadoTocado(true);

    const pct = parseFloat(limpo.replace(',', '.'));
    if (!Number.isFinite(pct) || valorTotalNum <= 0) return;
    const alvo = valorTotalNum * Math.min(pct, 100) / 100;
    setValorAntecipado(maskCurrency(String(Math.round(alvo * 100))));
  }

  /** Percentual atual para exibir no campo: inteiro fica sem casas, o resto com vírgula. */
  function pctParaCampo(): string {
    if (!(valorTotalNum > 0) || !valorAntecipado) return '';
    const arredondado = Math.round(pctAntecipado * 100) / 100;
    return Number.isInteger(arredondado)
      ? String(arredondado)
      : String(arredondado).replace('.', ',');
  }

  /** Acha a parte no cadastro pelo CNPJ; se não achar, usa o que veio do documento. */
  function resolverParte(lista: Parte[], razao?: string, doc?: string): Parte | null {
    const digitos = soDigitos(doc ?? '');
    if (digitos) {
      const achada = lista.find(p => soDigitos(p.documento) === digitos);
      if (achada) return achada;
    }
    if (!razao && !digitos) return null;
    return { nome: razao ?? '-', documento: doc ?? '', avulso: true };
  }

  /** Joga no formulário o que a leitura do documento conseguiu extrair. */
  /** Preenche o valor do documento e, junto, o valor a antecipar - que segue o
   *  total até o analista digitar algo ali. */
  function definirValor(reais: number) {
    if (!Number.isFinite(reais) || reais <= 0) return;
    const mascarado = maskCurrency(String(Math.round(reais * 100)));
    setValorTotal(mascarado);
    if (!antecipadoTocado) setValorAntecipado(mascarado);
  }

  /**
   * Joga no formulário o que a leitura conseguiu extrair e devolve quantos campos
   * foram de fato preenchidos.
   *
   * Dois campos ficam de fora de propósito, seguindo o original: a data de emissão
   * é sempre a da proposta (não a da nota) e o serviço prestado é escrito pelo
   * analista - o extrator até lê os dois, mas a tela descarta.
   */
  function aplicarExtracao(d: DadosNf): number {
    let aplicados = 0;

    const ced = resolverParte(cedentes, d.cliente_razao, d.cliente_cnpj);
    if (ced) { setCedente(ced); aplicados++; }
    const sac = resolverParte(sacados, d.sacado_razao, d.sacado_cnpj);
    if (sac) { setSacado(sac); aplicados++; }

    if (d.valor_total) {
      const n = parseMoedaBR(d.valor_total);
      if (n > 0) { definirValor(n); aplicados++; }
    }
    if (d.numero_nf) { setNumeroNf(d.numero_nf); aplicados++; }
    if (d.tipo_documento) { setTipoDoc(d.tipo_documento); aplicados++; }

    // Vencimentos: 1 → à vista; vários → parcelado com as datas e valores lidos
    const lidas = (d.datas_vencimento ?? '').split(',').map(x => brParaIso(x.trim())).filter(Boolean);
    const valores = (d.valores_parcelas ?? '').split(/,\s+(?=\d)/).map(x => x.trim()).filter(Boolean);
    const { datas, ajustes } = ajustarParaDiaUtil(lidas);
    setAjustesData(ajustes);
    if (datas.length === 1) {
      setTipo('avista');
      setVencUnico(datas[0]);
      aplicados++;
    } else if (datas.length > 1) {
      setTipo('parcelado');
      setNParcelas(Math.min(datas.length, MAX_PARCELAS));
      const temValores = valores.length === datas.length;
      setValoresVariaveis(temValores && new Set(valores).size > 1);
      setLinhas(datas.slice(0, MAX_PARCELAS).map((venc, i) => ({
        vencimento: venc,
        valor: temValores ? maskCurrency(String(Math.round(parseMoedaBR(valores[i]) * 100))) : '',
      })));
      aplicados++;
    }

    return aplicados;
  }

  /** Volta o wizard ao início, limpando o que foi preenchido pelo caminho. */
  function recomecar() {
    setPasso('origem');
    setViaManual(false);
    setQtdLida(0);
    setLead(null);
    setAnexos([]);
    setAnexosSel(new Set());
    setLido(null);
    setAjustesData([]);
    setCedente(null);
    setSacado(null);
    setValorTotal('');
    setValorAntecipado('');
    setAntecipadoTocado(false);
    setPctTexto('');
    setNumeroNf('');
    setServico('');
    setVencUnico('');
    setLinhas(Array.from({ length: 3 }, () => ({ vencimento: '', valor: '' })));
    setNParcelas(3);
    setValoresVariaveis(false);
  }

  /** Entra pelo preenchimento manual: pula a leitura e vai direto perguntar o tipo. */
  function irManual() {
    setViaManual(true);
    setQtdLida(0);
    setPasso('vencimentos');
  }

  /** Puxa o detalhe do lead: preenche o que já está cadastrado e lista os anexos. */
  async function selecionarLead(sel: LeadOpt | null) {
    setLead(sel);
    setAnexos([]);
    setAnexosSel(new Set());
    setLido(null);
    if (!sel) { setPasso('origem'); return; }

    setCarregandoDemanda(true);
    try {
      const det = await api(`?action=detail&id=${encodeURIComponent(sel.id)}`);
      const sub = det?.submission;
      if (!sub) throw new Error('Lead não encontrada.');

      // Partes: o detalhe já resolve razão social e CNPJ pelo cadastro
      const ced = resolverParte(cedentes, sub.nome_contratado, sub.cnpj_contratado);
      if (ced) setCedente(ced);
      const sac = resolverParte(sacados, sub.nome_sacado, sub.cnpj_sacado);
      if (sac) setSacado(sac);

      // Valor e parcelas como foram registrados no lead
      const bruto = Number(sub.valor_numerico);
      if (Number.isFinite(bruto) && bruto > 0) definirValor(bruto);
      else if (sub.valor) definirValor(parseMoedaBR(String(sub.valor).replace(/R\$\s*/, '')));

      let parcelas: { valor?: string; valorNumerico?: number; vencimento?: string }[] | null = null;
      try { parcelas = sub.parcelas ? JSON.parse(String(sub.parcelas)) : null; } catch { parcelas = null; }

      if (parcelas?.length) {
        setTipo('parcelado');
        const usadas = parcelas.slice(0, MAX_PARCELAS);
        setNParcelas(usadas.length);
        const valores = usadas.map(x => Number(x.valorNumerico) || 0);
        setValoresVariaveis(new Set(valores).size > 1);
        const { datas, ajustes } = ajustarParaDiaUtil(usadas.map(x => x.vencimento ?? ''));
        setAjustesData(ajustes);
        setLinhas(usadas.map((x, i) => ({
          vencimento: datas[i] ?? '',
          valor: x.valorNumerico ? maskCurrency(String(Math.round(Number(x.valorNumerico) * 100))) : '',
        })));
      } else if (sub.prazo_limite) {
        setTipo('avista');
        const { datas, ajustes } = ajustarParaDiaUtil([String(sub.prazo_limite)]);
        setAjustesData(ajustes);
        setVencUnico(datas[0]);
      } else {
        setAjustesData([]);
      }

      // Anexos: os do formulário e os anexados nas etapas
      const doForm: AnexoOpt[] = (det.form_arquivos ?? []).map((f: any) => ({
        id: Number(f.id), nome: String(f.nome ?? ''), tipo: String(f.tipo ?? ''),
        tamanho: Number(f.tamanho ?? 0), categoria: String(f.categoria ?? ''), etapa: false,
        legivel: /^(application\/pdf|image\/)/.test(String(f.tipo ?? '')),
      }));
      const daEtapa: AnexoOpt[] = (det.etapa_arquivos ?? []).map((f: any) => ({
        id: Number(f.id), nome: String(f.nome ?? ''), tipo: String(f.tipo ?? ''),
        tamanho: Number(f.tamanho ?? 0), categoria: String(f.categoria ?? f.status_nome ?? ''), etapa: true,
        legivel: /^(application\/pdf|image\/)/.test(String(f.tipo ?? '')),
      }));
      const todos = [...doForm, ...daEtapa];
      setAnexos(todos);

      // Com um único anexo legível não faz sentido pedir escolha
      const legiveis = todos.filter(a => a.legivel);
      setAnexosSel(legiveis.length === 1 ? new Set([chaveAnexo(legiveis[0])]) : new Set());

      // Sem anexo legível não há o que ler: pula direto para a pergunta do tipo
      setPasso(legiveis.length ? 'anexos' : 'vencimentos');

      toast('success', 'Lead carregada',
        legiveis.length ? `${legiveis.length} anexo(s) disponível(is) para leitura.` : 'Sem anexos legíveis - preencha os campos à mão.');
    } catch (e: any) {
      console.error('[gerador] lead', e);
      toast('error', 'Não foi possível abrir o lead', e?.message ?? 'Tente novamente.');
    } finally {
      setCarregandoDemanda(false);
    }
  }

  function alternarAnexo(a: AnexoOpt) {
    const k = chaveAnexo(a);
    setAnexosSel(prev => {
      const prox = new Set(prev);
      if (prox.has(k)) prox.delete(k); else prox.add(k);
      return prox;
    });
  }

  /** Baixa o anexo (vem como data URL) e devolve um File para a leitura. */
  async function baixarAnexo(a: AnexoOpt): Promise<File | null> {
    const acao = a.etapa ? 'get_file_base64' : 'get_form_file_base64';
    const r = await api('', 'POST', { action: acao, id: a.id });
    if (!r?.base64) return null;
    const blob = await (await fetch(r.base64)).blob();
    return new File([blob], a.nome || 'anexo', { type: a.tipo || blob.type });
  }

  /** Lê os anexos marcados e joga o resultado no formulário. */
  async function lerAnexosSelecionados() {
    const escolhidos = anexos.filter(a => anexosSel.has(chaveAnexo(a)));
    if (!escolhidos.length) return;

    setLendo('Baixando anexos...');
    setLido(null);
    try {
      const arquivos: File[] = [];
      for (const a of escolhidos) {
        const f = await baixarAnexo(a);
        if (f) arquivos.push(f);
      }
      if (!arquivos.length) throw new Error('Não foi possível baixar os anexos.');

      const docs = await extractDocs(arquivos, (c, t, fase) => {
        const qual = t > 1 ? ` (${c}/${t})` : '';
        setLendo(fase === 'ocr' ? `Sem texto - reconhecendo com OCR${qual}...` : `Lendo${qual}...`);
      });
      const extraidos = docs.map((doc, i) => extrairDadosNf(doc.text, arquivos[i]?.name));
      const d = mesclarExtracoes(extraidos);
      const campos = aplicarExtracao(d);
      if (!campos) {
        toast('error', 'Nada reconhecido nos anexos', 'Confira os arquivos ou preencha à mão.');
        setLido({ arquivo: `${arquivos.length} anexo(s)`, campos: 0, parcial: true });
        return;
      }
      const parcial = !extracaoOk(d);
      const usouOcr = docs.some(x => x.method === 'ocr');
      setLido({
        arquivo: arquivos.length === 1 ? arquivos[0].name : `${arquivos.length} anexos`,
        campos, parcial,
      });
      setQtdLida(arquivos.length);
      setPasso('vencimentos');
      toast(parcial ? 'info' : 'success',
        parcial ? 'Leitura parcial' : 'Anexos lidos',
        `${campos} campos preenchidos${usouOcr ? ' (via OCR)' : ''}. Revise antes de gerar.`);
    } catch (e: any) {
      console.error('[gerador] anexos', e);
      toast('error', 'Falha ao ler os anexos', e?.message ?? 'Tente novamente.');
    } finally {
      setLendo('');
    }
  }

  async function lerDocumento(arquivo: File) {
    setLendo('Lendo o documento…');
    setLido(null);
    try {
      const docs = await extractDocs([arquivo], (_c, _t, fase) => {
        setLendo(fase === 'ocr' ? 'PDF sem texto - reconhecendo com OCR…' : 'Lendo o documento…');
      });
      const texto = docs[0]?.text ?? '';
      const d = extrairDadosNf(texto, arquivo.name);
      const campos = aplicarExtracao(d);
      if (!campos) {
        toast('error', 'Nada reconhecido no documento', 'Confira o arquivo ou preencha os campos à mão.');
        setLido({ arquivo: arquivo.name, campos: 0, parcial: true });
        return;
      }
      const parcial = !extracaoOk(d);
      setLido({ arquivo: arquivo.name, campos, parcial });
      setQtdLida(1);
      setPasso('vencimentos');
      if (parcial) {
        toast('info', 'Leitura parcial', 'Faltou cedente ou valor - confira os campos antes de gerar.');
      } else {
        toast('success', 'Documento lido', `${campos} campos preenchidos${docs[0]?.method === 'ocr' ? ' (via OCR)' : ''}.`);
      }
    } catch (e: any) {
      console.error('[gerador] leitura', e);
      toast('error', 'Não foi possível ler o documento', e?.message ?? 'Tente outro arquivo.');
    } finally {
      setLendo('');
    }
  }

  /** base64 (sem prefixo) → Blob do .docx */
  function docxBlob(base64: string): Blob {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: MIME_DOCX });
  }

  function baixarDocumento() {
    if (!documento) return;
    const url = URL.createObjectURL(docxBlob(documento.base64));
    const a = document.createElement('a');
    a.href = url;
    a.download = documento.nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * PDF pela impressão do navegador. O `soffice` que o sistema de referência usa
   * para converter DOCX→PDF não existe em função serverless; em compensação o
   * documento já é renderizado fielmente aqui pelo docx-preview, e o motor de
   * impressão do Chrome transforma isso num PDF vetorial (texto selecionável),
   * sem custo e sem mandar o documento para um conversor de terceiros.
   */
  async function baixarPdf() {
    if (!documento) return;
    setPreparandoPdf(true);
    const quadro = document.createElement('iframe');
    quadro.setAttribute('aria-hidden', 'true');
    quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(quadro);
    try {
      const doc = quadro.contentDocument;
      if (!doc) throw new Error('Não foi possível preparar a impressão.');
      // O título vira o nome sugerido do arquivo no diálogo de impressão
      const titulo = documento.nome.replace(/\.docx$/i, '');
      doc.open();
      doc.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>'
        + titulo.replace(/[<>&]/g, '')
        + '</title><style>'
        // Margens verticais UNIFORMES no @page (repetem em toda folha: página 2+
        // não cola no topo e sobra base pro rodapé fixo). O Chrome ignora
        // `@page :first`, então não dá pra zerar o topo só na 1ª página; uma
        // margem de topo pequena e igual em todas fica limpa, sem faixa esquisita.
        // Laterais em 0 para o banner sangrar; a margem lateral do corpo vem do
        // padding lateral da própria seção do docx-preview (mantido abaixo).
        + '@page{size:A4;margin:14mm 0 26mm 0}'
        + 'html,body{margin:0;padding:0;background:#fff}'
        + '.docx-wrapper{background:#fff;padding:0;gap:0}'
        // Zera o padding vertical da seção (as margens verticais vêm do @page) e
        // mantém o lateral como margem do corpo. Sem sombra/borda de "cartão" e
        // sem altura mínima de página inteira.
        + '.docx-wrapper>section{box-shadow:none!important;border:none!important;margin:0;padding-top:0!important;padding-bottom:0!important;min-height:0!important}'
        // Não cortar tabela/linha no meio de uma quebra de página.
        + 'table,tr{break-inside:avoid;page-break-inside:avoid}'
        + '</style></head><body></body></html>',
      );
      doc.close();

      const { renderAsync } = await import('docx-preview');
      await renderAsync(docxBlob(documento.base64), doc.body, undefined, {
        inWrapper: true, ignoreWidth: false, ignoreHeight: true,
        breakPages: true, experimental: true,
      });
      // Dá um respiro para as fontes assentarem antes de medir as páginas
      await new Promise(r => setTimeout(r, 350));
      ajustarBannerDocx(doc.body);
      fixarRodapeImpressao(doc.body);

      quadro.contentWindow?.focus();
      quadro.contentWindow?.print();
      toast('info', 'Escolha "Salvar como PDF"', 'O PDF sai pela impressão do navegador.');
    } catch (e: any) {
      console.error('[gerador] pdf', e);
      toast('error', 'Não foi possível gerar o PDF', e?.message ?? 'Baixe o .docx e exporte pelo Word.');
    } finally {
      setPreparandoPdf(false);
      // O diálogo é modal; remove depois que ele já saiu de cena
      setTimeout(() => quadro.remove(), 60_000);
    }
  }

  /** Anexa a proposta no lead de origem, na etapa em que ela está. */
  async function anexarNaLead() {
    if (!documento || !lead) return;
    setAnexando(true);
    try {
      const r = await api('', 'POST', {
        action: 'upload_file',
        lead_id: lead.id,
        status_id: lead.etapaId,
        arquivo: {
          nome: documento.nome,
          tipo: MIME_DOCX,
          tamanho: Math.round((documento.base64.length * 3) / 4),
          // o painel guarda o anexo como data URL
          base64: `data:${MIME_DOCX};base64,${documento.base64}`,
          categoria: 'Proposta',
        },
      });
      if (r?.error) throw new Error(r.error);
      setAnexado(true);
      toast('success', 'Anexado ao lead', `${documento.nome} entrou nos anexos da etapa.`);
    } catch (e: any) {
      console.error('[gerador] anexar', e);
      toast('error', 'Não foi possível anexar', e?.message ?? 'Tente novamente.');
    } finally {
      setAnexando(false);
    }
  }

  async function gerar() {
    if (!pronto || !cedente || !sacado) return;
    setGerando(true);
    try {
      const res = await fetch('/api/gerar-documento?action=proposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({
          tipo, marca, ocultarTaxa,
          clienteRazao: cedente.nome,
          clienteCnpj: fmtDocumento(cedente.documento),
          sacadoRazao: sacado.nome,
          sacadoCnpj: fmtDocumento(sacado.documento),
          valorTotal: valorTotalNum,
          valorAntecipado: valorAntecipadoNum,
          dataEmissao: isoParaBr(dataEmissao),
          dataAntecipacao,
          taxaMensal: taxaNum,
          numeroNf,
          servico,
          tipoDocumento: tipoDoc,
          parcelas,
        }),
      });
      const raw = await res.text();
      let data: any = null;
      try { data = raw ? JSON.parse(raw) : null; } catch { /* resposta vazia ou não-JSON */ }
      if (!res.ok || !data || data.error || !data.base64) {
        throw new Error(data?.error ?? `Falha ao gerar a proposta (${res.status}).`);
      }

      setDocumento({ nome: data.nome, base64: data.base64 });
      setAnexado(false);
      toast('success', 'Proposta gerada', 'Confira na prévia antes de enviar.');
    } catch (e: any) {
      console.error('[gerar-proposta]', e);
      toast('error', 'Erro ao gerar a proposta', e?.message ?? 'Tente novamente.');
    } finally {
      setGerando(false);
    }
  }

  // Cartão de upload avulso — entrada alternativa do wizard, quando o documento
  // não está anexado a nenhum lead.
  const cartaoUpload = (
        <div
          className="gd-drop"
          onClick={() => !lendo && inputArquivoRef.current?.click()}
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('sobre'); }}
          onDragLeave={e => e.currentTarget.classList.remove('sobre')}
          onDrop={e => {
            e.preventDefault();
            e.currentTarget.classList.remove('sobre');
            const f = e.dataTransfer.files?.[0];
            if (f && !lendo) lerDocumento(f);
          }}
        >
          <input
            ref={inputArquivoRef}
            type="file"
            accept=".pdf,image/*"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) lerDocumento(f);
              e.target.value = '';
            }}
          />
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13.4 2.9H6.8A1.8 1.8 0 0 0 5 4.7v14.6a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V8.5z" />
            <path d="M13.4 2.9v5.6H19" />
            <path d="M12 12.4v5m0-5l-2 2m2-2l2 2" />
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            {lendo ? (
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)' }}>{lendo}</p>
            ) : lido ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lido.arquivo}
                </p>
                <p style={{ fontSize: 11.5, color: lido.parcial ? '#B45309' : 'var(--green)', fontWeight: 600 }}>
                  {lido.campos === 0
                    ? 'Nada reconhecido - preencha à mão'
                    : `${lido.campos} campos preenchidos${lido.parcial ? ' - confira o que faltou' : ''}`}
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)' }}>Ler documento (opcional)</p>
                <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
                  Arraste a NFS-e, fatura, nota de débito ou contrato em PDF - os campos são preenchidos sozinhos.
                </p>
              </>
            )}
          </div>
          {lendo
            ? <span className="dux-spinner sm" />
            : <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)' }}>{lido ? 'Trocar' : 'Escolher'}</span>}
        </div>
  );

  return (
    <div className="admin-content-wrap">
      <div>
        <h1 className="admin-page-title">Gerador de Contratos</h1>
        <p className="admin-page-desc">Propostas, contratos e aditivos a partir dos modelos oficiais</p>
      </div>

      <style>{`
        .gd-card { background: var(--white); border: 1px solid var(--gray3); border-radius: var(--radius-lg); padding: 20px; box-shadow: var(--shadow-card); }
        .gd-tabela { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 640px; }
        .gd-tabela th { font-size: 10.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--gray); padding: 8px 10px; border-top: 1.5px solid var(--black); border-bottom: 1.5px solid var(--black); white-space: nowrap; }
        .gd-tabela td { padding: 9px 10px; border-bottom: 1px solid var(--gray3); color: var(--black); white-space: nowrap; }
        .gd-tabela tfoot td { font-weight: 800; border-top: 1.5px solid var(--black); border-bottom: 1.5px solid var(--black); }
        .gd-drop {
          display: flex; align-items: center; gap: 14px;
          background: var(--white); border: 1.5px dashed var(--gray3);
          border-radius: var(--radius-lg); padding: 16px 20px; cursor: pointer;
          color: var(--gray2); transition: border-color .15s, background .15s, color .15s;
        }
        .gd-drop:hover, .gd-drop.sobre { border-color: var(--yellow); background: var(--yd); color: var(--yellow); }
        .gd-pct {
          width: 52px; text-align: right; font-family: inherit; font-size: 10.5px; font-weight: 700;
          color: var(--gray); background: var(--white); border: 1px solid var(--gray3);
          border-radius: 5px; padding: 1px 4px; outline: none;
        }
        .gd-pct:focus { border-color: var(--yellow); box-shadow: 0 0 0 2px var(--yd); }
        /* ── Wizard ── */
        .gd-wz-titulo { font-size: 15px; font-weight: 800; color: var(--black); letter-spacing: -0.01em; }
        .gd-wz-sub { font-size: 12.5px; color: var(--gray); margin-top: 4px; line-height: 1.5; }
        .gd-wz-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 16px; }
        .gd-wz-card {
          position: relative; text-align: left; font-family: inherit; cursor: pointer;
          background: var(--white); border: 1.5px solid var(--gray3); border-radius: var(--radius-md);
          padding: 16px 18px; display: flex; flex-direction: column; gap: 3px;
          transition: border-color .15s, box-shadow .15s, transform .15s;
        }
        .gd-wz-card:hover { border-color: var(--yellow); box-shadow: 0 0 0 3px var(--yd); transform: translateY(-1px); }
        .gd-wz-card.sugerido { border-color: var(--yellow); background: var(--yd); }
        .gd-wz-card-titulo { font-size: 13.5px; font-weight: 800; color: var(--black); }
        .gd-wz-card-desc { font-size: 11.5px; color: var(--gray2); }
        .gd-wz-tag {
          position: absolute; top: 10px; right: 12px;
          font-size: 9.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase;
          color: #7A5600; background: var(--yb); padding: 2px 7px; border-radius: var(--radius-pill);
        }
        .gd-voltar {
          display: inline-flex; align-items: center; gap: 5px; margin-bottom: 12px;
          background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
          font-size: 11.5px; font-weight: 700; color: var(--gray2); transition: color .15s;
        }
        .gd-voltar:hover { color: var(--black); }
        .gd-link {
          background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
          font-size: 11.5px; font-weight: 700; color: var(--gray); text-decoration: underline;
          transition: color .15s;
        }
        .gd-link:hover { color: var(--black); }
        .gd-resumo {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          background: var(--gray4, var(--bg)); border: 1px solid var(--gray3);
          border-radius: var(--radius-pill); padding: 8px 14px;
        }
        .gd-resumo-badge {
          font-size: 11.5px; font-weight: 700; color: var(--gray);
          background: var(--white); border: 1px solid var(--gray3);
          padding: 3px 10px; border-radius: var(--radius-pill); white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis; max-width: 340px;
        }
        /* ── Modal da prévia ── */
        .gd-modal-fundo {
          position: fixed; inset: 0; z-index: 1000; display: flex;
          align-items: center; justify-content: center; padding: 24px;
          background: rgba(18,19,22,0.45); backdrop-filter: blur(4px);
          animation: gd-fade .15s ease both;
        }
        @keyframes gd-fade { from { opacity: 0 } to { opacity: 1 } }
        .gd-modal {
          background: var(--white); border-radius: var(--radius-lg);
          width: 100%; max-width: 860px; max-height: 92vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,0.22);
          animation: scaleIn .18s ease both;
        }
        .gd-modal-topo {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 16px 20px; border-bottom: 1px solid var(--gray3);
        }
        .gd-modal-fechar {
          border: none; background: none; cursor: pointer; color: var(--gray2);
          font-size: 22px; line-height: 1; padding: 0 2px; transition: color .15s;
        }
        .gd-modal-fechar:hover { color: var(--black); }
        .gd-modal-corpo {
          flex: 1; overflow: auto; background: var(--gray4, var(--bg)); padding: 20px;
        }
        .gd-modal-rodape {
          display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
          padding: 14px 20px; border-top: 1px solid var(--gray3);
        }
        /* O docx-preview traz os próprios estilos; aqui só o enquadramento */
        .gd-docx { background: transparent; }
        .gd-docx .docx-wrapper { background: transparent; padding: 0; gap: 16px; }
        .gd-docx .docx-wrapper > section.docx {
          box-shadow: var(--shadow-card); margin: 0 auto; background: #fff;
        }
        .gd-parc-grid { display: grid; grid-template-columns: 28px 1fr; gap: 8px 10px; align-items: center; }
        .gd-parc-grid.com-valor { grid-template-columns: 28px 1fr 1fr; }
        /* ── Lote ── */
        .gd-tabela td.num, .gd-tabela th.num { text-align: right; }
        .gd-lote { min-width: 1000px; }
        .gd-lote td { padding: 6px 6px; vertical-align: top; }
        .gd-lote th { padding: 8px 6px; }
        .gd-lote tr.parcial td { background: var(--yd); }
        .gd-lote tr.erro td { background: rgba(217,48,37,0.06); }
        .gd-lote-inp {
          width: 100%; height: 32px; padding: 0 8px; font-size: 12px; font-weight: 600;
          border-radius: var(--radius-sm);
        }
        select.gd-lote-inp { padding-right: 26px; background-position: right 8px center; }
        .gd-lote-inp.num { text-align: right; }
        .gd-lote-x {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border: none; border-radius: var(--radius-sm);
          background: none; color: var(--gray2); cursor: pointer;
          transition: background var(--transition), color var(--transition);
        }
        .gd-lote-x:hover { background: var(--gray4, var(--bg)); color: var(--red); }
        .gd-lote-item {
          display: flex; align-items: center; gap: 10px;
          background: var(--white); border: 1px solid var(--gray3);
          border-radius: var(--radius-md); padding: 10px 12px;
          transition: border-color var(--transition), box-shadow var(--transition-spring), transform var(--transition-spring);
        }
        .gd-lote-item:hover {
          border-color: var(--yellow); box-shadow: var(--shadow-card-hover); transform: translateY(-2px);
        }
        .gd-lote-acao {
          display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
          width: 30px; height: 30px; border: 1px solid var(--gray3); border-radius: var(--radius-sm);
          background: var(--white); color: var(--gray); cursor: pointer;
          transition: background var(--transition), color var(--transition), border-color var(--transition);
        }
        .gd-lote-acao:hover { background: var(--gray4, var(--bg)); color: var(--black); border-color: var(--gray2); }
        .gd-barra {
          height: 6px; border-radius: var(--radius-pill); overflow: hidden;
          background: var(--gray3);
        }
        .gd-barra > span {
          display: block; height: 100%; background: var(--yellow);
          transition: width var(--transition-spring);
        }
        @media (prefers-reduced-motion: reduce) {
          .gd-lote-item, .gd-barra > span { transition: none; }
          .gd-lote-item:hover { transform: none; }
        }
      `}</style>

      <div style={{ display: 'grid', gap: 16 }}>
        <Segmentado
          valor={modulo}
          onChange={setModulo}
          opcoes={[
            { valor: 'propostas', label: 'Propostas' },
            { valor: 'lote', label: 'Lote' },
            { valor: 'contratos', label: 'Contratos' },
            { valor: 'atualizar', label: 'Atualizar proposta' },
          ]}
        />

        {modulo === 'lote' && (
          <Suspense fallback={(
            <div className="gd-card" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '48px 24px', fontSize: 12.5, color: 'var(--gray2)' }}>
              <span className="dux-spinner sm" /> Abrindo o lote…
            </div>
          )}>
            <GeradorLotePropostas token={token} />
          </Suspense>
        )}

        {modulo === 'contratos' && (
          <EmBreve
            titulo="Gerador de Contratos"
            itens={[
              'Instrumento Particular de Cessão de Direitos Creditórios',
              'Múltiplos intervenientes garantidores',
              'Cláusula de conta escrow opcional',
              'Numeração sequencial de nota promissória',
              'Envio direto para assinatura no D4Sign',
            ]}
          />
        )}

        {modulo === 'atualizar' && (
          <EmBreve
            titulo="Atualizar Proposta"
            itens={[
              'Lê uma proposta já gerada e extrai os dados',
              'Reprocessa com nova data de antecipação ou taxa revisada',
            ]}
          />
        )}

        {modulo === 'propostas' && (
          <>
            {/* ── Passo 1: de onde vêm os dados ── */}
            {passo === 'origem' && (
            <>
            <div className="gd-card">
              <p className="gd-wz-titulo">Por onde começamos?</p>
              <p className="gd-wz-sub">
                Escolha o lead do kanban — dela vêm as partes, o valor e os anexos para leitura.
              </p>
            </div>

            {/* Lead da esteira */}
            <div className="gd-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 150 }}>
                  <p className="admin-section-title" style={{ marginBottom: 2 }}>Lead</p>
                  <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>Puxa partes, valor e parcelas do kanban</p>
                </div>
                <SeletorLead
                  itens={leads}
                  valor={lead}
                  onChange={selecionarLead}
                  carregando={carregando}
                />
              </div>

              {/* Carregamento dos dados/anexos - abaixo do seletor */}
              {carregandoDemanda && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: 'var(--gray2)' }}>
                  <span className="dux-spinner sm" /> Carregando dados e anexos do lead…
                </div>
              )}

            </div>

            {/* Entradas alternativas: documento avulso ou preenchimento manual */}
            {cartaoUpload}

            <div style={{ textAlign: 'center' }}>
              <button type="button" className="gd-link" onClick={irManual}>
                Preencher manualmente, sem ler documento
              </button>
            </div>

            </>
            )}

            {/* ── Passo 2: quais anexos ler ── */}
            {passo === 'anexos' && (
              <div className="gd-card">
                <button type="button" className="gd-voltar" onClick={recomecar}>
                  <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><IconArrowRight size={12} /></span> Trocar lead
                </button>
                <p className="gd-wz-titulo">Quais anexos devo ler?</p>
                <p className="gd-wz-sub">
                  O sistema lê o texto (ou faz OCR) e preenche os campos. Marcando mais de um, os valores
                  são somados numa proposta só.
                </p>
                {(
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <p className="admin-section-title" style={{ marginBottom: 0 }}>
                        Anexos - marque o que deve ser lido
                      </p>
                      {anexos.filter(a => a.legivel).length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const legiveis = anexos.filter(a => a.legivel);
                            const todosMarcados = legiveis.every(a => anexosSel.has(chaveAnexo(a)));
                            setAnexosSel(todosMarcados ? new Set() : new Set(legiveis.map(chaveAnexo)));
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', textDecoration: 'underline' }}
                        >
                          {anexos.filter(a => a.legivel).every(a => anexosSel.has(chaveAnexo(a))) ? 'Desmarcar todos' : 'Marcar todos'}
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                      {anexos.map(a => {
                        const k = chaveAnexo(a);
                        const marcado = anexosSel.has(k);
                        return (
                          <label
                            key={k}
                            className="form-checkbox-label"
                            style={{
                              paddingTop: 0, gap: 10, padding: '8px 12px',
                              border: `1px solid ${marcado ? 'var(--yellow)' : 'var(--gray3)'}`,
                              background: marcado ? 'var(--yd)' : 'transparent',
                              borderRadius: 'var(--radius-sm)',
                              cursor: a.legivel ? 'pointer' : 'not-allowed',
                              opacity: a.legivel ? 1 : 0.55,
                            }}
                          >
                            <input
                              type="checkbox"
                              className="form-checkbox"
                              checked={marcado}
                              disabled={!a.legivel}
                              onChange={() => alternarAnexo(a)}
                            />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.nome}
                              </span>
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--gray2)' }}>
                                {[a.categoria, a.etapa ? 'anexo de etapa' : 'anexo do formulário', tamanhoLegivel(a.tamanho)]
                                  .filter(Boolean).join(' · ')}
                                {!a.legivel && ' · não é PDF nem imagem'}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 12 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
                        {anexosSel.size === 0
                          ? 'Nenhum anexo marcado'
                          : `${anexosSel.size} anexo(s) - os dados serão somados numa proposta só`}
                      </span>
                      <button
                        className="btn btn-primary"
                        disabled={anexosSel.size === 0 || !!lendo}
                        onClick={lerAnexosSelecionados}
                        style={anexosSel.size === 0 || lendo ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                      >
                        {lendo ? <><IconSpinner size={13} /> Lendo…</> : <>Ler e preencher <IconArrowRight size={13} /></>}
                      </button>
                    </div>
                  </div>
                )}
                <div style={{ textAlign: 'center', marginTop: 14 }}>
                  <button type="button" className="gd-link" onClick={() => { setQtdLida(0); setPasso('vencimentos'); }}>
                    Seguir sem ler os anexos
                  </button>
                </div>
              </div>
            )}

            {/* ── Passo 3: como são os vencimentos ── */}
            {passo === 'vencimentos' && (
              <div className="gd-card">
                <button type="button" className="gd-voltar"
                  onClick={() => setPasso(lead && anexos.some(a => a.legivel) ? 'anexos' : 'origem')}>
                  <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><IconArrowRight size={12} /></span> Voltar
                </button>
                <p className="gd-wz-titulo">Como são os vencimentos?</p>
                <p className="gd-wz-sub">
                  {qtdLida > 0
                    ? 'Detectamos pela leitura — confirme ou troque.'
                    : 'Isso define o modelo de proposta usado.'}
                </p>
                <div className="gd-wz-grid">
                  {([
                    { valor: 'avista' as const, titulo: 'À vista', desc: 'Pagamento em parcela única' },
                    { valor: 'parcelado' as const, titulo: 'Parcelado', desc: 'Múltiplas datas de vencimento' },
                  ]).map(op => (
                    <button
                      key={op.valor}
                      type="button"
                      className={`gd-wz-card${tipo === op.valor ? ' sugerido' : ''}`}
                      onClick={() => { setTipo(op.valor); setPasso('pronto'); }}
                    >
                      <span className="gd-wz-card-titulo">{op.titulo}</span>
                      <span className="gd-wz-card-desc">{op.desc}</span>
                      {qtdLida > 0 && tipo === op.valor && <span className="gd-wz-tag">detectado</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Resumo do wizard, acima do formulário ── */}
            {passo === 'pronto' && (
              <div className="gd-resumo">
                <span className="gd-resumo-badge">
                  {viaManual ? 'Preenchimento manual' : lead ? `${lead.cedente} → ${lead.sacado}` : 'Documento avulso'}
                </span>
                <span className="gd-resumo-badge">
                  {qtdLida === 0 ? 'Sem leitura' : qtdLida === 1 ? '1 documento lido' : `${qtdLida} documentos lidos`}
                </span>
                <span className="gd-resumo-badge">{tipo === 'avista' ? 'À vista' : 'Parcelado'}</span>
                <button type="button" className="gd-link" style={{ marginLeft: 'auto' }} onClick={recomecar}>
                  Recomeçar
                </button>
              </div>
            )}

            {passo === 'pronto' && (
            <>
            {/* Modelo do documento */}
            <div className="gd-card">
              <p className="admin-section-title">Modelo</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12, alignItems: 'flex-end' }}>
                <Campo label="Marca">
                  <Segmentado
                    valor={marca}
                    onChange={setMarca}
                    opcoes={[{ valor: 'dux', label: 'DUX' }, { valor: 'prematch', label: 'Prematch' }]}
                  />
                </Campo>
                <Campo label="Modalidade">
                  <Segmentado
                    valor={tipo}
                    onChange={setTipo}
                    opcoes={[{ valor: 'avista', label: 'À vista' }, { valor: 'parcelado', label: 'Parcelado' }]}
                  />
                </Campo>
                <Campo label="Lastro">
                  <div style={{ minWidth: 170 }}>
                    <SelectSistema valor={tipoDoc} onChange={setTipoDoc} opcoes={TIPOS_DOC} />
                  </div>
                </Campo>
                <label className="form-checkbox-label" style={{ paddingTop: 0, paddingBottom: 10 }}>
                  <input
                    type="checkbox"
                    className="form-checkbox"
                    checked={ocultarTaxa}
                    onChange={e => setOcultarTaxa(e.target.checked)}
                  />
                  Ocultar taxa no documento
                </label>
              </div>
            </div>

            {/* Partes */}
            <div className="gd-card">
              <p className="admin-section-title">Partes</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14, marginTop: 12 }}>
                <SeletorParte
                  label="Cedente"
                  itens={cedentes}
                  valor={cedente}
                  onChange={setCedente}
                  carregando={carregando}
                  placeholder="Selecione o cedente…"
                />
                <SeletorParte
                  label="Sacado"
                  itens={sacados}
                  valor={sacado}
                  onChange={setSacado}
                  carregando={carregando}
                  placeholder="Selecione o sacado…"
                />
              </div>
            </div>

            {/* Operação */}
            <div className="gd-card">
              <p className="admin-section-title">Operação</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 12 }}>
                <Campo label="Valor do documento">
                  <input className="form-input" inputMode="numeric" placeholder="R$ 0,00"
                    value={valorTotal} onChange={e => setValorTotal(maskCurrency(e.target.value))} />
                </Campo>

                <Campo
                  label={(
                    <>
                      {/* color herdado: `.form-label > span` é vermelho (é o asterisco de obrigatório) */}
                      <span style={{ color: 'inherit' }}>Valor a antecipar</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 'auto' }}>
                        <input
                          className="gd-pct"
                          inputMode="decimal"
                          title="Percentual do documento a ser antecipado"
                          value={pctTexto || pctParaCampo()}
                          onChange={e => aplicarPercentual(e.target.value)}
                          onBlur={() => setPctTexto('')}
                        />
                        <span style={{ fontSize: 10, color: 'var(--gray2)' }}>%</span>
                      </span>
                    </>
                  )}
                  hint={valorTotalNum > 0 && valorAntecipado
                    ? `${fmtPctAuto(pctAntecipado)} do documento`
                    : 'Vazio = antecipação integral'}
                >
                  <input className="form-input" inputMode="numeric" placeholder="R$ 0,00"
                    value={valorAntecipado}
                    onChange={e => { setAntecipadoTocado(true); setPctTexto(''); setValorAntecipado(maskCurrency(e.target.value)); }} />
                </Campo>

                <Campo
                  label="Taxa mensal"
                  hint={taxaSugerida != null ? `Última com este cedente: ${fmtPctAuto(taxaSugerida)}` : undefined}
                >
                  <div style={{ position: 'relative' }}>
                    <input className="form-input" inputMode="decimal" placeholder="0,00" style={{ paddingRight: 34 }}
                      value={taxa} onChange={e => setTaxa(maskPct(e.target.value))}
                      onBlur={() => setTaxa(t => normalizaPct(t))} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, fontWeight: 700, color: taxa ? 'var(--gray)' : 'var(--gray2)', pointerEvents: 'none' }}>%</span>
                  </div>
                </Campo>

                <Campo label={rotuloNumeroDoc(tipoDoc)} hint="Opcional - a linha some do documento se ficar vazia">
                  <input className="form-input" value={numeroNf} onChange={e => setNumeroNf(e.target.value)} placeholder="-" />
                </Campo>

                <Campo label="Data de emissão">
                  <DatePicker compact allowPast value={dataEmissao} onChange={setDataEmissao} />
                </Campo>

                <Campo label="Data de antecipação">
                  <DatePicker compact allowPast value={dataAntecipacao} onChange={setDataAntecipacao} />
                </Campo>

                {tipo === 'avista' ? (
                  <Campo label="Data de vencimento">
                    <DatePicker compact allowPast value={vencUnico} onChange={setVencUnico} />
                  </Campo>
                ) : (
                  <Campo label="Nº de parcelas">
                    <input className="form-input" type="number" min={1} max={MAX_PARCELAS}
                      value={nParcelas} onChange={e => ajustarNParcelas(Number(e.target.value))} />
                  </Campo>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <Campo label="Serviço prestado">
                  <input className="form-input" value={servico} onChange={e => setServico(e.target.value)}
                    placeholder="Como aparece na proposta - ex.: Locação de veículos, competência 08/2026" />
                </Campo>
              </div>
            </div>

            {/* Parcelas */}
            {tipo === 'parcelado' && (
              <div className="gd-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <p className="admin-section-title" style={{ marginBottom: 0 }}>Parcelas</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button type="button" onClick={preencherMensal}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', textDecoration: 'underline' }}>
                      Preencher mensalmente
                    </button>
                    <Segmentado
                      pequeno
                      valor={valoresVariaveis ? 'var' : 'fix'}
                      onChange={v => setValoresVariaveis(v === 'var')}
                      opcoes={[{ valor: 'fix', label: 'Fixas' }, { valor: 'var', label: 'Variáveis' }]}
                    />
                  </div>
                </div>

                <div className={`gd-parc-grid${valoresVariaveis ? ' com-valor' : ''}`} style={{ marginTop: 14 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--gray2)' }}>#</span>
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>Vencimento</span>
                  {valoresVariaveis && (
                    <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>Valor</span>
                  )}
                  {linhas.slice(0, nParcelas).map((l, i) => (
                    <Fragment key={i}>
                      <span style={{ fontSize: 12, color: 'var(--gray2)', fontWeight: 700 }}>{i + 1}</span>
                      <DatePicker compact allowPast value={l.vencimento} onChange={v => atualizarLinha(i, { vencimento: v })} />
                      {valoresVariaveis && (
                        <input className="form-input" inputMode="numeric" placeholder="R$ 0,00"
                          value={l.valor} onChange={e => atualizarLinha(i, { valor: maskCurrency(e.target.value) })} />
                      )}
                    </Fragment>
                  ))}
                </div>

                {!valoresVariaveis && valorAntecipadoNum > 0 && (
                  <p style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 10 }}>
                    Parcelas fixas de {fmtMoeda(valorAntecipadoNum / nParcelas)}.
                  </p>
                )}
              </div>
            )}

            {ajustesData.length > 0 && (
              <p style={{
                fontSize: 11.5, fontWeight: 600, color: '#B45309', background: 'rgba(180,83,9,0.08)',
                padding: '10px 14px', borderRadius: 'var(--radius-md)', lineHeight: 1.5,
              }}>
                {ajustesData.length === 1
                  ? `Vencimento em ${isoParaBr(ajustesData[0].de)} caía em fim de semana ou feriado — movido para ${isoParaBr(ajustesData[0].para)}.`
                  : `${ajustesData.length} vencimentos caíam em fim de semana ou feriado e foram movidos para o próximo dia útil: `
                    + ajustesData.map(a => `${isoParaBr(a.de)} → ${isoParaBr(a.para)}`).join('; ') + '.'}
              </p>
            )}

            {/* Prévia + geração */}
            <div className="gd-card">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <p className="admin-section-title" style={{ marginBottom: 0 }}>Prévia do cálculo</p>
                {previa && (
                  <p style={{ fontSize: 11.5, color: 'var(--gray2)', fontWeight: 600 }}>
                    {fmtPctAuto(previa.taxaMensalPct)} ao mês · {fmtPct(previa.taxaDiariaPct, 4)} ao dia
                  </p>
                )}
              </div>

              {!previa ? (
                <p style={{ padding: '28px 0', textAlign: 'center', fontSize: 12.5, color: 'var(--gray2)' }}>
                  Preencha partes, valor, taxa e vencimentos para ver a prévia.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Antecipado', valor: fmtMoeda(previa.totalBruto) },
                      { label: 'Deságio', valor: fmtMoeda(previa.totalJuros), cor: '#B45309' },
                      { label: 'Líquido ao cedente', valor: fmtMoeda(previa.totalLiquido), cor: 'var(--green)' },
                    ].map(i => (
                      <div key={i.label} style={{ background: 'var(--gray4, var(--bg))', border: '1px solid var(--gray3)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
                        <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--gray2)' }}>{i.label}</p>
                        <p style={{ fontSize: 17, fontWeight: 800, color: i.cor ?? 'var(--black)', marginTop: 3 }}>{i.valor}</p>
                      </div>
                    ))}
                  </div>
                  <TabelaResultado r={previa} dataAntecipacao={dataAntecipacao} ocultarTaxa={ocultarTaxa} />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
                <span style={{ fontSize: 11.5, color: 'var(--gray2)' }}>Saída em .docx</span>
                <button className="btn btn-primary" disabled={!pronto || gerando} onClick={gerar}
                  style={!pronto || gerando ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
                  {gerando ? <><IconSpinner size={13} /> Gerando…</> : <>Gerar proposta <IconArrowRight size={13} /></>}
                </button>
              </div>
            </div>
            </>
            )}
          </>
        )}
      </div>

      {/* Documento pronto: prévia + ações */}
      {documento && createPortal(
        <div
          className="gd-modal-fundo"
          onClick={e => { if (e.target === e.currentTarget) setDocumento(null); }}
        >
          <div className="gd-modal">
            <div className="gd-modal-topo">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--black)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {documento.nome}
                </p>
                <p style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
                  Prévia do documento gerado — confira antes de enviar ao cedente.
                </p>
              </div>
              <button type="button" className="gd-modal-fechar" onClick={() => setDocumento(null)} aria-label="Fechar">&times;</button>
            </div>

            <div className="gd-modal-corpo">
              <PreviaDocx blob={docxBlob(documento.base64)} />
            </div>

            <div className="gd-modal-rodape">
              {lead ? (
                <button
                  className="btn"
                  onClick={anexarNaLead}
                  disabled={anexando || anexado}
                  style={{
                    border: '1.5px solid var(--gray3)', background: 'var(--white)',
                    color: anexado ? 'var(--green)' : 'var(--black)',
                    opacity: anexando ? 0.6 : 1, cursor: anexando || anexado ? 'default' : 'pointer',
                  }}
                >
                  {anexando ? <><IconSpinner size={13} /> Anexando…</>
                    : anexado ? 'Anexado ao lead'
                    : 'Anexar ao lead'}
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: 'var(--gray2)' }}>
                  Sem lead escolhida — não há onde anexar.
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" className="gd-link" onClick={() => setDocumento(null)}>Fechar</button>
                <button
                  className="btn"
                  onClick={baixarPdf}
                  disabled={preparandoPdf}
                  style={{ border: '1.5px solid var(--gray3)', background: 'var(--white)', color: 'var(--black)', opacity: preparandoPdf ? 0.6 : 1 }}
                >
                  {preparandoPdf ? <><IconSpinner size={13} /> Preparando…</> : 'Baixar PDF'}
                </button>
                <button className="btn btn-primary" onClick={baixarDocumento}>Baixar .docx</button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
