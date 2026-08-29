import { useState, useMemo, useRef, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useToast, nomeCurto } from './AdminApp';
import {
  IconEye, IconDownload, IconTrash, IconClip, IconDoc, IconImage, IconLink, IconFolder, IconChart, IconClipboard,
  IconCheck, IconCheckCircle, IconX, IconXCircle, IconAlert, IconAlertOctagon, IconHelp, IconEdit, IconSpinner,
  IconRefresh, IconReply, IconSearch, IconScale, IconCalculator, IconUpload, IconReceipt, IconShuffle, IconSave,
  IconSparkles, IconBuilding, IconFactory, IconBot, IconTarget, IconPrinter, IconBook, IconMoney, IconNote, IconUser,
  IconArrowLeft, IconArrowRight,
} from '../components/icons';
import { CategoriaTag } from '../components/CategoriaTag';
import { lookupCNPJ } from '../lib/cnpjApi';
import { maskCNPJ, maskCPF, maskCurrency, maskCpfCnpj } from '../lib/masks';
import { exportToCSV } from '../lib/exportTable';
import {
  fmtDoc, buildDepsReportHTML, depsPortalLink, depsDataConsulta,
  depsCreditoRows, depsCadastroRows, type DepsReportRow,
} from '../lib/depsReport';
import { DepsPanel, DepsPreviewModal } from '../components/DepsPanel';
import { SegSwitch } from '../components/SegSwitch';
import { buildDepsAiDossier } from '../lib/depsAiDossier';
import { extractDocs } from '../lib/ocrExtractor';
import { consolidarExtracao, camposParaRevisar, type DocExtraido, type AvisoCampo } from '../lib/mergeExtracao';

type MaskKind = 'cnpj' | 'cpf' | 'currency' | 'percent';
function applyMask(kind: MaskKind | undefined, v: string): string {
  if (kind === 'cnpj') return maskCNPJ(v);
  if (kind === 'cpf') return maskCPF(v);
  if (kind === 'currency') return maskCurrency(v);
  return v;
}

// Endereço pode vir como texto puro ou como JSON ({logradouro, numero, bairro, cidade, estado, cep, ...}).
// Retorna sempre uma string legível.
function formatEndereco(v: any): string {
  if (v == null) return '';
  const s = String(v).trim();
  if (!s) return '';
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      const o = JSON.parse(s);
      const obj = Array.isArray(o) ? o[0] ?? {} : o;
      const cidadeUf = [obj.cidade ?? obj.municipio, obj.estado ?? obj.uf].filter(Boolean).join('/');
      const partes = [obj.logradouro ?? obj.endereco, obj.numero, obj.complemento, obj.bairro, cidadeUf, obj.cep ? `CEP: ${obj.cep}` : '']
        .map((x: any) => String(x ?? '').trim()).filter(Boolean);
      const out = partes.join(', ');
      return out || s;
    } catch { return s; }
  }
  return s;
}

// ── Helpers numéricos (portados do app de referência) ───────────────────────
function pn(s: string | undefined): number {
  if (!s) return 0;
  let str = String(s).replace(/R\$\s*/g, '').trim();
  if (str.includes(',')) str = str.replace(/\./g, '').replace(',', '.');
  else if ((str.match(/\./g) || []).length > 1) str = str.replace(/\./g, '');
  return parseFloat(str) || 0;
}
function fb(n: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function parseFatPresumido(str: string | undefined): number {
  if (!str) return 0;
  const nums: number[] = [];
  const re = /[\d]+(?:\.[\d]+)*(?:,[\d]+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(str))) !== null) {
    const val = parseFloat(m[0].replace(/\./g, '').replace(',', '.'));
    if (val > 1000) nums.push(val);
  }
  if (nums.length === 0) return 0;
  if (nums.length === 1) return nums[0];
  return (nums[0] + nums[nums.length - 1]) / 2;
}

const STEPS = ['Upload', 'Cedente', 'Lastro', 'Sacado', 'Decisão', 'Parecer'];

type ViewId = 'nova' | 'historico' | 'diretrizes';
const VIEWS: { id: ViewId; label: string }[] = [
  { id: 'nova', label: 'Análise atual' },
  { id: 'historico', label: 'Histórico' },
  { id: 'diretrizes', label: 'Diretrizes' },
];

// Produtos DEPS do contrato DUX (identificadores enviados pela DEPS).
// Não são segredos - ficam aqui para o analista escolher na hora da consulta.
const PRODUTOS_DEPS: { id: string; nome: string; tipo: 'PJ' | 'PF' }[] = [
  { id: '20C2F2B4', nome: 'Mix PJ 057',   tipo: 'PJ' },
  { id: '059D4CF4', nome: 'Smart PJ 005', tipo: 'PJ' },
  { id: 'F081F788', nome: 'Smart PJ 022', tipo: 'PJ' },
  { id: '475A28FB', nome: 'Smart PJ 039', tipo: 'PJ' },
  { id: '61D351FE', nome: 'Smart PF 019', tipo: 'PF' },
  { id: 'A7F51366', nome: 'Smart PF 020', tipo: 'PF' },
];

type Adeq = { texto: string; resp: string; tipo: string };
type FileOrigem = 'manual' | 'solicitacao' | 'cedente' | 'deps';
type FileRow = { name: string; size: number; status: 'processing' | 'done' | 'error'; type?: string; url?: string; mime?: string; categoria?: string | null; origem?: FileOrigem };
// Status derivado de um item do checklist documental (automático)
type CkStatus = { ok: boolean; via?: string; kind?: 'doc' | 'data' };
// Relatório DEPS retido para visualização/download na etapa Decisão
type DepsEntry = { resultado: any; norm: { deps: Record<string, string>; empresa: Record<string, string>; resumo: string }; documento: string; produto: string; nome: string; reutilizou: boolean };
// Parecer consultivo devolvido por /api/ai-parecer (opinião da IA - sugestão)
type AiParecer = {
  recomendacao?: 'aprovado' | 'condicionantes' | 'reprovado' | string;
  confianca?: 'alta' | 'media' | 'baixa' | string;
  taxa_sugerida?: string | null;
  limite_sugerido?: number | null;
  tipo_operacao?: string | null;
  resumo?: string;
  pontos_fortes?: string[];
  pontos_atencao?: string[];
  condicionantes_sugeridas?: { texto: string; resp: string; tipo: string }[];
  alertas?: string[];
  argumentacao?: string;
};

// Linha do histórico de análises (tabela credito_analises)
interface AnaliseHist {
  id: number;
  protocolo: string;
  solicitacao_id: string | null;
  cedente_nome: string | null;
  cedente_cnpj: string | null;
  sacado_nome: string | null;
  sacado_cnpj: string | null;
  valor: string | null;
  status: string;
  risco: string | null;
  taxa: string | null;
  limite: string | null;
  tipo_operacao: string | null;
  ia_recomendacao: string | null;
  ia_confianca: string | null;
  ia_modelo: string | null;
  criado_por_nome: string | null; // analista que validou; nulo nas análises anteriores ao login individual
  criado_em: string;
  arquivo_count?: number;   // anexos gravados junto da análise (COUNT no servidor)
}
// Anexo gravado com a análise (tabela credito_analise_arquivos) - metadados; o
// conteúdo só desce no ver/baixar.
interface AnaliseAnexo {
  id: number;
  nome: string;
  tipo: string | null;      // classificação da IA na leitura ("Nota Fiscal"…)
  mime: string | null;
  tamanho: number;
  categoria: string | null;
  origem: string | null;    // manual | solicitacao | cedente
  criado_em: string;
}
const ORIGEM_LABEL: Record<string, string> = {
  manual: 'Anexado na análise',
  solicitacao: 'Anexo da solicitação',
  cedente: 'Cadastro do cedente',
  deps: 'Relatório DEPS da análise',
};
// Relatório DEPS reduzido ao que o anexo do parecer precisa - vai no snapshot
// para que a reimpressão pelo histórico saia com os mesmos anexos da emissão.
interface DepsAnexo {
  alvo: 'ced' | 'sac';
  nome: string;
  documento: string;
  produto: string;
  norm: DepsEntry['norm'];
  link: string | null;      // relatório oficial no portal da DEPS
  dataConsulta: string;
  reutilizou?: boolean;
}
// Conteúdo serializado que permite reimprimir o parecer como foi emitido
interface AnaliseSnapshot {
  form: Record<string, string>;
  checks: Record<string, boolean>;
  adeqs: Adeq[];
  docsFaltantes: string[];
  solicitacao: SolicitacaoItem | null;
  analise_preliminar?: string;
  deps?: { ced: DepsEntry['norm'] | null; sac: DepsEntry['norm'] | null };
  // Relatórios DEPS como anexos do parecer (Anexo I / II). Análises emitidas
  // antes disso não têm o campo - a reimpressão simplesmente sai sem anexo.
  deps_anexos?: DepsAnexo[];
  // Saída do motor de decisão congelada na emissão: o cálculo de "vencido há N
  // dias" é relativo a hoje, então recalcular na leitura distorceria o histórico.
  dec?: ReturnType<typeof computeDecisao>;
}

// Protocolo do parecer: estável (não muda a cada render) e legível.
function novoProtocolo(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `AC-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
// Valores monetários chegam inconsistentes: `solicitacoes.valor` e o mask de
// moeda já trazem "R$", mas o preenchimento automático do motor (fb()) não.
// Prefixa só quando falta, para não sair "R$ R$ 1.000,00".
function fmtMoeda(v: string | null | undefined, vazio = '-'): string {
  const s = String(v ?? '').trim();
  if (!s) return vazio;
  return /^R\$/i.test(s) ? s : `R$ ${s}`;
}
function fmtDataHora(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface SolicitacaoItem {
  id: string;
  created_at: string;
  nome_contratado: string | null;
  cnpj_contratado: string | null;
  nome_sacado: string | null;
  cnpj_sacado: string | null;
  valor: string | null;
  prazo_limite: string | null;
  parcelas: string | null;
  cedente_id: string | null;
  cedente_nome: string | null;
  cedente_razao_social?: string | null;
  cedente_cnpj: string | null;
  sacado_razao_social: string | null;
  sacado_cnpj_db: string | null;
}

// ── Decisão (motor de cálculo portado de buildDecisao) ──────────────────────
function computeDecisao(gv: (id: string) => string) {
  const cedFat = pn(gv('ced-fat-total')) || parseFatPresumido(gv('ced-fat-presumido')) || 1;
  const sacFat = parseFatPresumido(gv('sac-fat-presumido')) || 1;
  const cedRestr = pn(gv('ced-acoes-val')) + pn(gv('ced-protestos-val'));
  const sacRestr = pn(gv('sac-acoes-val')) + pn(gv('sac-protestos-val'));
  const cedPropRestr = cedFat > 1 ? (cedRestr / cedFat * 100) : 0;
  const sacPropRestr = sacFat > 1 ? (sacRestr / sacFat * 100) : 0;
  const cedScore = parseInt(gv('ced-score')) || 0;
  const sacScore = parseInt(gv('sac-score')) || 0;
  const cedPont = gv('ced-pont12');
  const sacPont = gv('sac-pont12');

  const limiteCed = cedFat * 0.3;
  const limiteSac = sacFat * 0.2;
  const limiteOp = Math.min(limiteCed || Infinity, limiteSac || Infinity);

  let risk: 'baixo' | 'medio' | 'elevado' = 'medio';
  if (cedPropRestr < 5 && sacPropRestr < 5 && cedScore > 500 && sacScore > 500) risk = 'baixo';
  if (cedPropRestr > 15 || sacPropRestr > 15 || cedScore < 350) risk = 'elevado';

  let taxa = '3,50';
  if (risk === 'baixo') taxa = '2,80';
  if (risk === 'elevado') taxa = '4,50';

  const sacPontNum = parseFloat(String(sacPont).replace(',', '.')) || 0;
  const cedPontNum = parseFloat(String(cedPont).replace(',', '.')) || 0;
  const sacForte = sacScore >= 650 && sacPontNum >= 80 && sacPropRestr < 10;
  const sacMedio = sacScore >= 500 && sacScore < 650 && sacPropRestr < 15;
  const sacFraco = sacScore < 500 || sacPropRestr >= 15;
  const cedForte = cedScore >= 650 && cedPontNum >= 80 && cedPropRestr < 10;

  let tipoRec = 'ESCROW', tipoJust = '';
  if (sacForte) {
    tipoRec = 'ANUÊNCIA';
    tipoJust = `Sacado forte (score ${sacScore}, pont. ${sacPont || 'N/D'}%, restr. ${sacPropRestr.toFixed(1)}%). Anuência concentra risco no sacado confiável.`;
  } else if (sacMedio) {
    tipoRec = 'ESCROW';
    tipoJust = `Risco balanceado. Sacado médio (score ${sacScore || 'N/D'}). Escrow protege a operação.`;
  } else if (sacFraco && cedForte) {
    tipoRec = 'COMISSIONÁRIA';
    tipoJust = `Sacado fraco (score ${sacScore || 'N/D'}), cedente forte (score ${cedScore}). Comissionária concentra risco no cedente confiável. Uso excepcional.`;
  } else {
    tipoRec = 'ESCROW';
    tipoJust = `Escrow como padrão seguro. Sacado score ${sacScore || 'N/D'}, cedente score ${cedScore || 'N/D'}.`;
  }

  const venc = gv('lastro-vencimento') || '';
  let vencDias = 0, vencLabel = '';
  if (venc) {
    const p = venc.split('/');
    if (p.length === 3) {
      vencDias = Math.floor((Date.now() - new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime()) / 864e5);
      vencLabel = vencDias > 0 ? `VENCIDO (${vencDias} dias)` : 'A vencer';
    }
  }

  return {
    cedFat, sacFat, cedRestr, sacRestr, cedPropRestr, sacPropRestr,
    cedScore, sacScore, limiteCed, limiteSac, limiteOp, risk, taxa,
    tipoRec, tipoJust, venc, vencDias, vencLabel,
  };
}


// ── Painel de exibição do parecer consultivo da IA ─────────────────────────────
function AiParecerView({ p, model, onRegen, regenerating, onAjustar, ajustando, pergunta, nota, campos, token, ultimaCorrecao }: {
  p: AiParecer; model: string; onRegen: () => void; regenerating: boolean;
  onAjustar: (texto: string) => void; ajustando: boolean;
  pergunta: string | null; nota: string | null; campos: string[];
  token: string; ultimaCorrecao: string;
}) {
  const [correcao, setCorrecao] = useState('');
  const enviarAjuste = () => { if (correcao.trim()) { onAjustar(correcao); setCorrecao(''); } };
  const CAMPO_LABEL: Record<string, string> = {
    recomendacao: 'Recomendação', confianca: 'Confiança', taxa_sugerida: 'Taxa', limite_sugerido: 'Limite',
    tipo_operacao: 'Tipo de operação', resumo: 'Resumo', pontos_fortes: 'Pontos fortes',
    pontos_atencao: 'Pontos de atenção', condicionantes_sugeridas: 'Condicionantes', alertas: 'Alertas', argumentacao: 'Argumentação',
  };
  const recMap: Record<string, { label: string; bg: string; fg: string; icon: ReactNode }> = {
    aprovado:       { label: 'Aprovar',                bg: '#DCFCE7', fg: '#166534', icon: <IconCheckCircle size={24} /> },
    condicionantes: { label: 'Aprovar c/ condicionantes', bg: '#FEF9C3', fg: '#854D0E', icon: <IconAlert size={24} /> },
    reprovado:      { label: 'Reprovar',               bg: '#FEE2E2', fg: '#991B1B', icon: <IconXCircle size={24} /> },
  };
  const rec = recMap[String(p.recomendacao)] ?? { label: String(p.recomendacao ?? '-'), bg: '#F3F4F6', fg: '#374151', icon: <IconHelp size={24} /> };
  const confMap: Record<string, string> = { alta: 'Confiança alta', media: 'Confiança média', baixa: 'Confiança baixa' };
  const fmtR = (n?: number | null) => (typeof n === 'number' && isFinite(n))
    ? 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  const temFortes = (p.pontos_fortes?.length ?? 0) > 0;
  const temAtencao = (p.pontos_atencao?.length ?? 0) > 0;

  return (
    <div className="aip-report">
      {/* Banner de resultado */}
      <div className="aip-banner" style={{ background: rec.bg, color: rec.fg }}>
        <div className="aip-banner-icon">{rec.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="aip-banner-label">Parecer consultivo · sugestão da IA</div>
          <div className="aip-banner-rec">{rec.label}</div>
        </div>
        {p.confianca && (
          <span className="aip-conf">{confMap[String(p.confianca)] ?? `Confiança: ${p.confianca}`}</span>
        )}
      </div>

      {/* Métricas-chave */}
      <div className="aip-metrics">
        <div className="aip-metric">
          <div className="aip-metric-label">Taxa sugerida</div>
          <div className="aip-metric-value">{p.taxa_sugerida ? p.taxa_sugerida : '-'}{p.taxa_sugerida && <span className="aip-metric-unit"> % a.m.</span>}</div>
        </div>
        <div className="aip-metric">
          <div className="aip-metric-label">Limite sugerido</div>
          <div className="aip-metric-value">{fmtR(p.limite_sugerido)}</div>
        </div>
        <div className="aip-metric">
          <div className="aip-metric-label">Tipo de operação</div>
          <div className="aip-metric-value">{p.tipo_operacao || '-'}</div>
        </div>
      </div>

      {/* Resumo executivo */}
      {p.resumo && (
        <div className="aip-callout">
          <div className="aip-callout-label">Resumo executivo</div>
          <p>{p.resumo}</p>
        </div>
      )}

      {/* Alertas críticos */}
      {p.alertas && p.alertas.length > 0 && (
        <div className="aip-alert">
          <div className="aip-alert-title"><IconAlertOctagon size={12} /> Alertas críticos</div>
          <ul>{p.alertas.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}

      {/* Pontos fortes × atenção (2 colunas) */}
      {(temFortes || temAtencao) && (
        <div className="aip-cols">
          {temFortes && (
            <div className="aip-listcard pos">
              <div className="aip-listcard-title">Pontos fortes</div>
              <ul>{p.pontos_fortes!.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {temAtencao && (
            <div className="aip-listcard warn">
              <div className="aip-listcard-title">Pontos de atenção</div>
              <ul>{p.pontos_atencao!.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {/* Condicionantes */}
      {p.condicionantes_sugeridas && p.condicionantes_sugeridas.length > 0 && (
        <div className="aip-sec">
          <div className="aip-sec-title">Condicionantes sugeridas</div>
          <div className="aip-conds">
            {p.condicionantes_sugeridas.map((c, i) => (
              <div key={i} className="aip-cond">
                <span className={`aip-tag t-${String(c.tipo || '').toLowerCase()}`}>{c.tipo}</span>
                <span className="aip-cond-text">{c.texto}</span>
                <span className="aip-cond-resp">{c.resp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Argumentação técnica */}
      {p.argumentacao && (
        <div className="aip-sec">
          <div className="aip-sec-title">Argumentação técnica</div>
          <p className="aip-arg">{p.argumentacao}</p>
        </div>
      )}

      {/* Última alteração aplicada (patch incremental) */}
      {nota && (
        <div style={{ marginTop: 12, padding: '10px 12px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#1E40AF', marginBottom: 3 }}><IconEdit size={12} /> Ajuste aplicado</div>
          <p style={{ fontSize: 13, color: '#1E3A8A', margin: 0, lineHeight: 1.5 }}>{nota}</p>
          {campos.length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {campos.map((c, i) => (
                <span key={i} style={{ fontSize: 10.5, fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', borderRadius: 999, padding: '2px 8px' }}>
                  {CAMPO_LABEL[c] ?? c}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loop de correção: campo + pergunta de esclarecimento da IA */}
      <div className="aip-foot">
        {pergunta && (
          <div style={{ marginBottom: 8, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 3 }}><IconHelp size={12} /> A IA precisa de um esclarecimento</div>
            <p style={{ fontSize: 13.5, color: '#78350F', margin: 0, lineHeight: 1.5 }}>{pergunta}</p>
          </div>
        )}
        <label style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
          {pergunta ? 'Sua resposta' : 'Solicitar ajuste / apontar correção'}
        </label>
        <textarea
          className="ac-textarea"
          rows={2}
          style={{ marginTop: 4 }}
          placeholder={pergunta
            ? 'Responda à pergunta da IA…'
            : 'Ex.: "o faturamento é anual, não mensal" ou "o sacado é do mesmo grupo do cedente"'}
          value={correcao}
          onChange={e => setCorrecao(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) enviarAjuste(); }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="ac-btn primary sm" onClick={enviarAjuste} disabled={ajustando || !correcao.trim()}>
            {ajustando
              ? <><IconSpinner size={13} /> Ajustando…</>
              : pergunta ? <><IconReply size={13} /> Responder</> : <><IconEdit size={13} /> Ajustar parecer</>}
          </button>
          <button className="ac-btn outline sm" onClick={onRegen} disabled={regenerating || ajustando}>
            {regenerating ? <><IconSpinner size={13} /> Gerando…</> : <><IconRefresh size={13} /> Gerar do zero</>}
          </button>
          <span style={{ fontSize: 11, color: '#9CA3AF' }}>
            A IA ajusta só o que a correção afeta{model ? ` · ${model}` : ''}
          </span>
        </div>

        {/* Aprendizado permanente: transforma a correção numa regra da casa */}
        <SalvarRegraPanel token={token} sugestao={ultimaCorrecao} />
      </div>
    </div>
  );
}

// Animação de carregamento do parecer - dá feedback do que a IA está fazendo.
const AI_STEPS: { icon: ReactNode; txt: string }[] = [
  { icon: <IconSearch size={14} />,     txt: 'Lendo os relatórios DEPS (cedente e sacado)…' },
  { icon: <IconDoc size={14} />,        txt: 'Analisando balanço, faturamento e lastro…' },
  { icon: <IconScale size={14} />,      txt: 'Cruzando cedente × sacado × restrições…' },
  { icon: <IconCalculator size={14} />, txt: 'Avaliando risco, taxa e limite sugeridos…' },
  { icon: <IconEdit size={14} />,       txt: 'Redigindo o parecer e as condicionantes…' },
];
const AI_READ_STEPS: { icon: ReactNode; txt: string }[] = [
  { icon: <IconSearch size={14} />,  txt: 'Lendo texto e OCR no navegador (sem custo)…' },
  { icon: <IconUpload size={14} />,  txt: 'Enviando os documentos…' },
  { icon: <IconReceipt size={14} />, txt: 'Interpretando cada documento separadamente…' },
  { icon: <IconShuffle size={14} />, txt: 'Cruzando as duas leituras e checando divergências…' },
  { icon: <IconEdit size={14} />,    txt: 'Preenchendo os campos da análise…' },
];
function AiParecerLoading({ title = 'Analisando os documentos…', steps = AI_STEPS, nota }: { title?: string; steps?: { icon: ReactNode; txt: string }[]; nota?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(v => Math.min(v + 1, steps.length - 1)), 2200);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div style={{ border: '1px solid #E3E4DE', borderRadius: 12, padding: 16, background: '#FBFBF9', marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="ac-spinner" />
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1F2937' }}>{title}</span>
      </div>
      {nota && (
        <div style={{ fontSize: 12.5, color: 'var(--ac-g500)', margin: '-6px 0 12px', paddingLeft: 32 }}>{nota}</div>
      )}

      {/* Etapas - o que a IA está fazendo agora */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {steps.map((s, idx) => {
          const done = idx < i, current = idx === i;
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: done || current ? 1 : 0.4, transition: 'opacity .3s' }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800,
                background: done ? '#DCFCE7' : current ? '#EDE9FE' : '#F3F4F6',
                color: done ? '#166534' : current ? '#6D28D9' : '#9CA3AF',
              }}>
                {done ? <IconCheck size={12} /> : current ? <span className="ac-spinner ac-spinner-sm" /> : idx + 1}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: current ? 700 : 500, color: done ? '#166534' : current ? '#1F2937' : '#9CA3AF' }}>
                <span style={{ display: 'inline-flex', flexShrink: 0 }}>{s.icon}</span> {s.txt}
              </span>
            </div>
          );
        })}
      </div>

      {/* Skeleton shimmer do parecer que virá */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <span className="ac-skel" style={{ width: 150, height: 26, borderRadius: 999 }} />
        <span className="ac-skel" style={{ width: 120, height: 26, borderRadius: 999 }} />
      </div>
      <span className="ac-skel" style={{ display: 'block', width: '90%', height: 12, marginBottom: 8 }} />
      <span className="ac-skel" style={{ display: 'block', width: '75%', height: 12, marginBottom: 16 }} />
      <span className="ac-skel" style={{ display: 'block', width: 130, height: 11, marginBottom: 8 }} />
      <span className="ac-skel" style={{ display: 'block', width: '100%', height: 11, marginBottom: 6 }} />
      <span className="ac-skel" style={{ display: 'block', width: '95%', height: 11, marginBottom: 6 }} />
      <span className="ac-skel" style={{ display: 'block', width: '85%', height: 11 }} />
    </div>
  );
}

// Painel "salvar como regra permanente" - grava no Turso com checagem de conflito por IA
type Conflito = { id: number; motivo: string; instrucao: string; escopo: string };
function SalvarRegraPanel({ token, sugestao }: { token: string; sugestao: string }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [categoria, setCategoria] = useState<'interpretacao' | 'decisao' | 'extracao'>('interpretacao');
  const [escopo, setEscopo] = useState('global');
  const [instrucao, setInstrucao] = useState('');
  const [checando, setChecando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [conflitos, setConflitos] = useState<Conflito[] | null>(null);
  const [substituir, setSubstituir] = useState<Set<number>>(new Set());

  function abrir() {
    setAberto(true);
    if (!instrucao && sugestao) setInstrucao(sugestao);
  }
  function toggleSub(id: number) {
    setSubstituir(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function verificar() {
    if (!instrucao.trim()) return;
    setChecando(true);
    try {
      const res = await fetch('/api/ai-parecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ conflito: true, categoria, escopo, instrucao: instrucao.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast('error', 'Falha ao checar conflitos', data?.error ?? `Erro ${res.status}`); return; }
      const c: Conflito[] = data.conflitos ?? [];
      setConflitos(c);
      setSubstituir(new Set(c.map(x => x.id))); // por padrão, marca todas para substituir
      if (c.length === 0) toast('success', 'Sem conflitos', 'A regra não contradiz nenhuma regra ativa.');
    } catch (e: any) {
      toast('error', 'Falha ao checar conflitos', e?.message);
    } finally {
      setChecando(false);
    }
  }

  async function salvar() {
    if (!instrucao.trim()) return;
    setSalvando(true);
    try {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({
          action: 'salvar_diretriz', categoria, escopo: escopo.trim() || 'global',
          instrucao: instrucao.trim(), origem: 'correção do operador (parecer)',
          substitui_ids: [...substituir],
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast('error', 'Falha ao salvar regra', data?.error ?? `Erro ${res.status}`); return; }
      toast('success', 'Regra salva', substituir.size ? `Nova regra ativa; ${substituir.size} substituída(s).` : 'A partir de agora ela vale para as próximas análises.');
      setAberto(false); setInstrucao(''); setConflitos(null); setSubstituir(new Set()); setEscopo('global');
    } catch (e: any) {
      toast('error', 'Falha ao salvar regra', e?.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <button className="ac-btn outline sm" style={{ marginTop: 10 }} onClick={abrir}>
        <IconSave size={13} /> Salvar como regra permanente
      </button>
    );
  }

  return (
    <div style={{ marginTop: 10, padding: 14, border: '1px solid var(--ac-g200)', borderRadius: 10, background: '#F7F7FB' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#4338CA', marginBottom: 8 }}><IconSave size={12} /> Salvar como regra permanente</div>
      <p style={{ fontSize: 12, color: 'var(--ac-g500)', margin: '0 0 10px' }}>
        Vira uma diretriz da casa (salva no banco) e passa a valer para <strong>todas as próximas análises</strong>.
      </p>

      <div className="ac-grid cols-2" style={{ marginBottom: 8 }}>
        <div className="ac-fg">
          <label>Categoria</label>
          <select className="ac-input" value={categoria} onChange={e => { setCategoria(e.target.value as any); setConflitos(null); }}>
            <option value="interpretacao">Interpretação (como ler/avaliar dados)</option>
            <option value="decisao">Decisão / política (taxa, limite, exigências)</option>
            <option value="extracao">Extração (como ler os documentos)</option>
          </select>
        </div>
        <div className="ac-fg">
          <label>Escopo</label>
          <input className="ac-input" value={escopo} onChange={e => { setEscopo(e.target.value); setConflitos(null); }}
            placeholder="global, segmento:construção, produto:escrow…" />
        </div>
      </div>

      <div className="ac-fg" style={{ marginBottom: 8 }}>
        <label>Regra</label>
        <textarea className="ac-textarea" rows={2} value={instrucao}
          onChange={e => { setInstrucao(e.target.value); setConflitos(null); }}
          placeholder="Ex.: recompra sempre exige aval do sócio" />
      </div>

      {/* Resultado da checagem de conflito */}
      {conflitos && conflitos.length > 0 && (
        <div style={{ marginBottom: 10, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400E', marginBottom: 6 }}><IconAlert size={12} /> Conflito com {conflitos.length} regra(s) ativa(s)</div>
          {conflitos.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, padding: '5px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={substituir.has(c.id)} onChange={() => toggleSub(c.id)} style={{ marginTop: 2 }} />
              <span>
                <span style={{ color: '#78350F' }}>“{c.instrucao}” <em style={{ color: '#9CA3AF' }}>[{c.escopo}]</em></span>
                <br /><span style={{ color: '#92400E', fontSize: 11.5 }}>{c.motivo}</span>
                <br /><span style={{ fontSize: 11, fontWeight: 700, color: substituir.has(c.id) ? '#B91C1C' : '#6B7280' }}>{substituir.has(c.id) ? 'Será substituída' : 'Será mantida (coexiste)'}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      {conflitos && conflitos.length === 0 && (
        <div style={{ marginBottom: 10, fontSize: 12.5, color: '#166534', fontWeight: 600 }}><IconCheck size={12} /> Sem conflitos com as regras ativas.</div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="ac-btn outline sm" onClick={verificar} disabled={checando || !instrucao.trim()}>
          {checando ? <><IconSpinner size={13} /> Verificando…</> : <><IconSearch size={13} /> Verificar conflitos (IA)</>}
        </button>
        <button className="ac-btn primary sm" onClick={salvar} disabled={salvando || !instrucao.trim()}>
          {salvando ? <><IconSpinner size={13} /> Salvando…</> : <><IconSave size={13} /> Salvar regra</>}
        </button>
        <button className="ac-btn outline sm" onClick={() => setAberto(false)} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  );
}

export default function AnaliseCreditoPage({ token }: { token: string }) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<FileRow[]>([]);
  const [iaReading, setIaReading] = useState(false); // extração via IA (Vision) em andamento
  const [iaProgresso, setIaProgresso] = useState(''); // etapa corrente da leitura híbrida
  // Campos que a leitura marcou para conferência (confiança baixa, conflito
  // entre documentos ou divergência entre imagem e texto extraído localmente)
  const [revisar, setRevisar] = useState<Set<string>>(new Set());
  const [avisosLeitura, setAvisosLeitura] = useState<AvisoCampo[]>([]);
  const [confirmInterpret, setConfirmInterpret] = useState(false); // modal de confirmação ao avançar
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null); // preview de anexo em modal central
  const interpretAbort = useRef<AbortController | null>(null);
  const [analise, setAnalise] = useState('');
  const [docsFaltantes, setDocsFaltantes] = useState<string[]>([]);
  const [adeqs, setAdeqs] = useState<Adeq[]>([]);
  const [validado, setValidado] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [solicitacao, setSolicitacao] = useState<SolicitacaoItem | null>(null);
  const [loadingSol, setLoadingSol] = useState(false);
  // Produto/módulo DEPS - único, aplicado a cedente e sacado na consulta em bloco.
  const [depsProduto, setDepsProduto] = useState(PRODUTOS_DEPS[0].id);
  const [depsLoading, setDepsLoading] = useState<null | 'ced' | 'sac'>(null);
  // `motivo` separa "não havia consulta reaproveitável" de "o analista pediu para
  // atualizar" - as duas geram consulta paga, mas o aviso precisa ser diferente.
  const [depsConfirm, setDepsConfirm] = useState<null | { alvos: ('ced' | 'sac')[]; motivo: 'sem-reuso' | 'atualizar' }>(null);
  // Consulta reaproveitável encontrada: pergunta se reaproveita (grátis) ou gera nova
  // (com custo), mostrando a data da última consulta daquele CNPJ.
  const [depsReuseFound, setDepsReuseFound] = useState<null | { alvo: 'ced' | 'sac'; dataConsulta: string; payload: any }>(null);
  const [depsRaw, setDepsRaw] = useState<{ ced: DepsEntry | null; sac: DepsEntry | null }>({ ced: null, sac: null });
  // Preview embutido do relatório oficial da DEPS (iframe do portal).
  const [depsPreview, setDepsPreview] = useState<{ nome: string; url: string } | null>(null);
  // Parecer consultivo gerado pela IA (Anthropic) - sugestão; operador é quem decide
  const [aiParecer, setAiParecer] = useState<AiParecer | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiModel, setAiModel] = useState('');
  // Loop de ajuste incremental do parecer (correção do operador → pergunta ou patch)
  const [aiAjustando, setAiAjustando] = useState(false);
  const [aiPergunta, setAiPergunta] = useState<string | null>(null); // pergunta de esclarecimento da IA
  const [aiNota, setAiNota] = useState<string | null>(null);          // "o que mudou" no último ajuste
  const [aiCampos, setAiCampos] = useState<string[]>([]);             // campos alterados no último ajuste
  const [aiMensagens, setAiMensagens] = useState<{ autor: 'operador' | 'ia'; texto: string }[]>([]);
  // Análise corrente × histórico consultável × base de regras da casa
  const [view, setView] = useState<ViewId>('nova');
  // Protocolo do parecer atual - fixado ao chegar na etapa Parecer para que o
  // número exibido seja o mesmo que vai para o banco.
  const [protocolo, setProtocolo] = useState('');
  const [salvandoAnalise, setSalvandoAnalise] = useState(false);
  const [analiseSalva, setAnaliseSalva] = useState<{ id: number; protocolo: string; criado_em: string } | null>(null);
  const [anexoProgresso, setAnexoProgresso] = useState(''); // "3/7" enquanto os anexos sobem

  const gv = (id: string) => form[id] ?? '';
  const set = (id: string, val: string) => setForm(p => ({ ...p, [id]: val }));
  const toggleCheck = (id: string) => setChecks(p => ({ ...p, [id]: !p[id] }));

  const dec = useMemo(() => computeDecisao(gv), [form]);

  // Parcelas da solicitação (quando parcelada) - para exibir o detalhamento
  const parcelasList = useMemo<Array<{ valor?: string; valorNumerico?: number; vencimento?: string }> | null>(() => {
    try {
      const p = solicitacao?.parcelas ? JSON.parse(solicitacao.parcelas) : null;
      return Array.isArray(p) && p.length > 0 ? p : null;
    } catch { return null; }
  }, [solicitacao]);

  // ── Checklist documental AUTOMÁTICO ─────────────────────────────────────────
  // Não é mais manual: o motor de crédito classifica cada documento (detectTipo em
  // creditParser) e extrai os campos. Derivamos daqui, por item, se foi atendido e
  // por qual fonte (documento classificado ou dado extraído).
  const autoChecks = useMemo<Record<string, CkStatus>>(() => {
    const done = files.filter(f => f.status === 'done');
    const docByType = (t: string) => done.find(f => f.type === t);
    const g = (id: string) => (form[id] ?? '').toString().trim() !== '';
    const mk = (docType: string | null, dataOk: boolean, dataLabel: string): CkStatus => {
      const d = docType ? docByType(docType) : undefined;
      if (d) return { ok: true, via: d.name, kind: 'doc' };
      if (dataOk) return { ok: true, via: dataLabel, kind: 'data' };
      return { ok: false };
    };
    return {
      'ck-identidade':  mk('Identidade (CNH/RG)', g('ced-repr-nome') || g('ced-repr-cpf'), 'dados do representante'),
      'ck-contrato':    mk('Contrato Social', g('ced-razao') && g('ced-cnpj'), 'razão social + CNPJ'),
      'ck-endereco':    mk('Comprovante de Endereço', g('ced-endereco'), 'endereço extraído'),
      'ck-financeiro':  mk('Balanço/DRE', g('ced-pl') || g('ced-liq-real') || g('ced-cap-giro'), 'indicadores financeiros'),
      'ck-faturamento': mk(null, g('ced-fat-total') || g('ced-fat-presumido'), 'faturamento extraído'),
      'ck-irpj':        mk('IRPJ/ECF/DEFIS', false, ''),
      'ck-bancario':    mk('Dados Bancários', g('ced-banco'), 'dados bancários extraídos'),
      'ck-deps-ced':    mk(null, g('ced-score') || g('ced-class'), 'DEPs do cedente'),
      'ck-deps-sac':    mk(null, g('sac-score') || g('sac-class'), 'DEPs do sacado'),
      'ck-lastro':      mk('Nota Fiscal', g('lastro-numero') || g('lastro-valor'), 'lastro extraído'),
    };
  }, [files, form]);

  // Versão booleana (compatível com o Parecer / documentos faltantes)
  const checkBools = useMemo(
    () => Object.fromEntries(Object.entries(autoChecks).map(([k, v]) => [k, v.ok])) as Record<string, boolean>,
    [autoChecks],
  );

  // ── Parecer consultivo da IA (Anthropic) ────────────────────────────────────
  // Reúne todo o contexto da análise (cadastro, DEPS, lastro, motor de risco) e
  // pede uma opinião embasada. É SUGESTÃO - o operador continua decidindo.
  function buildAiContexto() {
    return {
      solicitacao: solicitacao
        ? { id: solicitacao.id, valor: solicitacao.valor, prazo_limite: solicitacao.prazo_limite }
        : null,
      campos: form, // ced-*, sac-*, lastro-*, dec-*
      motor_risco: dec, // saída do computeDecisao (risco/taxa/limite/tipo sugeridos por regra)
      deps: {
        cedente: depsRaw.ced?.norm ?? null,
        sacado: depsRaw.sac?.norm ?? null,
      },
      // Dossiê extraído do payload BRUTO: regras do parecer da DEPS, ocorrência
      // por ocorrência das pendências, sócios com data de entrada, pontualidade
      // mês a mês. O `deps` acima só tem os ~15 campos normalizados.
      deps_completo: {
        cedente: depsRaw.ced?.resultado ? buildDepsAiDossier(depsRaw.ced.resultado) : null,
        sacado: depsRaw.sac?.resultado ? buildDepsAiDossier(depsRaw.sac.resultado) : null,
      },
      documentos: files.filter(f => f.status === 'done').map(f => ({ nome: f.name, tipo: f.type || 'Documento' })),
      documentos_faltantes: docsFaltantes,
      analise_preliminar: analise,
    };
  }

  // Mantém o corpo do parecer sob o teto de request da Vercel (≈4,5MB) - dossiês DEPS
  // de empresas grandes podem inflar o payload. Poda do bloco menos essencial ao mais,
  // sempre avisando a IA (_podado) para ela saber que algo foi resumido.
  function podarContexto(ctx: any): any {
    const TETO = 1_800_000; // folga confortável sob o limite da plataforma
    const tamanho = (o: any) => { try { return JSON.stringify(o).length; } catch { return 0; } };
    if (tamanho(ctx) <= TETO) return ctx;

    const podado: string[] = [];
    const c: any = { ...ctx };

    // 1) `deps` resumido é redundante com `deps_completo`
    if (c.deps) { delete c.deps; podado.push('deps resumido'); }
    if (tamanho(c) <= TETO) return { ...c, _podado: podado };

    // 2) enxuga os dossiês DEPS bloco a bloco (do menos ao mais essencial)
    const blocos = ['blocos_nao_mapeados', 'empresas_dos_socios', 'risco_instituicoes_financeiras',
      'endividamento_mensal', 'pontualidade_mensal', 'contatos', 'emails', 'quadro_societario'];
    if (c.deps_completo) {
      c.deps_completo = { cedente: c.deps_completo.cedente ? { ...c.deps_completo.cedente } : null,
                          sacado: c.deps_completo.sacado ? { ...c.deps_completo.sacado } : null };
      for (const b of blocos) {
        if (tamanho(c) <= TETO) break;
        let cortou = false;
        if (c.deps_completo.cedente && c.deps_completo.cedente[b] !== undefined) { delete c.deps_completo.cedente[b]; cortou = true; }
        if (c.deps_completo.sacado && c.deps_completo.sacado[b] !== undefined) { delete c.deps_completo.sacado[b]; cortou = true; }
        if (cortou) podado.push(`dossiê: ${b}`);
      }
    }
    if (tamanho(c) <= TETO) return { ...c, _podado: podado };

    // 3) trunca a análise preliminar
    if (typeof c.analise_preliminar === 'string' && c.analise_preliminar.length > 12000) {
      c.analise_preliminar = c.analise_preliminar.slice(0, 12000) + '\n…(truncado por tamanho)';
      podado.push('análise preliminar truncada');
    }
    if (tamanho(c) <= TETO) return { ...c, _podado: podado };

    // 4) último recurso: remove o dossiê completo, mantendo o deps resumido (pequeno)
    if (c.deps_completo) {
      delete c.deps_completo;
      c.deps = ctx.deps ?? null;
      podado.push('dossiê DEPS completo removido - usando deps resumido');
    }
    return { ...c, _podado: podado };
  }

  async function gerarParecerIA() {
    setAiLoading(true);
    setAiError('');
    // Nova geração zera o histórico de ajuste
    setAiMensagens([]); setAiPergunta(null); setAiNota(null); setAiCampos([]);
    try {
      const res = await fetch('/api/ai-parecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ contexto: podarContexto(buildAiContexto()) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const msg = data?.error ?? `Erro ${res.status}`;
        setAiError(msg);
        toast('error', 'Falha ao gerar parecer da IA', msg);
        return;
      }
      setAiParecer(data.parecer as AiParecer);
      setAiModel(String(data.model ?? ''));
      toast('success', 'Parecer da IA gerado', 'Confira as conclusões e argumentações antes de decidir.');
    } catch (err: any) {
      const msg = err?.message ?? 'Erro de rede';
      setAiError(msg);
      toast('error', 'Falha ao gerar parecer da IA', msg);
    } finally {
      setAiLoading(false);
    }
  }

  // Ajuste incremental: envia a correção do operador; a IA ou pergunta (se vago)
  // ou devolve um patch com só os campos afetados (o resto do parecer é preservado).
  async function ajustarParecer(texto: string) {
    const msg = texto.trim();
    if (!msg || !aiParecer) return;
    const mensagens = [...aiMensagens, { autor: 'operador' as const, texto: msg }];
    setAiMensagens(mensagens);
    setAiAjustando(true);
    setAiError('');
    try {
      const res = await fetch('/api/ai-parecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ ajuste: true, contexto: podarContexto(buildAiContexto()), parecer_atual: aiParecer, mensagens }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        const m = data?.error ?? `Erro ${res.status}`;
        setAiError(m);
        toast('error', 'Falha ao ajustar parecer', m);
        return;
      }
      const aj = data.ajuste ?? {};
      if (aj.acao === 'perguntar' && aj.pergunta) {
        setAiPergunta(String(aj.pergunta));
        setAiMensagens(prev => [...prev, { autor: 'ia', texto: String(aj.pergunta) }]);
        setAiNota(null); setAiCampos([]);
        return;
      }
      // acao === 'ajustar' → aplica o patch (merge dos campos afetados)
      const patch = (aj.patch && typeof aj.patch === 'object') ? aj.patch : {};
      setAiParecer(prev => ({ ...(prev ?? {}), ...patch }));
      setAiCampos(Array.isArray(aj.campos_alterados) ? aj.campos_alterados : Object.keys(patch));
      const nota = aj.nota ? String(aj.nota) : 'Parecer ajustado.';
      setAiNota(nota);
      setAiPergunta(null);
      setAiMensagens(prev => [...prev, { autor: 'ia', texto: nota }]);
      toast('success', 'Parecer ajustado', nota);
    } catch (err: any) {
      const m = err?.message ?? 'Erro de rede';
      setAiError(m);
      toast('error', 'Falha ao ajustar parecer', m);
    } finally {
      setAiAjustando(false);
    }
  }

  // ── Histórico: gravação da análise validada ─────────────────────────────────
  // Fixa o protocolo ao entrar na etapa Parecer (antes ele era recalculado a cada
  // render, então o número mudava sozinho na tela).
  useEffect(() => {
    if (step === 5 && !protocolo) setProtocolo(novoProtocolo());
  }, [step, protocolo]);

  // Sobe os documentos da análise para o histórico, um pedaço por requisição.
  // Roda DEPOIS de a análise já estar gravada: se um anexo falhar, o parecer
  // continua salvo e o operador é avisado de qual arquivo faltou.
  async function enviarAnexos(analiseId: number, anexos: FileRow[]): Promise<string[]> {
    const CHUNK = 3_000_000; // ~3 MB por requisição (mesmo teto da interpretação)
    const post = (payload: any) => fetch('/api/admin-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(payload),
    });
    const falhas: string[] = [];
    for (let i = 0; i < anexos.length; i++) {
      const f = anexos[i];
      setAnexoProgresso(`${i + 1}/${anexos.length}`);
      try {
        const blob = await (await fetch(f.url!)).blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string); // data URL - preserva o mime na leitura
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const fileId = `${analiseId}-${i}-${base64.length}`;
        for (let seq = 0, off = 0; off < base64.length; seq++, off += CHUNK) {
          const up = await post({
            action: 'analise_arquivo_chunk',
            analise_id: analiseId, file_id: fileId, seq, chunk: base64.slice(off, off + CHUNK),
          });
          if (!up.ok) {
            const e = await up.json().catch(() => null);
            throw new Error(e?.error ?? `erro ${up.status}`);
          }
        }
        const fim = await post({
          action: 'analise_arquivo_finalize',
          analise_id: analiseId, file_id: fileId,
          arquivo: {
            nome: f.name, tipo: f.type || null, mime: f.mime || blob.type || null,
            tamanho: f.size, categoria: f.categoria ?? null, origem: f.origem ?? 'manual',
          },
        });
        if (!fim.ok) {
          const e = await fim.json().catch(() => null);
          throw new Error(e?.error ?? `erro ${fim.status}`);
        }
      } catch (e: any) {
        console.error('[analise] falha ao anexar documento ao histórico', f.name, e);
        falhas.push(f.name);
      }
    }
    setAnexoProgresso('');
    return falhas;
  }

  // Relatórios DEPS como arquivo do histórico. A DEPS não expõe PDF pela API
  // (só o link do portal), então gravamos o relatório da plataforma - mesmos
  // dados oficiais da consulta, com o link do relatório completo no rodapé.
  function depsAnexosArquivo(): FileRow[] {
    return depsAnexos.map((a, i) => {
      const html = buildDepsReportHTML(a.alvo, {
        norm: a.norm, nome: a.nome, documento: a.documento, produto: a.produto,
        reutilizou: a.reutilizou, linkPortal: a.link, dataConsulta: a.dataConsulta,
      });
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const papel = a.alvo === 'ced' ? 'cedente' : 'sacado';
      return {
        name: `anexo-${(ROMANOS[i] ?? String(i + 1)).toLowerCase()}-relatorio-deps-${papel}.html`,
        size: blob.size,
        status: 'done',
        type: `Relatório DEPS · ${papel}`,
        url: URL.createObjectURL(blob),
        mime: 'text/html',
        categoria: 'DEPS',
        origem: 'deps',
      } as FileRow;
    });
  }

  async function salvarAnalise() {
    const status = gv('dec-status');
    if (!status) { toast('error', 'Sem status de decisão', 'Selecione Aprovado / Condicionantes / Reprovado na etapa Decisão.'); return; }
    const proto = protocolo || novoProtocolo();
    if (!protocolo) setProtocolo(proto);
    setSalvandoAnalise(true);
    try {
      const snapshot: AnaliseSnapshot = {
        form, checks: checkBools, adeqs, docsFaltantes, solicitacao, dec,
        analise_preliminar: analise,
        deps: { ced: depsRaw.ced?.norm ?? null, sac: depsRaw.sac?.norm ?? null },
        deps_anexos: depsAnexos,
      };
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({
          action: 'salvar_analise',
          protocolo: proto,
          solicitacao_id: solicitacao?.id ?? null,
          cedente_nome: solicitacao?.cedente_nome ?? solicitacao?.nome_contratado ?? gv('op-cedente-nome'),
          cedente_cnpj: solicitacao?.cedente_cnpj ?? solicitacao?.cnpj_contratado ?? gv('op-cedente-cnpj'),
          sacado_nome: solicitacao?.sacado_razao_social ?? solicitacao?.nome_sacado ?? gv('op-sacado-nome'),
          sacado_cnpj: solicitacao?.sacado_cnpj_db ?? solicitacao?.cnpj_sacado ?? gv('op-sacado-cnpj'),
          valor: gv('op-valor') || solicitacao?.valor || null,
          status,
          risco: dec.risk,
          taxa: gv('dec-taxa') || dec.taxa,
          limite: gv('dec-limite') || null,
          tipo_operacao: gv('dec-tipo-rec') || dec.tipoRec,
          ia_recomendacao: aiParecer?.recomendacao ?? null,
          ia_confianca: aiParecer?.confianca ?? null,
          ia_modelo: aiModel || null,
          parecer_ia: aiParecer ?? null,
          snapshot,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast('error', 'Falha ao salvar no histórico', data?.error ?? `Erro ${res.status}`);
        return;
      }
      setValidado(true);
      const analiseId = Number(data.id);
      setAnaliseSalva({ id: analiseId, protocolo: String(data.protocolo ?? proto), criado_em: String(data.criado_em ?? new Date().toISOString()) });

      // Anexa ao histórico os documentos que a análise leu + os relatórios DEPS
      // que a alimentaram (os mesmos que saem anexados ao final do parecer).
      const anexosDeps = depsAnexosArquivo();
      const anexos = [...files.filter(f => f.status === 'done' && f.url), ...anexosDeps];
      if (analiseId && anexos.length) {
        const falhas = await enviarAnexos(analiseId, anexos);
        anexosDeps.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
        const ok = anexos.length - falhas.length;
        if (falhas.length) {
          toast('info', `${falhas.length} anexo(s) não salvo(s)`, `${falhas.slice(0, 3).join(', ')}${falhas.length > 3 ? '…' : ''} - o parecer ficou salvo sem esse(s) documento(s); os originais seguem na solicitação/cadastro.`);
        }
        toast('success', 'Análise validada e salva', `Protocolo ${data.protocolo ?? proto} · ${ok} anexo(s)${anexosDeps.length ? ` (inclui ${anexosDeps.length} relatório(s) DEPS)` : ''} - consultável na aba Histórico.`);
      } else {
        anexosDeps.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
        toast('success', 'Análise validada e salva', `Protocolo ${data.protocolo ?? proto} - consultável na aba Histórico.`);
      }
    } catch (e: any) {
      toast('error', 'Falha ao salvar no histórico', e?.message ?? 'Erro de rede');
    } finally {
      setSalvandoAnalise(false);
    }
  }

  // Zera tudo para começar uma análise nova
  function resetAnalise() {
    files.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
    setStep(0); setForm({}); setChecks({}); setFilled(new Set()); setFiles([]); setAdeqs([]);
    setAnalise(''); setDocsFaltantes([]); setValidado(false); setSolicitacao(null);
    setDepsRaw({ ced: null, sac: null }); setDepsPreview(null); setDepsConfirm(null);
    setRevisar(new Set()); setAvisosLeitura([]);
    setAiParecer(null); setAiError(''); setAiModel('');
    setAiMensagens([]); setAiPergunta(null); setAiNota(null); setAiCampos([]);
    setProtocolo(''); setAnaliseSalva(null); setAnexoProgresso('');
  }

  // ── Relatório DEPS: visualização, nova aba e anexo ─────────────────────────
  // O payload da consulta traz `linkCompartilhamento`: o relatório no próprio
  // portal da DEPS (público, sem login). É o relatório oficial, completo e
  // interativo, então preferimos ele ao nosso resumo em toda visualização.
  function depsAnexoDe(alvo: 'ced' | 'sac'): DepsAnexo | null {
    const e = depsRaw[alvo];
    if (!e) return null;
    return {
      alvo, nome: e.nome, documento: e.documento, produto: e.produto, norm: e.norm,
      link: depsPortalLink(e.resultado), dataConsulta: depsDataConsulta(e.resultado),
      reutilizou: e.reutilizou,
    };
  }
  const depsAnexos = useMemo(
    () => (['ced', 'sac'] as const).map(depsAnexoDe).filter(Boolean) as DepsAnexo[],
    [depsRaw],
  );

  function depsNomeAlvo(alvo: 'ced' | 'sac'): string {
    return depsRaw[alvo]?.nome || (alvo === 'ced' ? 'Cedente' : 'Sacado');
  }

  // Relatório resumido (montado aqui a partir do normalizado) numa nova aba.
  // Serve de fallback para consultas sem link do portal e de saída em PDF.
  function openDepsResumo(alvo: 'ced' | 'sac', autoPrint = false) {
    const a = depsAnexoDe(alvo);
    if (!a) { toast('info', 'Sem relatório', `Consulte a DEPS do ${alvo === 'ced' ? 'cedente' : 'sacado'} primeiro.`); return; }
    const html = buildDepsReportHTML(alvo, {
      norm: a.norm, nome: a.nome, documento: a.documento, produto: a.produto,
      reutilizou: a.reutilizou, linkPortal: a.link, dataConsulta: a.dataConsulta,
    }, autoPrint);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const w = window.open(url, '_blank');
    if (!w) { URL.revokeObjectURL(url); toast('error', 'Pop-up bloqueado', 'Permita pop-ups para abrir o relatório.'); return; }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // Ver: relatório oficial no preview embutido; sem link, cai no resumo.
  function openDepsReport(alvo: 'ced' | 'sac') {
    const a = depsAnexoDe(alvo);
    if (!a) { toast('info', 'Sem relatório', `Consulte a DEPS do ${alvo === 'ced' ? 'cedente' : 'sacado'} primeiro.`); return; }
    if (a.link) { setDepsPreview({ nome: depsNomeAlvo(alvo), url: a.link }); return; }
    openDepsResumo(alvo);
    toast('info', 'Relatório resumido', 'Esta consulta não trouxe o link do portal da DEPS - abrimos o resumo montado pela plataforma.');
  }

  // Nova aba: vai direto ao portal da DEPS, sem passar pelo preview.
  function openDepsReportTab(alvo: 'ced' | 'sac') {
    const a = depsAnexoDe(alvo);
    if (!a) { toast('info', 'Sem relatório', `Consulte a DEPS do ${alvo === 'ced' ? 'cedente' : 'sacado'} primeiro.`); return; }
    if (a.link) { window.open(a.link, '_blank', 'noopener'); return; }
    openDepsResumo(alvo);
  }
  function viewFile(f: FileRow) {
    if (!f.url) { toast('info', 'Arquivo indisponível', 'O conteúdo deste documento não está em memória.'); return; }
    setPreviewFile(f);
  }
  function downloadFile(f: FileRow) {
    if (!f.url) { toast('info', 'Arquivo indisponível', 'O conteúdo deste documento não está em memória.'); return; }
    const a = document.createElement('a');
    a.href = f.url; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
  }
  function removeFile(f: FileRow) {
    if (f.url) URL.revokeObjectURL(f.url);
    setFiles(prev => prev.filter(x => x.name !== f.name));
    if (previewFile?.name === f.name) setPreviewFile(null);
  }
  // Todos os documentos anexados no início (exibidos na etapa Decisão p/ ver/baixar)
  const lastroFiles = useMemo(
    () => files.filter(f => f.status === 'done' && f.url),
    [files],
  );

  // ── Anexação de documentos ──────────────────────────────────────────────────
  // Só registra os arquivos (com object URL p/ preview/download). A leitura e o
  // preenchimento acontecem via IA (Vision) ao clicar em "Próximo → Interpretar".
  async function processFiles(newFiles: File[]) {
    if (newFiles.length === 0) return;
    setFiles(prev => [
      ...prev,
      ...newFiles.map(f => ({
        name: f.name, size: f.size, status: 'done' as const, url: URL.createObjectURL(f), mime: f.type,
        categoria: (f as any)._categoria ?? undefined,
        // De onde o documento veio para a mesa - vai para o histórico junto do anexo.
        origem: ((f as any)._origem ?? 'manual') as FileOrigem,
      })),
    ]);
  }

  // ── Leitura HÍBRIDA dos documentos (ao AVANÇAR do Upload) ───────────────────
  // 1) No navegador, de graça: camada de texto do PDF (pdfjs) ou OCR (tesseract)
  //    para escaneados/imagens.
  // 2) No servidor, UM documento por chamada: a imagem/PDF vai junto com esse
  //    texto e com as âncoras de identidade da operação (quem é cedente, quem é
  //    sacado). O modelo reconcilia as duas leituras e devolve confiança + fonte
  //    por campo, num schema fixo.
  // 3) Consolidação em código puro (sem token) e uma chamada final de síntese.
  // Cancelável em qualquer ponto.
  async function interpretarEAvancar() {
    setConfirmInterpret(false);
    const alvo = files.filter(f => f.url);
    if (alvo.length === 0) { goStep(1); return; } // sem documentos → segue direto
    const ac = new AbortController();
    interpretAbort.current = ac;
    setIaReading(true);
    setIaProgresso('');
    const sessionId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const post = (body: any) => fetch('/api/analise-credito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    // Âncoras: o que já sabemos da operação. É isso que impede a IA de trocar
    // dados de cedente e sacado em relatórios de crédito de template idêntico.
    const ancoras = {
      cedente_nome: solicitacao?.cedente_nome ?? solicitacao?.nome_contratado ?? gv('op-cedente-nome') ?? null,
      cedente_cnpj: solicitacao?.cedente_cnpj ?? solicitacao?.cnpj_contratado ?? gv('op-cedente-cnpj') ?? null,
      sacado_nome: solicitacao?.sacado_razao_social ?? solicitacao?.nome_sacado ?? gv('op-sacado-nome') ?? null,
      sacado_cnpj: solicitacao?.sacado_cnpj_db ?? solicitacao?.cnpj_sacado ?? gv('op-sacado-cnpj') ?? null,
      valor: solicitacao?.valor ?? gv('op-valor') ?? null,
    };

    try {
      // 1) Blobs → File (o extractDocs precisa de File de verdade)
      const arquivos: File[] = [];
      for (const f of alvo) {
        const blob = await (await fetch(f.url!)).blob();
        arquivos.push(new File([blob], f.name, { type: f.mime || blob.type }));
      }

      // 2) Leitura local. Nunca deve derrubar a análise: se falhar, seguimos
      //    apenas com a leitura visual da IA.
      const textos = new Map<string, { texto: string; metodo: string }>();
      try {
        const extraidos = await extractDocs(arquivos, (atual, total, fase) => {
          setIaProgresso(`Lendo localmente ${atual}/${total}${fase === 'ocr' ? ' (OCR de documento escaneado…)' : ''}`);
        });
        for (const d of extraidos) textos.set(d.filename, { texto: d.text ?? '', metodo: d.method });
      } catch (err: any) {
        console.warn('[analise] extração local falhou, seguindo só com visão', err);
        toast('info', 'Leitura local indisponível', 'Seguindo apenas com a leitura visual da IA.');
      }
      if (ac.signal.aborted) return;

      // 3) Sobe cada documento em PEDAÇOS pequenos (evita FUNCTION_PAYLOAD_TOO_LARGE
      //    da Vercel mesmo com arquivos > 4,5 MB).
      const CHUNK = 3_000_000; // ~3 MB por requisição
      for (let i = 0; i < arquivos.length; i++) {
        const f = arquivos[i];
        setIaProgresso(`Enviando ${i + 1}/${arquivos.length}: ${f.name}`);
        const base64 = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string); // data URL (a API detecta imagem×PDF pelo prefixo)
          r.onerror = reject;
          r.readAsDataURL(f);
        });
        for (let seq = 0, off = 0; off < base64.length; seq++, off += CHUNK) {
          const up = await post({ action: 'upload', sessionId, fileId: String(i), filename: f.name, seq, chunk: base64.slice(off, off + CHUNK) });
          if (!up.ok) {
            const e = await up.json().catch(() => null);
            throw new Error(e?.error ?? `Falha ao enviar "${f.name}"`);
          }
        }
      }

      // 4) Extração: uma chamada por documento, no máximo 3 em paralelo.
      const docs: DocExtraido[] = [];
      const falhas: string[] = [];
      let concluidos = 0;
      const PARALELO = 3;
      let cursor = 0;
      const trabalhador = async () => {
        while (cursor < arquivos.length) {
          const i = cursor++;
          const f = arquivos[i];
          const local = textos.get(f.name);
          const res = await post({
            action: 'interpret_file',
            sessionId,
            fileId: String(i),
            filename: f.name,
            texto: local?.texto ?? '',
            texto_metodo: local?.metodo ?? '',
            ancoras,
          });
          const data = await res.json().catch(() => null);
          concluidos++;
          setIaProgresso(`Interpretando ${concluidos}/${arquivos.length} documento(s)`);
          if (!res.ok || !data?.success || !data.doc) {
            // Um documento ruim não derruba os outros - registra e segue.
            falhas.push(`${f.name}: ${data?.error ?? `erro ${res.status}`}`);
            continue;
          }
          docs.push(data.doc as DocExtraido);
          setFiles(prev => prev.map(x => x.name === f.name ? { ...x, type: data.doc.tipo, status: 'done' as const } : x));
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALELO, arquivos.length) }, trabalhador));
      if (ac.signal.aborted) return;

      if (docs.length === 0) {
        toast('error', 'Falha na leitura por IA', falhas[0] ?? 'Nenhum documento pôde ser lido.');
        return;
      }
      if (falhas.length) {
        toast('info', `${falhas.length} documento(s) não lido(s)`, falhas.slice(0, 2).join(' · '));
      }

      // 5) Consolidação em código puro: escolhe o valor de maior confiança e
      //    registra conflitos entre documentos.
      const { dados, revisar: chavesRevisar, avisos } = consolidarExtracao(docs);
      populateFromServer(dados);
      setRevisar(camposParaRevisar(chavesRevisar));
      setAvisosLeitura(avisos);

      // 6) Síntese textual (só JSON, sem imagens - chamada barata)
      setIaProgresso('Redigindo o resumo da leitura…');
      try {
        const resS = await post({
          action: 'sintese',
          dados,
          documentos: docs.map(d => ({ filename: d.filename, tipo: d.tipo, parte: d.parte })),
          avisos: avisos.map(a => a.texto).slice(0, 30),
        });
        const dataS = await resS.json().catch(() => null);
        if (resS.ok && dataS?.success) {
          setAnalise(dataS.analise || '');
          setDocsFaltantes(dataS.documentos_faltantes || []);
          if (Array.isArray(dataS.adequacoes_sugeridas) && dataS.adequacoes_sugeridas.length) {
            setAdeqs(dataS.adequacoes_sugeridas.map((t: string) => ({ texto: String(t), resp: 'Cedente', tipo: 'Adequação' })));
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.warn('[analise] síntese falhou', err);
      }

      const nRevisar = chavesRevisar.size;
      toast('success', 'Documentos interpretados',
        nRevisar ? `Campos preenchidos · ${nRevisar} para conferir (destacados em laranja).` : 'Campos preenchidos - revise nas próximas etapas.');
      goStep(1);
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // cancelado pelo operador - permanece no Upload
      toast('error', 'Falha na leitura por IA', e?.message ?? 'Tente novamente.');
    } finally {
      setIaReading(false);
      setIaProgresso('');
      interpretAbort.current = null;
    }
  }

  function cancelarInterpretacao() {
    interpretAbort.current?.abort();
    setIaReading(false);
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList).filter(f => !files.some(x => x.name === f.name && x.size === f.size));
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (arr.length === 0) return;
    processFiles(arr);
  }

  function prefillFromSolicitacao(s: SolicitacaoItem) {
    const patch: Record<string, string> = {};
    const add = (id: string, val: any) => { if (val != null && String(val).trim()) patch[id] = String(val); };
    add('op-cedente-nome', s.cedente_nome ?? s.nome_contratado);
    add('op-cedente-cnpj', s.cedente_cnpj ?? s.cnpj_contratado);
    add('op-sacado-nome', s.sacado_razao_social ?? s.nome_sacado);
    add('op-sacado-cnpj', s.sacado_cnpj_db ?? s.cnpj_sacado);
    add('op-valor', s.valor);
    add('op-vencimento', s.prazo_limite);
    // Identificação das etapas Cedente/Sacado (cadastro/DEPS podem sobrescrever depois)
    add('ced-razao', s.cedente_nome ?? s.nome_contratado);
    add('ced-cnpj', s.cedente_cnpj ?? s.cnpj_contratado);
    add('sac-razao', s.sacado_razao_social ?? s.nome_sacado);
    add('sac-cnpj', s.sacado_cnpj_db ?? s.cnpj_sacado);
    setForm(prev => ({ ...prev, ...patch }));
    setFilled(prev => new Set([...prev, ...Object.keys(patch)]));
  }

  function b64ToFile(nome: string, tipo: string, base64: string): File {
    const raw = base64.includes(',') ? base64.split(',')[1] : base64;
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    return new File([bytes], nome, { type: tipo || 'application/pdf' });
  }

  // Documentos anexados à solicitação (formulário + etapas)
  async function fetchSolicitacaoFiles(solId: string): Promise<File[]> {
    const res = await fetch(`/api/admin-data?action=get_solicitacao_files&id=${encodeURIComponent(solId)}`, {
      headers: { 'x-admin-session': token },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? `Status ${res.status}`);
    const arquivos: Array<{ nome: string; tipo: string; categoria?: string | null; base64: string }> = data.arquivos ?? [];
    return arquivos.map(a => {
      const file = b64ToFile(a.nome, a.tipo, a.base64);
      (file as any)._categoria = a.categoria ?? null;
      (file as any)._origem = 'solicitacao';
      return file;
    });
  }

  // Registro cadastral do cedente (dados estruturados - mais confiável que OCR)
  async function fetchCedenteRecord(cedenteId: string): Promise<any | null> {
    const r = await fetch(`/api/admin-data?action=cadastro_detail&id=${encodeURIComponent(cedenteId)}`, {
      headers: { 'x-admin-session': token },
    });
    const d = await r.json();
    if (!r.ok) return null;
    return d.cedente ?? null;
  }

  // Preenche os campos cadastrais a partir do registro do cedente (sobrescreve OCR)
  function prefillFromCedente(c: any) {
    if (!c) return;
    const patch: Record<string, string> = {};
    const add = (id: string, val: any) => { if (val != null && String(val).trim()) patch[id] = String(val); };
    const razao = c.razao_social ?? c.nome;
    const endereco = formatEndereco(c.endereco_pj);
    add('ced-razao', razao);
    add('ced-cnpj', c.cnpj_cpf);
    add('ced-endereco', endereco);
    add('ced-repr-nome', c.nome_responsavel);
    add('ced-repr-cpf', c.cpf_responsavel);
    // Operação (cabeçalho)
    add('op-cedente-nome', razao);
    add('op-cedente-cnpj', c.cnpj_cpf);
    add('op-cedente-end', endereco);
    // Conta escrow cadastrada (quando houver)
    if (Number(c.possui_escrow) === 1 && c.conta_escrow) {
      add('ced-banco', `QI SCD 329 · Ag 0001 · CC ${c.conta_escrow} (escrow)`);
    }
    setForm(prev => ({ ...prev, ...patch }));
    setFilled(prev => new Set([...prev, ...Object.keys(patch)]));
  }

  // Enriquece com dados da Receita (situação, CNAE, capital, fundação, porte) via /api/cnpj-lookup.
  // Receita-only sobrescreve OCR; razão/endereço só preenche se vazio (cadastro prevalece).
  async function enrichFromReceita(cnpj: string | null | undefined, prefix: 'ced' | 'sac') {
    const d = await lookupCNPJ(cnpj ?? '');
    if (!d) return;
    const fundacao = (() => {
      const v = String(d.data_inicio_atividade ?? '');
      const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
      return iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : v;
    })();
    const endereco = [d.logradouro, d.bairro, [d.municipio, d.uf].filter(Boolean).join('/'), d.cep].filter(Boolean).join(' · ');
    const capital = d.capital_social != null
      ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.capital_social)
      : '';

    // [id, valor, overwrite] - overwrite=false respeita valor já existente (cadastro)
    const upd: Array<[string, string, boolean]> = [];
    const push = (id: string, val: any, overwrite: boolean) => {
      if (val != null && String(val).trim()) upd.push([id, String(val), overwrite]);
    };
    if (prefix === 'ced') {
      push('ced-razao', d.razao_social, false);
      push('ced-situacao', d.descricao_situacao_cadastral, true);
      push('ced-cnae', d.cnae, true);
      push('ced-capital', capital, true);
      push('ced-fundacao', fundacao, true);
      push('ced-endereco', endereco, false);
    } else {
      push('sac-razao', d.razao_social, false);
      push('sac-porte', d.porte, true);
      push('sac-capital', capital, true);
      push('sac-fundacao', fundacao, true);
      push('sac-endereco', endereco, false);
    }
    if (upd.length === 0) return;
    setForm(prev => {
      const next = { ...prev };
      for (const [id, val, overwrite] of upd) {
        if (!overwrite && (next[id] ?? '').trim()) continue;
        next[id] = val;
      }
      return next;
    });
    setFilled(prev => new Set([...prev, ...upd.map(([id]) => id)]));
  }

  // Documentos cadastrados no próprio cedente (tabela cedente_arquivos)
  async function fetchCedenteFiles(cedenteId: string): Promise<File[]> {
    const listRes = await fetch(`/api/admin-data?action=list_cedente_arquivos&cedente_id=${encodeURIComponent(cedenteId)}`, {
      headers: { 'x-admin-session': token },
    });
    const listData = await listRes.json();
    if (!listRes.ok) throw new Error(listData?.error ?? `Status ${listRes.status}`);
    const metas: Array<{ id: number; nome: string; tipo: string }> = listData.arquivos ?? [];
    const files = await Promise.all(metas.map(async m => {
      const r = await fetch(`/api/admin-data?action=get_cedente_arquivo_base64&id=${encodeURIComponent(String(m.id))}`, {
        headers: { 'x-admin-session': token },
      });
      const d = await r.json();
      if (!r.ok || !d.base64) return null;
      const file = b64ToFile(m.nome, m.tipo, d.base64);
      (file as any)._origem = 'cedente';
      return file;
    }));
    return files.filter((f): f is File => f !== null);
  }

  async function handleSelectSolicitacao(s: SolicitacaoItem | null) {
    // Trocar de operação → limpa toda a análise anterior (anexos, campos, DEPS, parecer)
    files.forEach(f => { if (f.url) URL.revokeObjectURL(f.url); });
    setFiles([]);
    setForm({});
    setFilled(new Set());
    setAnalise('');
    setDocsFaltantes([]);
    setAdeqs([]);
    setDepsRaw({ ced: null, sac: null }); setDepsPreview(null); setDepsConfirm(null);
    setAiParecer(null); setAiError(''); setAiModel('');
    setAiMensagens([]); setAiPergunta(null); setAiNota(null); setAiCampos([]);
    setValidado(false);

    setSolicitacao(s);
    if (!s) return;
    prefillFromSolicitacao(s);
    setLoadingSol(true);
    try {
      // Puxa em paralelo: anexos da solicitação + documentos + registro cadastral do cedente
      const [solFiles, cedFiles, cedRecord] = await Promise.all([
        fetchSolicitacaoFiles(s.id).catch(e => { toast('error', 'Erro ao carregar documentos da solicitação', e?.message); return [] as File[]; }),
        s.cedente_id
          ? fetchCedenteFiles(s.cedente_id).catch(e => { toast('error', 'Erro ao carregar documentos do cedente', e?.message); return [] as File[]; })
          : Promise.resolve([] as File[]),
        s.cedente_id
          ? fetchCedenteRecord(s.cedente_id).catch(() => null)
          : Promise.resolve(null),
      ]);

      // Dedup por nome (um doc pode estar na solicitação e no cedente)
      const seen = new Set<string>();
      const all = [...solFiles, ...cedFiles].filter(f => {
        const key = f.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (all.length > 0) {
        await processFiles(all);
      } else {
        toast('info', 'Sem documentos', 'Solicitação e cedente sem documentos. Campos cadastrais preenchidos pelo cadastro; adicione documentos para os demais.');
      }

      // Dados cadastrais do cedente prevalecem sobre o OCR (aplicado por último)
      prefillFromCedente(cedRecord);

      // Enriquecimento via Receita (situação, CNAE, capital, fundação, porte) - cedente e sacado
      const cedCnpj = cedRecord?.cnpj_cpf ?? s.cedente_cnpj ?? s.cnpj_contratado;
      const sacCnpj = s.sacado_cnpj_db ?? s.cnpj_sacado;
      await Promise.all([
        enrichFromReceita(cedCnpj, 'ced').catch(() => {}),
        enrichFromReceita(sacCnpj, 'sac').catch(() => {}),
      ]);
    } catch (e: any) {
      toast('error', 'Erro ao carregar documentos', e?.message);
    } finally {
      setLoadingSol(false);
    }
  }

  function populateFromServer(dados: any) {
    const c = dados.cedente || {}, s = dados.sacado || {}, l = dados.lastro || {}, o = dados.operacao || {};
    const next: Record<string, string> = { ...form };
    const fset = new Set(filled);
    const sv = (id: string, val: any) => {
      if (val != null && String(val).trim()) { next[id] = String(val); fset.add(id); }
    };

    sv('op-cedente-nome', c.razao_social || l.prestador_nome);
    sv('op-cedente-cnpj', c.cnpj || l.prestador_cnpj);
    sv('op-cedente-end', c.endereco);
    sv('op-sacado-nome', s.razao_social || l.tomador_nome);
    sv('op-sacado-cnpj', s.cnpj || l.tomador_cnpj);
    sv('op-sacado-end', s.endereco);
    sv('op-valor', o.valor || l.valor);
    sv('op-descricao', o.descricao || l.descricao);
    if (o.vencimento || l.vencimento) {
      const v = String(o.vencimento || l.vencimento);
      const p = v.split('/');
      if (p.length === 3) sv('op-vencimento', `${p[2]}-${p[1]}-${p[0]}`);
    }

    sv('ced-repr-nome', c.representante_nome); sv('ced-repr-cpf', c.representante_cpf); sv('ced-repr-validade', c.representante_validade_cnh);
    sv('ced-razao', c.razao_social); sv('ced-cnpj', c.cnpj); sv('ced-situacao', c.situacao);
    sv('ced-cnae', c.cnae); sv('ced-capital', c.capital_social); sv('ced-fundacao', c.fundacao); sv('ced-endereco', c.endereco);
    sv('ced-banco', [c.banco, c.agencia ? 'Ag ' + c.agencia : '', c.conta ? 'CC ' + c.conta : ''].filter(Boolean).join(' '));
    sv('ced-banco-cnpj', c.banco_cnpj_titular);
    sv('ced-score', c.score_deps); sv('ced-class', c.classificacao_deps); sv('ced-limite-deps', c.limite_deps);
    sv('ced-fat-presumido', c.faturamento_presumido_deps);
    sv('ced-pont12', c.pontualidade_12m); sv('ced-pont3', c.pontualidade_3m);
    sv('ced-protestos', c.protestos); sv('ced-protestos-val', c.protestos_valor);
    sv('ced-pendencias', c.pendencias); sv('ced-acoes-qtd', c.acoes_qtd); sv('ced-acoes-val', c.acoes_valor);
    sv('ced-fat-total', c.faturamento_12m || c.receita_bruta_fiscal);
    sv('ced-pl', c.patrimonio_liquido); sv('ced-capital-bal', c.capital_social_balanco);
    sv('ced-disp', c.disponibilidades); sv('ced-liq-real', c.liquidez_real); sv('ced-resultado', c.resultado_exercicio);

    sv('lastro-tipo-doc', l.tipo_documento); sv('lastro-numero', l.numero); sv('lastro-emissao', l.emissao);
    sv('lastro-valor', l.valor); sv('lastro-desc', l.descricao); sv('lastro-vencimento', l.vencimento);
    sv('lastro-banco-nf', [l.banco_nf, l.agencia_nf ? 'Ag ' + l.agencia_nf : '', l.conta_nf ? 'CC ' + l.conta_nf : ''].filter(Boolean).join(' '));

    sv('sac-razao', s.razao_social); sv('sac-cnpj', s.cnpj); sv('sac-endereco', s.endereco);
    sv('sac-capital', s.capital_social); sv('sac-fat-presumido', s.faturamento_presumido);
    sv('sac-fundacao', s.fundacao); sv('sac-func', s.funcionarios); sv('sac-filiais', s.filiais); sv('sac-porte', s.porte);
    sv('sac-score', s.score_deps); sv('sac-class', s.classificacao_deps); sv('sac-limite-deps', s.limite_deps);
    sv('sac-pont12', s.pontualidade_12m); sv('sac-pont3', s.pontualidade_3m);
    sv('sac-protestos', s.protestos); sv('sac-protestos-val', s.protestos_valor);
    sv('sac-pendencias', s.pendencias); sv('sac-acoes-qtd', s.acoes_qtd); sv('sac-acoes-val', s.acoes_valor);

    // Checklist é derivado automaticamente de `files` + `form` (ver autoChecks) -
    // não setamos mais flags manuais aqui.
    setForm(next);
    setFilled(fset);
  }

  // ── Navegação ──────────────────────────────────────────────────────────────
  function goStep(n: number) {
    if (n < 0 || n > 5) return;
    if (n === 4) applyDecisaoSuggestions();
    setStep(n);
    window.scrollTo(0, 0);
  }
  function applyDecisaoSuggestions() {
    const d = computeDecisao(gv);
    setForm(p => {
      const next = { ...p };
      if (!next['dec-taxa']) next['dec-taxa'] = d.taxa;
      if (!next['dec-limite'] && d.limiteOp > 0 && d.limiteOp < Infinity) next['dec-limite'] = fb(d.limiteOp);
      if (!next['dec-tipo-rec']) next['dec-tipo-rec'] = d.tipoRec;
      if (!next['dec-tipo-just']) next['dec-tipo-just'] = d.tipoJust;
      return next;
    });
  }

  // ── Render helpers (funções puras → preservam foco) ─────────────────────────
  const input = (id: string, label: string, opts: { full?: boolean; type?: string; placeholder?: string; mask?: MaskKind } = {}) => {
    const raw = form[id] ?? '';
    // Exibição com máscara. cnpj/cpf/currency são idempotentes (valores auto-preenchidos têm 2 casas);
    // percent é só visual (mostra "94%"), mas guarda o número puro no estado.
    let displayValue = raw;
    if (opts.mask === 'percent') displayValue = raw ? `${String(raw).replace(/%/g, '').trim()}%` : '';
    else if (opts.mask) displayValue = applyMask(opts.mask, raw);
    const handleChange = (v: string) => {
      if (opts.mask === 'percent') set(id, v.replace(/[^\d.,]/g, ''));
      else set(id, applyMask(opts.mask, v));
    };
    return (
      <div className={`ac-fg${opts.full ? ' full' : ''}`}>
        <label>{label}</label>
        <input
          className={`ac-input${filled.has(id) ? ' filled' : ''}${revisar.has(id) ? ' revisar' : ''}`}
          type={opts.type ?? 'text'}
          inputMode={opts.mask ? 'numeric' : undefined}
          placeholder={opts.placeholder}
          title={revisar.has(id) ? avisosLeitura.filter(a => camposParaRevisar([a.chave]).has(id)).map(a => a.texto).join('\n') || 'Confira este campo' : undefined}
          value={displayValue}
          onChange={e => handleChange(e.target.value)}
        />
      </div>
    );
  };
  const textarea = (id: string, label: string, rows = 3, placeholder?: string) => (
    <div className="ac-fg full">
      <label>{label}</label>
      <textarea
        className={`ac-textarea${filled.has(id) ? ' filled' : ''}`}
        rows={rows}
        placeholder={placeholder}
        value={form[id] ?? ''}
        onChange={e => set(id, e.target.value)}
      />
    </div>
  );
  // Item do checklist - automático e read-only (status vindo do motor de crédito)
  const check = (id: string, label: string) => {
    const st = autoChecks[id] ?? { ok: false };
    const statusTxt = st.ok
      ? (st.kind === 'doc' ? `Documento identificado · ${st.via}` : `Preenchido · ${st.via}`)
      : 'Não identificado';
    return (
      <div className={`ac-ck auto ${st.ok ? 'ok' : 'missing'}`} title={statusTxt}>
        <span className="ac-ck-badge">{st.ok ? <IconCheck size={12} /> : '-'}</span>
        <span className="ac-ck-label">{label}</span>
        <span className="ac-ck-status">{statusTxt}</span>
      </div>
    );
  };

  // Mapeia cadastrais da empresa (DEPS) para os ids do formulário, por alvo
  const EMPRESA_MAP: Record<'ced' | 'sac', Record<string, string>> = {
    ced: { razao: 'ced-razao', cnpj: 'ced-cnpj', situacao: 'ced-situacao', cnae: 'ced-cnae', capital: 'ced-capital', fundacao: 'ced-fundacao', endereco: 'ced-endereco' },
    sac: { razao: 'sac-razao', cnpj: 'sac-cnpj', endereco: 'sac-endereco', capital: 'sac-capital', fundacao: 'sac-fundacao', porte: 'sac-porte', func: 'sac-func', filiais: 'sac-filiais' },
  };

  function docDoAlvo(alvo: 'ced' | 'sac'): string {
    const raw = alvo === 'ced'
      ? (form['op-cedente-cnpj'] ?? solicitacao?.cedente_cnpj ?? solicitacao?.cnpj_contratado ?? '')
      : (form['op-sacado-cnpj'] ?? solicitacao?.sacado_cnpj_db ?? solicitacao?.cnpj_sacado ?? '');
    return raw.replace(/\D/g, '');
  }

  // Consulta DEPS de UM alvo e preenche os campos. Retorna o desfecho (não mexe em loading/confirm).
  // Aplica um resultado DEPS já obtido: retém o bruto/normalizado, persiste no card,
  // preenche os campos da análise e avisa. Usado tanto no fluxo direto quanto após o
  // usuário confirmar o reaproveitamento no aviso "Consulta DEPS encontrada".
  function aplicarDeps(alvo: 'ced' | 'sac', payload: { resultado: any; norm: any; doc: string; nomeAlvo: string; produto: string; reutilizou: boolean }) {
    const { resultado, norm, doc, nomeAlvo, produto, reutilizou } = payload;
    setDepsRaw(prev => ({
      ...prev,
      [alvo]: { resultado, norm, documento: doc, produto, nome: nomeAlvo, reutilizou } as DepsEntry,
    }));
    // Persiste o relatório DEPS ligado à solicitação → fica acessível no balão do
    // cedente/sacado no card da solicitação (best-effort, não bloqueia a análise).
    if (solicitacao?.id) {
      fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        // `raw` leva o payload bruto (com o linkCompartilhamento): sem ele o
        // balão da parte só conseguiria mostrar o resumo, não o oficial.
        body: JSON.stringify({ action: 'save_solicitacao_deps', solicitacao_id: solicitacao.id, alvo, nome: nomeAlvo, documento: doc, norm, raw: resultado }),
      }).catch(() => {});
    }
    const patch: Record<string, string> = {};
    for (const [suf, val] of Object.entries(norm.deps)) patch[`${alvo}-${suf}`] = val as string;
    const empMap = EMPRESA_MAP[alvo];
    const empOnlyIfEmpty: Record<string, string> = {};
    for (const [k, val] of Object.entries(norm.empresa)) {
      const idc = empMap[k];
      if (idc) empOnlyIfEmpty[idc] = val as string;
    }
    setForm(prev => {
      const next = { ...prev, ...patch };
      for (const [idc, val] of Object.entries(empOnlyIfEmpty)) {
        if (!(next[idc] ?? '').trim()) next[idc] = val;
      }
      return next;
    });
    const filledIds = [...Object.keys(patch), ...Object.values(empMap)];
    setFilled(prev => new Set([...prev, ...filledIds.filter(idc => patch[idc] != null || empOnlyIfEmpty[idc] != null)]));
    // checklist deriva automaticamente do score/classificação preenchidos (autoChecks)
    toast('success', `DEPS ${alvo === 'ced' ? 'cedente' : 'sacado'} (${reutilizou ? 'reaproveitada' : 'nova'})`, norm.resumo || 'Campos atualizados.');
  }

  async function consultarUm(alvo: 'ced' | 'sac', forcarNova: boolean, oferecerReaproveitar = false): Promise<'ok' | 'needsNew' | 'error' | 'reuse'> {
    const doc = docDoAlvo(alvo);
    if (doc.length !== 11 && doc.length !== 14) return 'error';
    const usarReutilizar = !forcarNova; // sempre reaproveita o histórico quando não é geração forçada
    setDepsLoading(alvo);
    try {
      const res = await fetch('/api/deps-consulta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ documento: doc, identificadorProduto: depsProduto, reutilizarDadosExistentes: usarReutilizar }),
      });
      const data = await res.json().catch(() => null);
      console.log('[DEPS] resposta crua:', alvo, data);
      if (data?.needsNew) return 'needsNew';
      if (!res.ok || !data?.success) {
        const msgs: string[] = data?.detalhe?.messages ?? [];
        toast('error', `Falha na consulta DEPS (${alvo === 'ced' ? 'cedente' : 'sacado'})`, data?.detalhe?.message ?? msgs[0] ?? data?.error ?? `Erro ${res.status}`);
        return 'error';
      }

      const { normalizeDepsMix } = await import('../lib/depsParser');
      const norm = normalizeDepsMix(data.resultado);
      const nomeAlvo = norm.empresa.razao ?? (alvo === 'ced' ? form['ced-razao'] : form['sac-razao']) ?? '';
      const payload = { resultado: data.resultado, norm, doc, nomeAlvo, produto: data.identificadorProduto ?? depsProduto, reutilizou: !!data.reutilizou };

      // Reaproveitável e ação de uma parte só: pergunta antes de aplicar (mostra a data).
      if (oferecerReaproveitar && !forcarNova && data.reutilizou) {
        setDepsReuseFound({ alvo, dataConsulta: depsDataConsulta(data.resultado), payload });
        return 'reuse';
      }
      aplicarDeps(alvo, payload);
      return 'ok';
    } catch (e: any) {
      toast('error', `Erro na consulta DEPS (${alvo === 'ced' ? 'cedente' : 'sacado'})`, e?.message);
      return 'error';
    }
  }

  // Consulta cedente + sacado num clique. forcarNova/somente usados na confirmação de cobrança.
  async function consultarDeps(forcarNova = false, somente?: ('ced' | 'sac')[]) {
    setDepsConfirm(null);
    setDepsReuseFound(null);
    let alvos: ('ced' | 'sac')[] = somente ?? ['ced', 'sac'];
    alvos = alvos.filter(a => { const d = docDoAlvo(a); return d.length === 11 || d.length === 14; });
    if (!alvos.length) { toast('error', 'Sem CNPJ/CPF para consultar', 'Selecione uma solicitação com cedente e sacado.'); return; }
    // Só oferece o "reaproveitar ou gerar nova" quando é uma parte só (o botão do painel);
    // no lote (ced+sac), reaproveita direto (grátis) para não empilhar avisos.
    const oferecer = alvos.length === 1 && !forcarNova;
    const pendentes: ('ced' | 'sac')[] = [];
    try {
      for (const alvo of alvos) {
        const r = await consultarUm(alvo, forcarNova, oferecer);
        if (r === 'needsNew') pendentes.push(alvo);
      }
    } finally {
      setDepsLoading(null);
    }
    if (pendentes.length) setDepsConfirm({ alvos: pendentes, motivo: 'sem-reuso' });
  }

  // Painel da DEPS por parte - mesma estrutura do balão da parte no card da
  // solicitação. Aparece na etapa de consulta e em Documentos da Análise.
  function depsPanelDe(alvo: 'ced' | 'sac') {
    const e = depsRaw[alvo];
    const busy = depsLoading === alvo;
    const papel = alvo === 'ced' ? 'Cedente' : 'Sacado';
    const risco = e?.norm.deps.class ?? '';
    const dataConsulta = e ? depsDataConsulta(e.resultado) : '';
    return (
      <DepsPanel
        titulo={`Análise DEPS · ${papel}`}
        score={e?.norm.deps.score ?? ''}
        sub={[risco && `risco ${risco}`, dataConsulta, e?.nome].filter(Boolean).join(' · ')}
        temRelatorio={!!e}
        reutilizou={!!e?.reutilizou}
        busy={busy}
        onVer={() => openDepsReport(alvo)}
        onNovaAba={() => openDepsReportTab(alvo)}
        onAtualizar={() => setDepsConfirm({ alvos: [alvo], motivo: 'atualizar' })}
        onGerar={() => consultarDeps(false, [alvo])}
        produtoSelect={<DepsProdutoSelect value={depsProduto} onChange={setDepsProduto} />}
      />
    );
  }

  return (
    <div className="admin-content-wrap ac-page">
      <div className="ac-no-print" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="admin-page-title">Análise de Crédito</h1>
          <p className="admin-page-desc">Antecipação de recebíveis - leitura de documentos por IA, motor de decisão e parecer.</p>
        </div>
        <div style={{ marginTop: 6 }}>
          <SegSwitch valor={view} onChange={setView} opcoes={VIEWS.map(v => ({ valor: v.id, label: v.label }))} />
        </div>
      </div>

      {view === 'diretrizes' ? <DiretrizesPanel token={token} /> : view === 'historico' ? <HistoricoAnalises token={token} /> : (<>
      <div className="ac-stepper ac-no-print">
        {STEPS.map((s, i) => (
          <button
            key={s}
            className={`ac-step${i === step ? ' active' : i < step ? ' done' : ''}`}
            onClick={() => goStep(i)}
          >
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Conferência da leitura: o que a IA marcou como incerto ou conflitante.
          Aparece nas etapas de preenchimento, onde os campos ficam destacados. */}
      {avisosLeitura.length > 0 && step >= 1 && step <= 3 && (
        <div className="ac-card ac-no-print">
          <div className="ac-card-h">
            <IconSearch size={15} /> Conferir na leitura <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· {avisosLeitura.length} ponto(s)</span>
          </div>
          <div className="ac-card-b">
            <p className="ac-ck-hint" style={{ marginTop: 0 }}>
              Os campos abaixo estão <strong style={{ color: '#B45309' }}>destacados em laranja</strong> no formulário. A IA leu cada
              documento duas vezes (imagem e texto extraído) - aqui está onde as leituras discordaram, a confiança ficou baixa ou dois
              documentos deram valores diferentes.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {avisosLeitura.slice(0, 25).map((a, i) => {
                const cor = a.motivo === 'divergencia' ? '#B91C1C' : a.motivo === 'conflito' ? '#B45309' : '#6B7280';
                const rot = a.motivo === 'divergencia' ? 'imagem × texto' : a.motivo === 'conflito' ? 'documentos divergem' : 'confiança';
                return (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: cor, background: '#F3F4F6', borderRadius: 999, padding: '2px 8px', marginTop: 1 }}>{rot}</span>
                    <span style={{ color: '#374151' }}>{a.texto}</span>
                  </div>
                );
              })}
              {avisosLeitura.length > 25 && (
                <div style={{ fontSize: 12, color: 'var(--ac-g500)' }}>… e mais {avisosLeitura.length - 25} ponto(s).</div>
              )}
            </div>
            <button className="ac-btn outline sm" style={{ marginTop: 10 }} onClick={() => { setAvisosLeitura([]); setRevisar(new Set()); }}>
              <IconCheck size={13} /> Conferi tudo - limpar destaques
            </button>
          </div>
        </div>
      )}

      {/* ───────── STEP 0: UPLOAD + OPERAÇÃO ───────── */}
      {step === 0 && (
        <>
          <div className="ac-card">
            <div className="ac-card-h"><IconLink size={15} /> Solicitação</div>
            <div className="ac-card-b">
              <SolicitacaoPicker
                token={token}
                value={solicitacao}
                loading={loadingSol}
                onChange={handleSelectSolicitacao}
              />
              {!solicitacao && (
                <p style={{ fontSize: 12.5, color: 'var(--ac-g500)', margin: '10px 0 0' }}>
                  Selecione a solicitação para puxar os dados da operação e os documentos já anexados.
                </p>
              )}
              {solicitacao && (
                <div className="ac-sol-info" style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14,
                  padding: '16px 18px',
                }}>
                  <ReadOnlyInfo label="Cedente" value={solicitacao.cedente_nome ?? solicitacao.nome_contratado} />
                  <ReadOnlyInfo label="CNPJ Cedente" value={maskCpfCnpj(solicitacao.cedente_cnpj ?? solicitacao.cnpj_contratado ?? '')} />
                  <ReadOnlyInfo label="Sacado" value={solicitacao.sacado_razao_social ?? solicitacao.nome_sacado} />
                  <ReadOnlyInfo label="CNPJ Sacado" value={maskCpfCnpj(solicitacao.sacado_cnpj_db ?? solicitacao.cnpj_sacado ?? '')} />
                  <ReadOnlyInfo label="Valor Solicitado" value={solicitacao.valor} />
                  <ReadOnlyInfo label={parcelasList ? 'Parcelas' : 'Vencimento'} value={parcelasList ? `${parcelasList.length}x` : fmtVenc(solicitacao.prazo_limite)} />
                </div>
              )}
              {solicitacao && parcelasList && parcelasList.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac-g500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
                    Detalhamento das parcelas
                  </div>
                  <div className="ac-parcelas">
                    <div className="ac-parcelas-head">
                      <span>#</span><span>Valor</span><span>Vencimento</span>
                    </div>
                    {parcelasList.map((p, i) => (
                      <div key={i} className="ac-parcelas-row">
                        <span>{i + 1}ª</span>
                        <span style={{ fontWeight: 700 }}>{p.valor || (p.valorNumerico != null ? p.valorNumerico.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-')}</span>
                        <span>{fmtVenc(p.vencimento ?? null) || '-'}</span>
                      </div>
                    ))}
                    <div className="ac-parcelas-row total">
                      <span>Total</span>
                      <span style={{ fontWeight: 800 }}>{solicitacao.valor ?? '-'}</span>
                      <span />
                    </div>
                  </div>
                </div>
              )}
              {solicitacao && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--ac-g100)' }}>
                  <h4 className="ac-h4" style={{ marginTop: 0 }}>Consulta de Crédito (DEPS)</h4>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="ac-fg" style={{ width: 190, flexShrink: 0 }}>
                      <label>Produto</label>
                      <DepsProdutoSelect value={depsProduto} onChange={setDepsProduto} />
                    </div>
                    <button type="button" className="deps-gen-btn" disabled={depsLoading !== null}
                      style={{ flex: '0 0 auto', width: 'auto', padding: '10px 20px' }}
                      onClick={() => consultarDeps()}
                      title="Consulta cedente e sacado de uma vez. Reaproveita a consulta do histórico automaticamente quando já existe; só gera nova (com custo) se não houver.">
                      {depsLoading !== null
                        ? <><span className="deps-spin" /> Consultando {depsLoading === 'ced' ? 'cedente' : 'sacado'}…</>
                        : <>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" fill="#EE5B45" /></svg>
                            Gerar DEPS (cedente + sacado)
                          </>}
                    </button>
                  </div>
                  {depsLoading && (
                    <div style={{ marginTop: 12 }}>
                      <div className="ac-deps-progress"><div className="ac-deps-progress-bar" /></div>
                      <p style={{ fontSize: 12, color: 'var(--ac-g600)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span className="ac-spinner" /> Consultando DEPS do {depsLoading === 'ced' ? 'cedente' : 'sacado'}… buscando análise e bureaus.
                      </p>
                    </div>
                  )}
                  {depsConfirm && !depsLoading && (() => {
                    const nomes = depsConfirm.alvos.map(a => a === 'ced' ? 'cedente' : 'sacado').join(' e ');
                    const n = depsConfirm.alvos.length;
                    const atualizando = depsConfirm.motivo === 'atualizar';
                    return (
                      <div className="ac-note" style={{ marginTop: 12, marginBottom: 0, background: 'var(--ac-warn-bg)', borderColor: 'var(--ac-warn)', color: '#7A4A00' }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>
                          {atualizando ? 'Gerar nova consulta DEPS?' : 'Sem consulta válida no histórico'}
                        </div>
                        <p style={{ margin: '0 0 10px' }}>
                          {atualizando
                            ? <>Atualizar a DEPS <strong>{nomes}</strong> gera consulta nova e substitui o relatório atual da análise. <strong>Consome {n} do contrato DEPS.</strong></>
                            : <>Não há análise válida para reaproveitar: <strong>{nomes}</strong>. Gerar nova(s) consulta(s)? <strong>Consome {n} do contrato DEPS.</strong></>}
                        </p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="ac-btn primary sm"
                            onClick={() => consultarDeps(true, depsConfirm.alvos)}>
                            Gerar {n > 1 ? 'novas consultas' : 'nova consulta'}
                          </button>
                          <button type="button" className="ac-btn outline sm" onClick={() => setDepsConfirm(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {depsReuseFound && !depsLoading && (() => {
                    const papel = depsReuseFound.alvo === 'ced' ? 'cedente' : 'sacado';
                    return (
                      <div className="ac-note" style={{ marginTop: 12, marginBottom: 0 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>Consulta DEPS encontrada</div>
                        <p style={{ margin: '0 0 10px' }}>
                          Há uma consulta deste CNPJ {depsReuseFound.dataConsulta
                            ? <>de <strong>{depsReuseFound.dataConsulta}</strong></>
                            : 'no histórico da DEPS'} para o <strong>{papel}</strong>.
                          Reaproveitar sem custo ou gerar uma nova consulta? <strong>Gerar nova consome 1 do contrato DEPS.</strong>
                        </p>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="ac-btn primary sm"
                            onClick={() => { const r = depsReuseFound; setDepsReuseFound(null); aplicarDeps(r.alvo, r.payload); }}>
                            Reaproveitar (grátis)
                          </button>
                          <button type="button" className="ac-btn outline sm"
                            onClick={() => { const a = depsReuseFound.alvo; setDepsReuseFound(null); consultarDeps(true, [a]); }}>
                            Gerar nova (cobra)
                          </button>
                          <button type="button" className="ac-btn outline sm" onClick={() => setDepsReuseFound(null)}>
                            Cancelar
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {/* Resultado por parte - aparece após a consulta (score + relatório oficial + atualizar) */}
                  {(depsRaw.ced || depsRaw.sac) && (
                    <div className="ac-deps-panels" style={{ marginTop: 12 }}>
                      {depsRaw.ced && depsPanelDe('ced')}
                      {depsRaw.sac && depsPanelDe('sac')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {solicitacao && (<>
          <div className="ac-card">
            <div className="ac-card-h"><IconClip size={15} /> Documentos da Operação</div>
            <div className="ac-card-b">
              <div
                className={`ac-upload${dragging ? ' drag' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
              >
                <div className="ac-upload-icon"><IconDoc size={22} /></div>
                <div className="ac-upload-title">Arraste os arquivos ou clique para selecionar</div>
                <div className="ac-upload-sub">PDF ou imagem · Múltiplos arquivos · DEPs, NF, Balanço, Contrato, CNH...</div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
                style={{ display: 'none' }}
                onChange={e => addFiles(e.target.files)}
              />
              {loadingSol && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--ac-accent)', marginBottom: 10 }}>
                    <span className="ac-spinner" /> Carregando anexos da solicitação…
                  </div>
                  {[0, 1, 2].map(i => (
                    <div key={i} className="ac-file" style={{ borderColor: 'var(--ac-g100)' }}>
                      <span className="ac-skel" style={{ width: 20, height: 20, borderRadius: 5 }} />
                      <div className="ac-file-info" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span className="ac-skel" style={{ width: '55%', height: 12 }} />
                        <span className="ac-skel" style={{ width: 60, height: 9 }} />
                      </div>
                      <span className="ac-skel" style={{ width: 70, height: 12 }} />
                    </div>
                  ))}
                </div>
              )}
              {files.map(f => (
                <div key={f.name} className={`ac-file ${f.status}`}>
                  <div className="ac-file-icon"><IconDoc size={18} /></div>
                  <div className="ac-file-info">
                    <div className="ac-file-name">{f.name}</div>
                    <div className="ac-file-meta">{(f.size / 1024).toFixed(0)} KB</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {f.categoria && <CategoriaTag categoria={f.categoria} size="xs" />}
                    {f.status === 'processing' && <span className="ac-spinner" />}
                    {f.status === 'done' && <span style={{ color: '#065F46', fontWeight: 600 }}><IconCheck size={12} /> {f.type || 'Anexado'}</span>}
                    {f.status === 'error' && <span style={{ color: '#991B1B', display: 'inline-flex' }} title="Falha ao processar"><IconXCircle size={13} /></span>}
                    {f.url && (
                      <div className="ac-doc-actions">
                        <button className="ac-icobtn" title="Pré-visualizar" onClick={() => viewFile(f)}><IconEye size={15} /></button>
                        <button className="ac-icobtn" title="Baixar" onClick={() => downloadFile(f)}><IconDownload size={15} /></button>
                        <button className="ac-icobtn danger" title="Remover anexo" onClick={() => removeFile(f)}><IconTrash size={15} /></button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {files.some(f => f.status === 'done') && (
                <p style={{ fontSize: 12, color: 'var(--ac-g500)', marginTop: 10 }}>
                  <IconClip /> Documentos anexados. Eles serão lidos e interpretados pela IA ao clicar em <strong>Próximo</strong>.
                </p>
              )}
            </div>
          </div>

          <div className="ac-btngroup">
            {(() => {
              const anexosCarregando = loadingSol || files.some(f => f.status === 'processing');
              return (
                <button className="ac-btn primary" onClick={() => setConfirmInterpret(true)} disabled={iaReading || anexosCarregando}>
                  {anexosCarregando
                    ? <><IconSpinner size={13} /> Carregando anexos…</>
                    : <>Próximo <IconArrowRight size={13} /> Interpretar com IA</>}
                </button>
              );
            })()}
          </div>

          {/* Modal de confirmação da interpretação */}
          {confirmInterpret && createPortal(
            (() => {
              const depsMissing = [!depsRaw.ced && 'cedente', !depsRaw.sac && 'sacado'].filter(Boolean) as string[];
              const docsCount = files.filter(f => f.url).length;
              return (
                <div className="ac-ov" onClick={() => setConfirmInterpret(false)}>
                  <div className="ac-ov-card" onClick={e => e.stopPropagation()}>
                    <div className="ac-ov-title"><IconSparkles size={16} /> Interpretar documentos com IA</div>
                    <p className="ac-ov-text">
                      Ao continuar, a IA vai <strong>ler e interpretar todos os {docsCount} documento(s) anexado(s)</strong> e os
                      <strong> relatórios da DEPS</strong> gerados, preenchendo automaticamente os campos da análise.
                      Você poderá <strong>revisar e ajustar</strong> tudo nas próximas etapas.
                    </p>
                    {depsMissing.length > 0 && (
                      <div className="ac-ov-warn">
                        <strong><IconAlert size={12} /> Você ainda não consultou a DEPS {depsMissing.length === 2 ? 'do cedente e do sacado' : `do ${depsMissing[0]}`}.</strong>
                        <span> Sem o relatório de crédito, a análise fica incompleta. Recomendamos voltar e consultar a DEPS antes de interpretar.</span>
                      </div>
                    )}
                    <div className="ac-ov-actions">
                      <button className="ac-btn outline" onClick={() => setConfirmInterpret(false)}>Voltar e ajustar</button>
                      <button className="ac-btn primary" onClick={interpretarEAvancar}><IconSparkles size={13} /> Interpretar e avançar</button>
                    </div>
                  </div>
                </div>
              );
            })(),
            document.body,
          )}

          {/* Overlay de carregamento (cancelável) */}
          {iaReading && createPortal(
            <div className="ac-ov">
              <div className="ac-ov-card" style={{ maxWidth: 480 }}>
                <AiParecerLoading title="Interpretando os documentos…" steps={AI_READ_STEPS} nota={iaProgresso} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <button className="ac-btn outline" onClick={cancelarInterpretacao}>Cancelar e voltar aos anexos</button>
                </div>
              </div>
            </div>,
            document.body,
          )}
          </>)}
        </>
      )}

      {/* ───────── STEP 1: CEDENTE ───────── */}
      {step === 1 && (
        <>
          <div className="ac-card">
            <div className="ac-card-h"><IconBuilding size={15} /> Cedente - Dados Cadastrais</div>
            <div className="ac-card-b">
              <h4 className="ac-h4">Checklist Documental <span className="ac-ck-auto-tag">automático</span></h4>
              <p className="ac-ck-hint">Preenchido pelo motor de crédito a partir dos documentos lidos e dos dados extraídos.</p>
              <div className="ac-checklist">
                {check('ck-identidade', 'Identidade do representante legal')}
                {check('ck-contrato', 'Contrato social / alteração')}
                {check('ck-endereco', 'Comprovante de endereço (< 3 meses)')}
                {check('ck-financeiro', 'Balanço patrimonial + DRE')}
                {check('ck-faturamento', 'Declaração de faturamento')}
                {check('ck-irpj', 'IRPJ / ECF')}
                {check('ck-bancario', 'Dados bancários')}
                {check('ck-deps-ced', 'DEPs do cedente')}
              </div>
              <h4 className="ac-h4">Representante Legal</h4>
              <div className="ac-grid cols-3">
                {input('ced-repr-nome', 'Nome')}
                {input('ced-repr-cpf', 'CPF', { mask: 'cpf' })}
                {input('ced-repr-validade', 'Validade CNH')}
              </div>
              <h4 className="ac-h4">Pessoa Jurídica</h4>
              <div className="ac-grid cols-3">
                {input('ced-razao', 'Razão Social')}
                {input('ced-cnpj', 'CNPJ', { mask: 'cnpj' })}
                {input('ced-situacao', 'Situação Receita')}
                {input('ced-cnae', 'CNAE Principal')}
                {input('ced-capital', 'Capital Social (R$)', { mask: 'currency' })}
                {input('ced-fundacao', 'Fundação')}
                {input('ced-endereco', 'Endereço', { full: true })}
              </div>
              <h4 className="ac-h4">Dados Bancários</h4>
              <div className="ac-grid">
                {input('ced-banco', 'Banco / Agência / Conta')}
                {input('ced-banco-cnpj', 'CNPJ Titular', { mask: 'cnpj' })}
              </div>
              <h4 className="ac-h4">DEPs Cedente</h4>
              <div className="ac-grid cols-3">
                {input('ced-score', 'Score')}
                {input('ced-class', 'Classificação')}
                {input('ced-limite-deps', 'Limite Sugerido (R$)', { mask: 'currency' })}
                {input('ced-fat-presumido', 'Fat. Presumido')}
                {input('ced-pont12', 'Pontualidade 12m (%)', { mask: 'percent' })}
                {input('ced-pont3', 'Pontualidade 3m (%)', { mask: 'percent' })}
                {input('ced-protestos', 'Protestos (qtd)')}
                {input('ced-protestos-val', 'Protestos (R$)', { mask: 'currency' })}
                {input('ced-pendencias', 'Pendências')}
                {input('ced-acoes-qtd', 'Ações Judiciais (qtd)')}
                {input('ced-acoes-val', 'Ações Judiciais (R$)', { mask: 'currency' })}
              </div>
            </div>
          </div>
          <div className="ac-card">
            <div className="ac-card-h"><IconChart size={15} /> Cedente - Análise Financeira</div>
            <div className="ac-card-b">
              <div className="ac-grid cols-3">
                {input('ced-fat-total', 'Faturamento 12m (R$)', { mask: 'currency' })}
                {input('ced-pl', 'PL (R$)', { mask: 'currency' })}
                {input('ced-capital-bal', 'Capital Social - Balanço (R$)', { mask: 'currency' })}
                {input('ced-disp', 'Disponibilidades Reais (R$)', { mask: 'currency' })}
                {input('ced-liq-real', 'Liquidez Real')}
                {input('ced-liq-contabil', 'Liquidez Contábil')}
                {input('ced-cap-giro', 'Capital de Giro (R$)', { mask: 'currency' })}
                {input('ced-resultado', 'Resultado Exercício (R$)', { mask: 'currency' })}
                {input('ced-emprest-ligadas', 'Empréstimos a Ligadas (R$)', { mask: 'currency' })}
              </div>
              {textarea('ced-obs', 'Observações do Cedente', 3, 'Achados, red flags, pontos de atenção...')}
            </div>
          </div>
          <div className="ac-btngroup">
            <button className="ac-btn outline" onClick={() => goStep(0)}><IconArrowLeft size={13} /> Voltar</button>
            <button className="ac-btn primary" onClick={() => goStep(2)}>Próximo <IconArrowRight size={13} /> Lastro</button>
          </div>
        </>
      )}

      {/* ───────── STEP 2: LASTRO ───────── */}
      {step === 2 && (
        <>
          <div className="ac-card">
            <div className="ac-card-h"><IconDoc size={15} /> Lastro da Operação</div>
            <div className="ac-card-b">
              <div className="ac-grid cols-3">
                {input('lastro-tipo-doc', 'Tipo de Documento', { placeholder: 'NFS-e / Contrato / PO' })}
                {input('lastro-numero', 'Número')}
                {input('lastro-emissao', 'Data de Emissão')}
                {input('lastro-valor', 'Valor (R$)', { mask: 'currency' })}
                {input('lastro-vencimento', 'Vencimento')}
                {input('lastro-banco-nf', 'Dados Bancários na NF', { placeholder: 'Banco / Ag / CC' })}
                {textarea('lastro-desc', 'Descrição do Serviço / Produto', 3)}
                {textarea('lastro-obs', 'Observações do Lastro', 2, 'Condicionantes, natureza do crédito...')}
              </div>
            </div>
          </div>
          <div className="ac-btngroup">
            <button className="ac-btn outline" onClick={() => goStep(1)}><IconArrowLeft size={13} /> Voltar</button>
            <button className="ac-btn primary" onClick={() => goStep(3)}>Próximo <IconArrowRight size={13} /> Sacado</button>
          </div>
        </>
      )}

      {/* ───────── STEP 3: SACADO ───────── */}
      {step === 3 && (
        <>
          <div className="ac-card">
            <div className="ac-card-h"><IconFactory size={15} /> Sacado</div>
            <div className="ac-card-b">
              <p className="ac-ck-hint" style={{ marginTop: 0 }}>Checklist automático - detectado pelo motor de crédito.</p>
              <div className="ac-checklist" style={{ marginBottom: 16 }}>
                {check('ck-deps-sac', 'DEPs do sacado')}
                {check('ck-lastro', 'Documento de lastro')}
              </div>
              <h4 className="ac-h4">Identificação</h4>
              <div className="ac-grid cols-3">
                {input('sac-razao', 'Razão Social')}
                {input('sac-cnpj', 'CNPJ', { mask: 'cnpj' })}
                {input('sac-porte', 'Porte')}
                {input('sac-capital', 'Capital Social (R$)', { mask: 'currency' })}
                {input('sac-fat-presumido', 'Fat. Presumido')}
                {input('sac-fundacao', 'Fundação')}
                {input('sac-endereco', 'Endereço', { full: true })}
                {input('sac-func', 'Funcionários')}
                {input('sac-filiais', 'Filiais')}
              </div>
              <h4 className="ac-h4">DEPs Sacado</h4>
              <div className="ac-grid cols-3">
                {input('sac-score', 'Score')}
                {input('sac-class', 'Classificação')}
                {input('sac-limite-deps', 'Limite Sugerido (R$)', { mask: 'currency' })}
                {input('sac-pont12', 'Pontualidade 12m (%)', { mask: 'percent' })}
                {input('sac-pont3', 'Pontualidade 3m (%)', { mask: 'percent' })}
                {input('sac-protestos', 'Protestos (qtd)')}
                {input('sac-protestos-val', 'Protestos (R$)', { mask: 'currency' })}
                {input('sac-pendencias', 'Pendências')}
                {input('sac-acoes-qtd', 'Ações Judiciais (qtd)')}
                {input('sac-acoes-val', 'Ações Judiciais (R$)', { mask: 'currency' })}
              </div>
              {textarea('sac-obs', 'Observações do Sacado', 3, 'Contextualização do porte, histórico DUX...')}
            </div>
          </div>
          <div className="ac-btngroup">
            <button className="ac-btn outline" onClick={() => goStep(2)}><IconArrowLeft size={13} /> Voltar</button>
            <button className="ac-btn primary" onClick={() => goStep(4)}>Próximo <IconArrowRight size={13} /> Decisão</button>
          </div>
        </>
      )}

      {/* ───────── STEP 4: DECISÃO ───────── */}
      {step === 4 && (
        <>
          {/* Parecer consultivo da IA - SUGESTÃO; o operador confere e decide */}
          <div className="ac-card">
            <div className="ac-card-h"><IconBot size={15} /> Parecer da IA <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· consultivo</span></div>
            <div className="ac-card-b">
              <p className="ac-ck-hint" style={{ marginTop: 0 }}>
                A IA lê os relatórios (DEPS, cadastro, lastro, faltantes) e sugere uma conclusão embasada.
                É apenas uma <strong>opinião</strong> - a decisão final é sua.
              </p>

              {!aiParecer && !aiLoading && (
                <button className="ac-btn success" onClick={gerarParecerIA} disabled={aiLoading}>
                  <IconSparkles size={13} /> Gerar parecer da IA
                </button>
              )}
              {!aiParecer && aiLoading && <AiParecerLoading title="Gerando o parecer da IA…" />}
              {aiError && !aiLoading && (
                <p style={{ color: '#B91C1C', fontSize: 13, marginTop: 10 }}>{aiError}</p>
              )}

              {aiParecer && (
                <AiParecerView
                  p={aiParecer} model={aiModel} onRegen={gerarParecerIA} regenerating={aiLoading}
                  onAjustar={ajustarParecer} ajustando={aiAjustando}
                  pergunta={aiPergunta} nota={aiNota} campos={aiCampos}
                  token={token}
                  ultimaCorrecao={[...aiMensagens].reverse().find(m => m.autor === 'operador')?.texto ?? ''}
                />
              )}
            </div>
          </div>

          <div className="ac-card">
            <div className="ac-card-h"><IconTarget size={15} /> Decisão <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· do operador</span></div>
            <div className="ac-card-b">
              <DecisaoSummary dec={dec} gv={gv} />

              <h4 className="ac-h4">Status da Operação</h4>
              <div className="ac-status-grid">
                {([
                  ['aprovado', <IconCheckCircle size={26} />, 'Aprovado', 'ok'],
                  ['condicionantes', <IconAlert size={26} />, 'Aprovado c/ Condicionantes', 'warn'],
                  ['reprovado', <IconXCircle size={26} />, 'Reprovado', 'danger'],
                ] as const).map(([val, icon, title, cls]) => (
                  <div
                    key={val}
                    className={`ac-status-card${form['dec-status'] === val ? ' selected' : ''}`}
                    onClick={() => set('dec-status', val)}
                  >
                    <div className={`ac-sc-icon ${cls}`}>{icon}</div>
                    <div className={`ac-sc-title ${cls}`}>{title}</div>
                  </div>
                ))}
              </div>

              <h4 className="ac-h4">Condições Comerciais</h4>
              <div className="ac-grid cols-3">
                {input('dec-taxa', 'Taxa (% a.m.)')}
                {input('dec-limite', 'Limite de Crédito (R$)', { mask: 'currency' })}
                {input('dec-tipo-rec', 'Tipo de Operação Recomendado')}
                {input('dec-tipo-just', 'Justificativa do Tipo Recomendado', { full: true })}
              </div>

              <h4 className="ac-h4">Condicionantes e Adequações</h4>
              {adeqs.map((a, i) => (
                <div key={i} className="ac-adeq-row">
                  <input className="ac-input" type="text" placeholder="Descrição..." value={a.texto}
                    onChange={e => setAdeqs(prev => prev.map((x, j) => j === i ? { ...x, texto: e.target.value } : x))} />
                  <select className="ac-select" value={a.resp}
                    onChange={e => setAdeqs(prev => prev.map((x, j) => j === i ? { ...x, resp: e.target.value } : x))}>
                    <option>Cedente</option><option>Sacado</option><option>DUX</option>
                  </select>
                  <select className="ac-select" value={a.tipo}
                    onChange={e => setAdeqs(prev => prev.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x))}>
                    <option>Condicionante</option><option>Adequação</option><option>Bloqueante</option>
                  </select>
                  <button className="ac-icon-btn" title="Remover" aria-label="Remover" onClick={() => setAdeqs(prev => prev.filter((_, j) => j !== i))}><IconX size={15} /></button>
                </div>
              ))}
              <button className="ac-btn outline sm" style={{ marginTop: 4 }}
                onClick={() => setAdeqs(prev => [...prev, { texto: '', resp: 'Cedente', tipo: 'Condicionante' }])}>
                + Adicionar
              </button>

              <h4 className="ac-h4">Justificativa para o Comercial</h4>
              {textarea('dec-justificativa', '', 4, 'Justificativa que será apresentada no parecer para o comercial.')}
            </div>
          </div>

          {/* Documentos da análise - DEPS geradas + lastros anexados */}
          <div className="ac-card">
            <div className="ac-card-h"><IconFolder size={15} /> Documentos da Análise</div>
            <div className="ac-card-b">
              <p className="ac-ck-hint" style={{ marginTop: 0 }}>Relatórios DEPS gerados e documentos de lastro anexados - visualize ou baixe.</p>

              <h4 className="ac-h4">Relatórios DEPS</h4>
              <div className="ac-deps-panels">
                {(['ced', 'sac'] as const).map(alvo => {
                  const e = depsRaw[alvo];
                  const papel = alvo === 'ced' ? 'Cedente' : 'Sacado';
                  const anexoN = e ? depsAnexos.findIndex(a => a.alvo === alvo) + 1 : 0;
                  return (
                    <div key={alvo} className="ac-deps-panel-wrap">
                      {e && depsPanelDe(alvo)}
                      <div className="ac-deps-anexo-line">
                        {e ? (
                          <>
                            <span>
                              <strong>Anexo {anexoN === 1 ? 'I' : 'II'}</strong> do parecer · {e.nome || fmtDoc(e.documento)}
                              {e.norm.resumo ? ` · ${e.norm.resumo}` : ''}
                            </span>
                            <button className="ac-btn outline sm ac-btn-ico" onClick={() => openDepsResumo(alvo, true)}
                              title="Abre o relatório DEPS pronto para salvar em PDF">
                              <IconDownload size={13} /> PDF
                            </button>
                          </>
                        ) : (
                          <span>DEPS do {papel.toLowerCase()} ainda não consultada - o parecer sai sem esse anexo.</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <h4 className="ac-h4">Documentos anexados</h4>
              {lastroFiles.length === 0 ? (
                <p className="ac-ck-hint">Nenhum documento anexado.</p>
              ) : (
                <div className="ac-doclist">
                  {lastroFiles.map(f => (
                    <div key={f.name} className="ac-docrow">
                      <span className="ac-doc-ic">{f.mime?.includes('pdf') ? <IconDoc size={15} /> : <IconImage size={15} />}</span>
                      <div className="ac-doc-info">
                        <div className="ac-doc-name">{f.name}</div>
                        <div className="ac-doc-meta">{f.type || 'Documento'} · {(f.size / 1024).toFixed(0)} KB</div>
                      </div>
                      <div className="ac-doc-actions">
                        <button className="ac-btn outline sm ac-btn-ico" onClick={() => viewFile(f)}><IconEye size={13} /> Ver</button>
                        <button className="ac-btn outline sm ac-btn-ico" onClick={() => downloadFile(f)}><IconDownload size={13} /> Baixar</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="ac-btngroup">
            <button className="ac-btn outline" onClick={() => goStep(3)}><IconArrowLeft size={13} /> Voltar</button>
            <button className="ac-btn success" onClick={() => goStep(5)}>Gerar Parecer <IconArrowRight size={13} /></button>
          </div>
        </>
      )}

      {/* ───────── STEP 5: PARECER ───────── */}
      {step === 5 && (
        <>
          <Parecer
            gv={gv} dec={dec} adeqs={adeqs} docsFaltantes={docsFaltantes} checks={checkBools}
            validado={validado} solicitacao={solicitacao}
            protocolo={analiseSalva?.protocolo || protocolo}
            salvoEm={analiseSalva?.criado_em ?? null}
            depsAnexos={depsAnexos}
          />
          <div className="ac-btngroup ac-no-print" style={{ justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => window.print()}><IconPrinter size={14} /> Imprimir / PDF</button>
            {analiseSalva ? (
              <button className="btn btn-secondary" disabled title={`Salva em ${fmtDataHora(analiseSalva.criado_em)}`}>
                <IconCheckCircle size={14} /> Salva no histórico ({analiseSalva.protocolo})
              </button>
            ) : (
              <button className="btn btn-primary" onClick={salvarAnalise} disabled={salvandoAnalise}>
                {salvandoAnalise
                  ? <><IconSpinner size={14} /> {anexoProgresso ? `Salvando anexos ${anexoProgresso}…` : 'Salvando…'}</>
                  : <><IconCheckCircle size={14} /> Validar e salvar</>}
              </button>
            )}
            <button className="btn btn-secondary" onClick={resetAnalise}><IconClipboard size={14} /> Nova Análise</button>
          </div>
        </>
      )}
      </>)}

      {/* Preview de anexo - modal central */}
      {previewFile?.url && (
        <AnexoPreviewModal
          file={{ name: previewFile.name, url: previewFile.url, mime: previewFile.mime }}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Preview embutido do relatório oficial da DEPS */}
      {depsPreview && (
        <DepsPreviewModal
          nome={depsPreview.nome}
          url={depsPreview.url}
          onClose={() => setDepsPreview(null)}
          onOpenTab={() => window.open(depsPreview.url, '_blank', 'noopener')}
        />
      )}
    </div>
  );
}

// ── Anexos: preview compartilhado ────────────────────────────────────────────
// A análise em andamento tem os arquivos em memória (blobs) e o histórico os
// baixa do banco em base64. Os dois convergem para um object URL, então o modal
// de preview é o mesmo nos dois lugares.
type AnexoPreview = { name: string; url: string; mime?: string | null };

// base64 (com ou sem prefixo `data:`) → object URL. Um data URL de PDF não abre
// em <iframe> no Chrome, por isso convertemos para Blob em vez de usar direto.
function b64ToObjectUrl(base64: string, mime?: string | null): string {
  const comma = base64.indexOf(',');
  const ehData = base64.startsWith('data:');
  const raw = ehData && comma !== -1 ? base64.slice(comma + 1) : base64;
  let declarado = '';
  if (ehData) {
    const pv = base64.indexOf(';');
    const fim = pv > 5 && pv < comma ? pv : comma;
    const cand = fim > 5 ? base64.slice(5, fim) : '';
    // "data:base64,…" (blob sem tipo) não declara mime - só aceita algo com "/"
    if (cand.includes('/')) declarado = cand;
  }
  const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: mime || declarado || 'application/octet-stream' }));
}

function baixarUrl(url: string, nome: string) {
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
}

function AnexoPreviewModal({ file, onClose }: { file: AnexoPreview; onClose: () => void }) {
  return createPortal(
    <div className="anexos-overlay" style={{ zIndex: 1080 }} onClick={onClose}>
      <div className="anexos-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3 style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => window.open(file.url, '_blank')}>Nova aba</button>
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => baixarUrl(file.url, file.name)}><IconDownload size={13} /> Baixar</button>
            <button className="admin-modal-close" aria-label="Fechar" onClick={onClose}><IconX size={16} /></button>
          </div>
        </div>
        <div className="anexos-preview-body">
          {/* PDF e o relatório DEPS (HTML autocontido gerado pela plataforma) abrem no iframe */}
          {(file.mime || '').includes('pdf') || (file.mime || '').includes('html') ? (
            <iframe title={file.name} src={file.url} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} />
          ) : (file.mime || '').startsWith('image/') ? (
            <img src={file.url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--ac-g500)' }}>
              <p style={{ marginBottom: 12 }}>Sem pré-visualização para este tipo de arquivo.</p>
              <button className="ac-btn primary" onClick={() => baixarUrl(file.url, file.name)}>Baixar {file.name}</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function fmtVenc(iso: string | null): string {
  if (!iso) return '-';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

// Dropdown estilizado (substitui o <select> nativo) para os produtos DEPS
function DepsProdutoSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const sel = PRODUTOS_DEPS.find(p => p.id === value);
  const rect = btnRef.current?.getBoundingClientRect();
  const grupos: { tipo: 'PJ' | 'PF'; label: string }[] = [
    { tipo: 'PJ', label: 'Pessoa Jurídica' },
    { tipo: 'PF', label: 'Pessoa Física' },
  ];

  return (
    <>
      <button ref={btnRef} type="button" className="ac-input" onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: 'var(--ac-g900)' }}>{sel?.nome ?? 'Selecione'}</span>
        <svg width="11" height="7" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, color: 'var(--ac-g500)', transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed', top: (rect?.bottom ?? 0) + 6, left: rect?.left ?? 0, width: rect?.width ?? 200,
          zIndex: 99999, background: 'var(--white)', border: '1.5px solid var(--gray3)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card-hover)', padding: 6, maxHeight: 320, overflowY: 'auto',
        }}>
          {grupos.map(g => (
            <div key={g.tipo}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--ac-g400)', padding: '8px 10px 4px' }}>{g.label}</div>
              {PRODUTOS_DEPS.filter(p => p.tipo === g.tipo).map(p => {
                const active = p.id === value;
                return (
                  <div key={p.id} onClick={() => { onChange(p.id); setOpen(false); }}
                    style={{
                      padding: '8px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13.5,
                      fontWeight: active ? 700 : 500, color: 'var(--ac-g900)',
                      background: active ? 'var(--yd)' : 'transparent', transition: 'background .12s',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--ac-g100)'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {p.nome}
                  </div>
                );
              })}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

function ReadOnlyInfo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ac-g500)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ac-g900)', wordBreak: 'break-word' }}>{value?.trim() ? value : '-'}</div>
    </div>
  );
}

function SolicitacaoPicker({ token, value, loading, onChange }: {
  token: string;
  value: SolicitacaoItem | null;
  loading: boolean;
  onChange: (s: SolicitacaoItem | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<SolicitacaoItem[]>([]);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open || options.length > 0) return;
    setFetching(true);
    fetch('/api/admin-data?action=list_solicitacoes_for_aceite', { headers: { 'x-admin-session': token } })
      .then(r => r.json())
      .then(d => setOptions(d.solicitacoes ?? []))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [open, token]);

  const filtered = query.trim()
    ? options.filter(o => {
        const q = query.toLowerCase();
        const qDigits = query.replace(/\D/g, '');
        return (
          (o.cedente_nome ?? '').toLowerCase().includes(q) ||
          (o.cedente_razao_social ?? '').toLowerCase().includes(q) ||
          (o.nome_contratado ?? '').toLowerCase().includes(q) ||
          (o.sacado_razao_social ?? o.nome_sacado ?? '').toLowerCase().includes(q) ||
          (!!qDigits && (o.cedente_cnpj ?? o.cnpj_contratado ?? '').replace(/\D/g, '').includes(qDigits)) ||
          (!!qDigits && (o.sacado_cnpj_db ?? o.cnpj_sacado ?? '').replace(/\D/g, '').includes(qDigits)) ||
          (o.id ?? '').toLowerCase().includes(q)
        );
      })
    : options;

  if (value) {
    return (
      <div className="ac-sol-selected" style={{
        display: 'flex', alignItems: 'center', gap: 12, marginTop: 12,
        padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--yellow)',
        background: 'var(--yd)',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {value.cedente_nome ?? value.nome_contratado ?? '-'} → {value.sacado_razao_social ?? value.nome_sacado ?? '-'}
          </p>
          <p style={{ fontSize: 12, color: 'var(--ac-g600)', margin: '3px 0 0', fontWeight: 500 }}>
            {value.valor ?? '-'} · Venc. {fmtVenc(value.prazo_limite)}{loading ? ' · carregando documentos…' : ''}
          </p>
        </div>
        <button type="button" onClick={() => onChange(null)} className="ac-btn outline sm" style={{ flexShrink: 0 }}>
          Trocar
        </button>
      </div>
    );
  }

  const rect = inputRef.current?.getBoundingClientRect();

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginTop: 12 }}>
      <input
        ref={inputRef}
        className="ac-input"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Buscar solicitação por cedente, sacado, CNPJ ou ID…"
      />
      {open && createPortal(
        <div ref={dropRef} style={{
          position: 'fixed',
          top: (rect?.bottom ?? 0) + 6,
          left: rect?.left ?? 0,
          width: rect?.width ?? 320,
          zIndex: 99999,
          background: 'var(--white)', border: '1.5px solid var(--gray3)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card-hover)', maxHeight: 320, overflowY: 'auto', padding: 6,
        }}>
          {fetching ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: 13, color: 'var(--ac-g500)' }}>
              {query ? 'Nenhuma solicitação encontrada.' : 'Nenhuma solicitação cadastrada.'}
            </div>
          ) : filtered.map(s => (
            <div key={s.id} className="ac-sol-opt"
              onClick={() => { onChange(s); setOpen(false); setQuery(''); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--black)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.cedente_nome ?? s.cedente_razao_social ?? s.nome_contratado ?? '-'}
                </p>
                <span style={{ fontSize: 11, color: 'var(--ac-g500)', flexShrink: 0, fontWeight: 600 }}>{s.valor ?? '-'}</span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--ac-g500)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Sacado: {s.sacado_razao_social ?? s.nome_sacado ?? '-'} · Venc. {fmtVenc(s.prazo_limite)}
              </p>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function Ind({ label, val, cls, sub }: { label: string; val: string; cls?: string; sub?: string }) {
  return (
    <div className="ac-ind">
      <div className="ac-ind-label">{label}</div>
      <div className={`ac-ind-val${cls ? ' ' + cls : ''}`}>{val}</div>
      {sub && <div className="ac-ind-sub">{sub}</div>}
    </div>
  );
}

function DecMetric({ l, v, s, cls }: { l: string; v: string; s?: string; cls?: string }) {
  return (
    <div className="ac-dec-metric">
      <div className="l">{l}</div>
      <div className={`v${cls ? ' ' + cls : ''}`}>{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );
}

function DecRow({ l, v, sub, cls }: { l: string; v: string; sub?: string; cls?: string }) {
  return (
    <div className="ac-dec-row">
      <span className="ac-dec-row-l">{l}</span>
      <span className={`ac-dec-row-v${cls ? ' ' + cls : ''}`}>
        {v}
        {sub && <span className="sub">{sub}</span>}
      </span>
    </div>
  );
}

function DecisaoSummary({ dec, gv }: { dec: ReturnType<typeof computeDecisao>; gv: (id: string) => string }) {
  const restrCls = (v: number) => v > 15 ? 'red' : v > 5 ? 'amber' : 'green';
  const scoreCls = (s: number, low: number, mid: number) => s < low ? 'red' : s < mid ? 'amber' : 'green';
  const scoreSub = (s: number, low: number, mid: number) => s < low ? 'Abaixo do corte' : s < mid ? 'Atenção' : 'Confortável';
  const riskCls = dec.risk === 'elevado' ? 'red' : dec.risk === 'medio' ? 'amber' : 'green';
  const temLimite = dec.limiteOp > 0 && dec.limiteOp < Infinity;

  return (
    <>
      {/* Recomendação do motor */}
      <div className="ac-dec-rec">
        <div className="ac-dec-rec-main">
          <div className="ac-dec-rec-label">Recomendação do motor</div>
          <div className={`ac-dec-risk-badge ${riskCls}`}>Risco {dec.risk.toUpperCase()}</div>
        </div>
        <div className="ac-dec-rec-metrics">
          <DecMetric l="Tipo recomendado" v={dec.tipoRec} cls="purple" />
          <DecMetric l="Limite da operação" v={temLimite ? `R$ ${fb(dec.limiteOp)}` : '-'} cls="green"
            s={temLimite ? `Ced 30%: ${fb(dec.limiteCed)} · Sac 20%: ${fb(dec.limiteSac)}` : undefined} />
          <DecMetric l="Taxa sugerida" v={`${dec.taxa}%`} cls="purple" s="ao mês" />
          <DecMetric l="Vencimento" v={dec.venc || '-'} cls={dec.vencDias > 0 ? 'red' : 'green'} s={dec.vencLabel || undefined} />
        </div>
        {dec.tipoJust && <div className="ac-dec-rec-just">{dec.tipoJust}</div>}
      </div>

      {/* Comparação Cedente × Sacado */}
      <div className="ac-dec-compare">
        <div className="ac-dec-col">
          <div className="ac-dec-col-h"><IconBuilding size={14} /> Cedente</div>
          <DecRow l="Score" v={String(dec.cedScore || '-')} cls={dec.cedScore ? scoreCls(dec.cedScore, 350, 650) : undefined} sub={dec.cedScore ? scoreSub(dec.cedScore, 350, 650) : undefined} />
          <DecRow l="Restrições" v={`${dec.cedPropRestr.toFixed(1)}%`} cls={restrCls(dec.cedPropRestr)} sub={`R$ ${fb(dec.cedRestr)}`} />
          <DecRow l="Protestos" v={gv('ced-protestos') || '0'} sub={`R$ ${gv('ced-protestos-val') || '0'}`} />
          <DecRow l="Ações judiciais" v={gv('ced-acoes-qtd') || '0'} sub={`R$ ${gv('ced-acoes-val') || '0'}`} />
          <DecRow l="Faturamento base" v={`R$ ${fb(dec.cedFat)}`} />
        </div>
        <div className="ac-dec-col">
          <div className="ac-dec-col-h"><IconFactory size={14} /> Sacado</div>
          <DecRow l="Score" v={String(dec.sacScore || '-')} cls={dec.sacScore ? scoreCls(dec.sacScore, 500, 650) : undefined} sub={dec.sacScore ? scoreSub(dec.sacScore, 500, 650) : undefined} />
          <DecRow l="Restrições" v={`${dec.sacPropRestr.toFixed(1)}%`} cls={restrCls(dec.sacPropRestr)} sub={`R$ ${fb(dec.sacRestr)}`} />
          <DecRow l="Protestos" v={gv('sac-protestos') || '0'} sub={`R$ ${gv('sac-protestos-val') || '0'}`} />
          <DecRow l="Ações judiciais" v={gv('sac-acoes-qtd') || '0'} sub={`R$ ${gv('sac-acoes-val') || '0'}`} />
          <DecRow l="Faturamento base" v={`R$ ${fb(dec.sacFat)}`} />
        </div>
      </div>
    </>
  );
}

function RepCard({ icon, title, children }: { icon: ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="ac-rep-card">
      <div className="ac-rep-card-h">
        <span className="ac-rep-chip">{icon}</span>
        <span className="ac-rep-card-t">{title}</span>
      </div>
      <div className="ac-rep-card-b">{children}</div>
    </div>
  );
}

function RepItem({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div>
      <div className="ac-rep-label">{label}</div>
      <div className={`ac-rep-value${cls ? ' ' + cls : ''}`}>{value || '-'}</div>
    </div>
  );
}

// ── Diretrizes da casa (tabela credito_diretrizes) ───────────────────────────
// A base de conhecimento do motor: regras que o operador cadastra e que são
// injetadas no prompt em runtime. Até aqui os endpoints existiam sem tela - as
// regras entravam no banco sem ninguém conseguir vê-las ou revogá-las.
interface DiretrizRow {
  id: number;
  categoria: 'extracao' | 'interpretacao' | 'decisao' | string;
  escopo: string;
  instrucao: string;
  exemplo: string | null;
  status: 'ativa' | 'substituida' | 'revogada' | string;
  prioridade: number;
  origem: string | null;
  criado_em: string;
}
interface SugestaoDiretriz {
  categoria: 'extracao' | 'interpretacao' | 'decisao' | string;
  escopo: string;
  instrucao: string;
  exemplo: string;
  secao: string;
  confianca: string;
  usar: boolean;
}

const CAT_LABEL: Record<string, string> = {
  extracao: 'Extração (como ler os documentos)',
  interpretacao: 'Interpretação (como avaliar os dados)',
  decisao: 'Decisão / política (taxa, limite, exigências)',
};
const CAT_COR: Record<string, string> = { extracao: '#0E7490', interpretacao: '#4338CA', decisao: '#B45309' };
const STATUS_COR: Record<string, { bg: string; fg: string }> = {
  ativa: { bg: '#DCFCE7', fg: '#166534' },
  substituida: { bg: '#F3F4F6', fg: '#6B7280' },
  revogada: { bg: '#FEE2E2', fg: '#991B1B' },
};

function DiretrizesPanel({ token }: { token: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<DiretrizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [verTodas, setVerTodas] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [md, setMd] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [sugestoes, setSugestoes] = useState<SugestaoDiretriz[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const mdInputRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin-data?action=list_diretrizes&status=${verTodas ? 'all' : 'ativa'}`, {
        headers: { 'x-admin-session': token },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { toast('error', 'Falha ao carregar diretrizes', data?.error ?? `Erro ${res.status}`); return; }
      setRows((data?.diretrizes ?? []) as DiretrizRow[]);
    } catch (e: any) {
      toast('error', 'Falha ao carregar diretrizes', e?.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { carregar(); }, [verTodas, token]);

  async function revogar(d: DiretrizRow) {
    if (!window.confirm(`Revogar esta regra?\n\n"${d.instrucao}"\n\nEla deixa de valer nas próximas análises, mas continua no banco para auditoria.`)) return;
    try {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ action: 'revogar_diretriz', id: d.id }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast('error', 'Falha ao revogar', data?.error ?? `Erro ${res.status}`); return; }
      toast('success', 'Regra revogada', 'Não será mais injetada nas análises.');
      carregar();
    } catch (e: any) {
      toast('error', 'Falha ao revogar', e?.message);
    }
  }

  function escolherArquivo(f: File | null | undefined) {
    if (!f) return;
    setNomeArquivo(f.name);
    const r = new FileReader();
    r.onload = () => { setMd(String(r.result ?? '')); setSugestoes(null); };
    r.onerror = () => toast('error', 'Não foi possível ler o arquivo');
    r.readAsText(f);
  }

  async function lerMarkdown() {
    if (!md.trim()) return;
    setAnalisando(true);
    setSugestoes(null);
    try {
      const res = await fetch('/api/ai-parecer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({ markdown: true, texto: md }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast('error', 'Falha ao ler o documento', data?.error ?? `Erro ${res.status}`); return; }
      const lista: SugestaoDiretriz[] = (data.sugestoes ?? []).map((s: any) => ({
        ...s,
        // Confiança baixa entra desmarcada: foi inferência da IA, não regra explícita
        usar: String(s.confianca).toLowerCase() !== 'baixa',
      }));
      setSugestoes(lista);
      if (!lista.length) toast('info', 'Nenhuma regra encontrada', 'O documento não trouxe regras operacionais claras.');
      else toast('success', `${lista.length} regra(s) proposta(s)`, 'Revise, ajuste a categoria e importe as que valem.');
    } catch (e: any) {
      toast('error', 'Falha ao ler o documento', e?.message);
    } finally {
      setAnalisando(false);
    }
  }

  async function importar() {
    const escolhidas = (sugestoes ?? []).filter(s => s.usar && s.instrucao.trim());
    if (!escolhidas.length) { toast('info', 'Nada selecionado', 'Marque ao menos uma regra.'); return; }
    setSalvando(true);
    try {
      const res = await fetch('/api/admin-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
        body: JSON.stringify({
          action: 'importar_diretrizes',
          origem: nomeArquivo ? `importado de ${nomeArquivo}` : 'importação de markdown',
          diretrizes: escolhidas.map(s => ({
            categoria: s.categoria, escopo: s.escopo, instrucao: s.instrucao, exemplo: s.exemplo || null,
          })),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) { toast('error', 'Falha ao importar', data?.error ?? `Erro ${res.status}`); return; }
      toast('success', `${data.criadas} regra(s) importada(s)`,
        data.ignoradas ? `${data.ignoradas} ignorada(s) por já existirem.` : 'Já valem para as próximas análises.');
      setImportOpen(false); setMd(''); setNomeArquivo(''); setSugestoes(null);
      carregar();
    } catch (e: any) {
      toast('error', 'Falha ao importar', e?.message);
    } finally {
      setSalvando(false);
    }
  }

  const porCategoria = (cat: string) => rows.filter(r => r.categoria === cat);
  const ativas = rows.filter(r => r.status === 'ativa').length;

  return (
    <div className="ac-no-print">
      <div className="ac-card">
        <div className="ac-card-h">
          <IconBook size={15} /> Diretrizes da casa <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· {ativas} ativa(s)</span>
        </div>
        <div className="ac-card-b">
          <p className="ac-ck-hint" style={{ marginTop: 0 }}>
            Regras que o time define e que são <strong>injetadas no prompt da IA em toda análise</strong> - na leitura dos documentos
            (extração), na avaliação dos dados (interpretação) e na política de crédito (decisão). Nada é apagado: o que sai de
            circulação fica no banco como revogado, para auditoria.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="ac-btn primary sm" onClick={() => setImportOpen(v => !v)}>
              <IconDownload size={13} /> Importar de um documento (.md)
            </button>
            <button className="ac-btn outline sm" onClick={() => setVerTodas(v => !v)}>
              <IconEye size={13} /> {verTodas ? 'Mostrando todas' : 'Mostrar revogadas/substituídas'}
            </button>
            <button className="ac-btn outline sm" onClick={carregar} disabled={loading}><IconRefresh size={13} /> Atualizar</button>
          </div>

          {/* ── Importação a partir do markdown do analista ───────────────── */}
          {importOpen && (
            <div style={{ padding: 14, border: '1px solid var(--ac-g200)', borderRadius: 10, background: '#F7F7FB', marginBottom: 16 }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: '#4338CA', marginBottom: 6 }}><IconDownload size={12} /> Importar metodologia escrita</div>
              <p style={{ fontSize: 12, color: 'var(--ac-g500)', margin: '0 0 10px' }}>
                Escolha o arquivo <code>.md</code> (ou cole o conteúdo). A IA <strong>propõe</strong> as regras e classifica cada uma;
                você revisa e decide o que entra - nada é gravado sem sua confirmação.
              </p>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                <input
                  ref={mdInputRef}
                  type="file"
                  accept=".md,.markdown,.txt"
                  style={{ display: 'none' }}
                  onChange={e => escolherArquivo(e.target.files?.[0])}
                />
                <button className="ac-btn outline sm" onClick={() => mdInputRef.current?.click()}><IconDoc size={14} /> Escolher arquivo</button>
                {nomeArquivo && <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}><IconCheck size={12} /> {nomeArquivo}</span>}
                {md && <span style={{ fontSize: 11.5, color: 'var(--ac-g500)' }}>{md.length.toLocaleString('pt-BR')} caracteres</span>}
              </div>

              <div className="ac-fg" style={{ marginBottom: 8 }}>
                <label>Conteúdo</label>
                <textarea
                  className="ac-textarea"
                  rows={8}
                  value={md}
                  onChange={e => { setMd(e.target.value); setSugestoes(null); }}
                  placeholder="Cole aqui a metodologia em markdown, ou use o botão acima para escolher o arquivo…"
                />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="ac-btn primary sm" onClick={lerMarkdown} disabled={analisando || !md.trim()}>
                  {analisando ? <><IconSpinner size={13} /> Lendo o documento…</> : <><IconSearch size={13} /> Extrair regras</>}
                </button>
                <button className="ac-btn outline sm" onClick={() => { setImportOpen(false); setSugestoes(null); }} disabled={analisando || salvando}>
                  Cancelar
                </button>
              </div>

              {/* Revisão das regras propostas */}
              {sugestoes && sugestoes.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#1F2937', marginBottom: 8 }}>
                    {sugestoes.filter(s => s.usar).length} de {sugestoes.length} selecionada(s)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
                    {sugestoes.map((s, i) => {
                      const upd = (patch: Partial<SugestaoDiretriz>) =>
                        setSugestoes(prev => (prev ?? []).map((x, j) => j === i ? { ...x, ...patch } : x));
                      const baixa = String(s.confianca).toLowerCase() === 'baixa';
                      return (
                        <div key={i} style={{
                          padding: 10, borderRadius: 8, background: 'var(--white)',
                          border: `1px solid ${s.usar ? '#C7D2FE' : 'var(--ac-g200)'}`,
                          opacity: s.usar ? 1 : 0.65,
                        }}>
                          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input type="checkbox" checked={s.usar} onChange={e => upd({ usar: e.target.checked })} style={{ marginTop: 3 }} />
                            <span style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#1F2937' }}>{s.instrucao}</span>
                              {baixa && (
                                <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#B45309', background: '#FEF3C7', borderRadius: 999, padding: '2px 7px' }}>
                                  inferência - confira
                                </span>
                              )}
                              {s.exemplo && <span style={{ display: 'block', fontSize: 12, color: 'var(--ac-g500)', marginTop: 3 }}>ex.: {s.exemplo}</span>}
                              {s.secao && <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>origem: {s.secao}</span>}
                            </span>
                          </label>
                          <div className="ac-grid cols-2" style={{ gap: 8, marginTop: 8 }}>
                            <div className="ac-fg">
                              <label>Categoria</label>
                              <select className="ac-input" value={s.categoria} onChange={e => upd({ categoria: e.target.value })}>
                                <option value="interpretacao">Interpretação</option>
                                <option value="decisao">Decisão / política</option>
                                <option value="extracao">Extração</option>
                              </select>
                            </div>
                            <div className="ac-fg">
                              <label>Escopo</label>
                              <input className="ac-input" value={s.escopo} onChange={e => upd({ escopo: e.target.value })} placeholder="global" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <button className="ac-btn primary sm" onClick={importar} disabled={salvando}>
                      {salvando
                        ? <><IconSpinner size={13} /> Importando…</>
                        : <><IconSave size={13} /> Importar {sugestoes.filter(s => s.usar).length} regra(s)</>}
                    </button>
                    <button className="ac-btn outline sm" onClick={() => setSugestoes(prev => (prev ?? []).map(s => ({ ...s, usar: true })))} disabled={salvando}>
                      Marcar todas
                    </button>
                    <button className="ac-btn outline sm" onClick={() => setSugestoes(prev => (prev ?? []).map(s => ({ ...s, usar: false })))} disabled={salvando}>
                      Desmarcar todas
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Lista das diretrizes ──────────────────────────────────────── */}
          {loading ? (
            <div className="dux-spinner-row" style={{ padding: '10px 0' }}><span className="dux-spinner sm" /></div>
          ) : rows.length === 0 ? (
            <p className="ac-ck-hint">
              Nenhuma diretriz cadastrada ainda. Importe a metodologia escrita do analista acima, ou crie regras a partir das
              correções do parecer (botão "Salvar como regra permanente" na etapa Decisão).
            </p>
          ) : (
            (['extracao', 'interpretacao', 'decisao'] as const).map(cat => {
              const lista = porCategoria(cat);
              if (!lista.length) return null;
              return (
                <div key={cat} style={{ marginBottom: 18 }}>
                  <h4 className="ac-h4" style={{ color: CAT_COR[cat] }}>{CAT_LABEL[cat]} <span style={{ fontWeight: 500, opacity: 0.6 }}>({lista.length})</span></h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lista.map(d => {
                      const sc = STATUS_COR[d.status] ?? STATUS_COR.substituida;
                      return (
                        <div key={d.id} style={{
                          display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 11px',
                          border: '1px solid var(--ac-g200)', borderRadius: 8,
                          background: d.status === 'ativa' ? 'var(--white)' : '#FAFAFA',
                        }}>
                          <span style={{ background: sc.bg, color: sc.fg, fontSize: 10.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap', marginTop: 2 }}>
                            {d.status}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: '#1F2937', textDecoration: d.status === 'ativa' ? 'none' : 'line-through' }}>
                              {d.instrucao}
                            </div>
                            {d.exemplo && <div style={{ fontSize: 12, color: 'var(--ac-g500)', marginTop: 2 }}>ex.: {d.exemplo}</div>}
                            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                              escopo: {d.escopo}
                              {d.origem ? ` · ${d.origem}` : ''}
                              {d.criado_em ? ` · ${fmtDataHora(d.criado_em)}` : ''}
                            </div>
                          </div>
                          {d.status === 'ativa' && (
                            <button className="ac-btn outline sm" onClick={() => revogar(d)} title="Revogar" aria-label="Revogar"><IconX size={13} /></button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Histórico de análises (tabela credito_analises) ──────────────────────────
// Lista consultável das análises validadas, com filtros, exportação e reimpressão
// do parecer exatamente como foi emitido (a partir do snapshot).
const DEC_LABEL: Record<string, string> = { aprovado: 'Aprovado', condicionantes: 'Condicionantes', reprovado: 'Reprovado' };
const DEC_COLOR: Record<string, { bg: string; fg: string }> = {
  aprovado:       { bg: '#DCFCE7', fg: '#166534' },
  condicionantes: { bg: '#FEF3C7', fg: '#92400E' },
  reprovado:      { bg: '#FEE2E2', fg: '#991B1B' },
};
const RISCO_COLOR: Record<string, string> = { baixo: '#166534', medio: '#92400E', elevado: '#991B1B' };
// Teto da listagem (sem paginação) - avisado na UI quando é atingido
const LIMITE_HIST = 200;

function DecisaoPill({ status }: { status: string }) {
  const c = DEC_COLOR[status] ?? { bg: '#F3F4F6', fg: '#374151' };
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {DEC_LABEL[status] ?? status}
    </span>
  );
}

function HistoricoAnalises({ token }: { token: string }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<AnaliseHist[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [abrindo, setAbrindo] = useState<number | null>(null);
  const [detalhe, setDetalhe] = useState<{ hist: AnaliseHist; snapshot: AnaliseSnapshot; parecerIa: AiParecer | null; anexos: AnaliseAnexo[] } | null>(null);
  const [preview, setPreview] = useState<AnexoPreview | null>(null);
  const [carregandoAnexo, setCarregandoAnexo] = useState<number | null>(null);
  // Anexo baixado uma vez por análise aberta (o base64 não muda) - revogado ao sair.
  const urlsAnexos = useRef<Map<number, string>>(new Map());

  useEffect(() => () => { urlsAnexos.current.forEach(u => URL.revokeObjectURL(u)); }, []);

  function limparAnexos() {
    urlsAnexos.current.forEach(u => URL.revokeObjectURL(u));
    urlsAnexos.current.clear();
    setPreview(null);
  }

  // Conteúdo do anexo sob demanda: a listagem só traz metadados.
  async function urlDoAnexo(a: AnaliseAnexo): Promise<string | null> {
    const cache = urlsAnexos.current.get(a.id);
    if (cache) return cache;
    setCarregandoAnexo(a.id);
    try {
      const res = await fetch(`/api/admin-data?action=get_analise_arquivo_base64&id=${a.id}`, { headers: { 'x-admin-session': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.base64) {
        toast('error', 'Falha ao abrir o anexo', data?.error ?? `Erro ${res.status}`);
        return null;
      }
      const url = b64ToObjectUrl(String(data.base64), a.mime ?? data.mime ?? null);
      urlsAnexos.current.set(a.id, url);
      return url;
    } catch (e: any) {
      toast('error', 'Falha ao abrir o anexo', e?.message ?? 'Erro de rede');
      return null;
    } finally {
      setCarregandoAnexo(null);
    }
  }

  async function verAnexo(a: AnaliseAnexo) {
    const url = await urlDoAnexo(a);
    if (url) setPreview({ name: a.nome, url, mime: a.mime });
  }
  async function baixarAnexo(a: AnaliseAnexo) {
    const url = await urlDoAnexo(a);
    if (url) baixarUrl(url, a.nome);
  }

  // Filtros vão para o servidor (SQL); debounce só para não disparar por tecla.
  useEffect(() => {
    let cancelado = false;
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ action: 'list_analises', limit: String(LIMITE_HIST) });
        if (q.trim()) p.set('q', q.trim());
        if (status) p.set('status', status);
        if (de) p.set('de', de);
        if (ate) p.set('ate', ate);
        const res = await fetch(`/api/admin-data?${p}`, { headers: { 'x-admin-session': token } });
        const data = await res.json().catch(() => null);
        if (cancelado) return;
        if (!res.ok) { toast('error', 'Falha ao carregar o histórico', data?.error ?? `Erro ${res.status}`); return; }
        setRows((data?.analises ?? []) as AnaliseHist[]);
      } catch (e: any) {
        if (!cancelado) toast('error', 'Falha ao carregar o histórico', e?.message);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }, q ? 350 : 0);
    return () => { cancelado = true; clearTimeout(id); };
  }, [q, status, de, ate, token]);

  async function abrir(r: AnaliseHist) {
    setAbrindo(r.id);
    try {
      const res = await fetch(`/api/admin-data?action=analise_detail&id=${r.id}`, { headers: { 'x-admin-session': token } });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.analise) { toast('error', 'Falha ao abrir a análise', data?.error ?? `Erro ${res.status}`); return; }
      const snap = (data.analise.snapshot ?? {}) as AnaliseSnapshot;
      if (!snap.form) { toast('error', 'Análise sem snapshot', 'Não é possível reimprimir este parecer.'); return; }
      limparAnexos();
      setDetalhe({
        hist: r,
        snapshot: snap,
        parecerIa: (data.analise.parecer_ia ?? null) as AiParecer | null,
        anexos: (data.arquivos ?? []) as AnaliseAnexo[],
      });
    } catch (e: any) {
      toast('error', 'Falha ao abrir a análise', e?.message);
    } finally {
      setAbrindo(null);
    }
  }

  function exportar() {
    if (!rows.length) { toast('info', 'Nada para exportar', 'Nenhuma análise no filtro atual.'); return; }
    exportToCSV({
      title: 'Histórico de Análises de Crédito',
      filename: `analises-credito-${new Date().toISOString().slice(0, 10)}`,
      columns: [
        { header: 'Protocolo' }, { header: 'Data' }, { header: 'Analista' }, { header: 'Cedente' }, { header: 'CNPJ cedente' },
        { header: 'Sacado' }, { header: 'CNPJ sacado' }, { header: 'Valor' }, { header: 'Decisão' },
        { header: 'Risco' }, { header: 'Taxa (a.m.)' }, { header: 'Limite' }, { header: 'Tipo de operação' },
        { header: 'Recomendação IA' }, { header: 'Confiança IA' }, { header: 'Modelo IA' },
        { header: 'Anexos' },
      ],
      rows: rows.map(r => [
        r.protocolo, fmtDataHora(r.criado_em), r.criado_por_nome ?? '', r.cedente_nome ?? '', maskCpfCnpj(r.cedente_cnpj ?? ''),
        r.sacado_nome ?? '', maskCpfCnpj(r.sacado_cnpj ?? ''), r.valor ?? '', DEC_LABEL[r.status] ?? r.status,
        r.risco ?? '', r.taxa ?? '', r.limite ?? '', r.tipo_operacao ?? '',
        r.ia_recomendacao ? (DEC_LABEL[r.ia_recomendacao] ?? r.ia_recomendacao) : '', r.ia_confianca ?? '', r.ia_modelo ?? '',
        String(r.arquivo_count ?? 0),
      ]),
    });
  }

  // ── Detalhe: reimpressão do parecer a partir do snapshot ───────────────────
  if (detalhe) {
    const snap = detalhe.snapshot;
    const gvSnap = (id: string) => snap.form?.[id] ?? '';
    const decSnap = snap.dec ?? computeDecisao(gvSnap);
    const ia = detalhe.parecerIa;
    return (
      <>
        <div className="ac-btngroup ac-no-print" style={{ marginBottom: 14 }}>
          <button className="ac-btn outline" onClick={() => { limparAnexos(); setDetalhe(null); }}><IconArrowLeft size={13} /> Voltar ao histórico</button>
          <button className="ac-btn primary" onClick={() => window.print()}><IconPrinter size={13} /> Imprimir / PDF</button>
        </div>

        {/* Documentos que esta análise leu - congelados junto do parecer */}
        <div className="ac-card ac-no-print">
          <div className="ac-card-h"><IconClip size={15} /> Documentos anexados {detalhe.anexos.length > 0 && <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· {detalhe.anexos.length}</span>}</div>
          <div className="ac-card-b">
            {detalhe.anexos.length === 0 ? (
              <p className="ac-ck-hint" style={{ marginTop: 0 }}>
                Nenhum documento anexado a esta análise. Análises validadas antes desta funcionalidade não têm anexos gravados - os documentos originais seguem na solicitação e no cadastro do cedente.
              </p>
            ) : (
              <div className="ac-doclist">
                {detalhe.anexos.map(a => (
                  <div key={a.id} className="ac-docrow">
                    <span className="ac-doc-ic">{a.origem === 'deps' ? <IconChart size={15} /> : (a.mime || '').includes('pdf') ? <IconDoc size={15} /> : (a.mime || '').startsWith('image/') ? <IconImage size={15} /> : <IconClip size={15} />}</span>
                    <div className="ac-doc-info">
                      <div className="ac-doc-name">{a.nome}</div>
                      <div className="ac-doc-meta">
                        {[
                          a.tipo || 'Documento',
                          a.tamanho ? `${(a.tamanho / 1024).toFixed(0)} KB` : null,
                          a.origem ? (ORIGEM_LABEL[a.origem] ?? a.origem) : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="ac-doc-actions">
                      <button className="ac-btn outline sm ac-btn-ico" onClick={() => verAnexo(a)} disabled={carregandoAnexo === a.id}>
                        <IconEye size={13} /> {carregandoAnexo === a.id ? 'Abrindo…' : 'Ver'}
                      </button>
                      <button className="ac-btn outline sm ac-btn-ico" onClick={() => baixarAnexo(a)} disabled={carregandoAnexo === a.id}>
                        <IconDownload size={13} /> Baixar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {ia && (
          <div className="ac-card ac-no-print">
            <div className="ac-card-h"><IconBot size={15} /> Parecer da IA registrado nesta análise</div>
            <div className="ac-card-b">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: ia.resumo ? 10 : 0 }}>
                {ia.recomendacao && <DecisaoPill status={String(ia.recomendacao)} />}
                {ia.confianca && <span style={{ fontSize: 11, fontWeight: 700, color: '#4338CA', background: '#EDE9FE', borderRadius: 999, padding: '3px 9px' }}>confiança {ia.confianca}</span>}
                {detalhe.hist.ia_modelo && <span style={{ fontSize: 11, color: '#9CA3AF', alignSelf: 'center' }}>{detalhe.hist.ia_modelo}</span>}
              </div>
              {ia.resumo && <p style={{ fontSize: 13.5, color: '#374151', margin: 0, lineHeight: 1.55 }}>{ia.resumo}</p>}
              {ia.argumentacao && <p style={{ fontSize: 13, color: 'var(--ac-g500)', margin: '8px 0 0', lineHeight: 1.55 }}>{ia.argumentacao}</p>}
            </div>
          </div>
        )}

        <Parecer
          gv={gvSnap}
          dec={decSnap}
          adeqs={snap.adeqs ?? []}
          docsFaltantes={snap.docsFaltantes ?? []}
          checks={snap.checks ?? {}}
          validado
          solicitacao={snap.solicitacao ?? null}
          protocolo={detalhe.hist.protocolo}
          emitidoEm={detalhe.hist.criado_em}
          salvoEm={detalhe.hist.criado_em}
          depsAnexos={snap.deps_anexos ?? []}
        />

        {preview && <AnexoPreviewModal file={preview} onClose={() => setPreview(null)} />}
      </>
    );
  }

  // ── Lista ──────────────────────────────────────────────────────────────────
  return (
    <div className="ac-card ac-no-print">
      <div className="ac-card-h"><IconBook size={15} /> Histórico de análises {rows.length > 0 && <span style={{ fontWeight: 500, fontSize: 12, opacity: 0.7 }}>· {rows.length} registro(s)</span>}</div>
      <div className="ac-card-b">
        <p className="ac-ck-hint" style={{ marginTop: 0 }}>
          Cada análise validada na etapa Parecer fica registrada aqui e pode ser consultada e reimpressa a qualquer momento.
        </p>

        <div className="ac-grid cols-4" style={{ marginBottom: 12 }}>
          <div className="ac-fg">
            <label>Buscar</label>
            <input className="ac-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Cedente, sacado, CNPJ ou protocolo…" />
          </div>
          <div className="ac-fg">
            <label>Decisão</label>
            <select className="ac-input" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Todas</option>
              <option value="aprovado">Aprovado</option>
              <option value="condicionantes">Condicionantes</option>
              <option value="reprovado">Reprovado</option>
            </select>
          </div>
          <div className="ac-fg">
            <label>De</label>
            <input className="ac-input" type="date" value={de} onChange={e => setDe(e.target.value)} />
          </div>
          <div className="ac-fg">
            <label>Até</label>
            <input className="ac-input" type="date" value={ate} onChange={e => setAte(e.target.value)} />
          </div>
        </div>

        {rows.length >= LIMITE_HIST && (
          <p className="ac-ck-hint" style={{ color: '#92400E' }}>
            Mostrando as {LIMITE_HIST} análises mais recentes do filtro atual (sem paginação) - refine o período ou a busca para ver as demais. A exportação segue o que está na tela.
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button className="ac-btn outline sm" onClick={exportar} disabled={!rows.length}><IconDoc size={14} /> Exportar CSV</button>
          {(q || status || de || ate) && (
            <button className="ac-btn outline sm" onClick={() => { setQ(''); setStatus(''); setDe(''); setAte(''); }}><IconX size={13} /> Limpar filtros</button>
          )}
        </div>

        {loading ? (
          <div className="dux-spinner-row" style={{ padding: '10px 0' }}><span className="dux-spinner sm" /></div>
        ) : rows.length === 0 ? (
          <p className="ac-ck-hint">
            {q || status || de || ate ? 'Nenhuma análise encontrada com esses filtros.' : 'Nenhuma análise validada ainda. Conclua uma análise e clique em "Validar e salvar" na etapa Parecer.'}
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Data</th>
                  <th>Analista</th>
                  <th>Cedente</th>
                  <th>Sacado</th>
                  <th>Valor</th>
                  <th>Decisão</th>
                  <th>Risco</th>
                  <th>Taxa</th>
                  <th>Limite</th>
                  <th>Tipo</th>
                  <th>Anexos</th>
                  <th>IA</th>
                  <th style={{ textAlign: 'right' }}>Parecer</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const divergiu = !!r.ia_recomendacao && r.ia_recomendacao !== r.status;
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{r.protocolo}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDataHora(r.criado_em)}</td>
                      {/* Quem validou. Análise anterior ao login individual fica sem analista. */}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {r.criado_por_nome ? nomeCurto(r.criado_por_nome) : <span style={{ color: 'var(--gray3)' }}>-</span>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.cedente_nome || '-'}</div>
                        {r.cedente_cnpj && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{maskCpfCnpj(r.cedente_cnpj)}</div>}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.sacado_nome || '-'}</div>
                        {r.sacado_cnpj && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{maskCpfCnpj(r.sacado_cnpj)}</div>}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(r.valor)}</td>
                      <td><DecisaoPill status={r.status} /></td>
                      <td style={{ color: RISCO_COLOR[r.risco ?? ''] ?? '#374151', fontWeight: 700, textTransform: 'capitalize' }}>{r.risco || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.taxa ? `${r.taxa}%` : '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(r.limite)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.tipo_operacao || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {Number(r.arquivo_count ?? 0) > 0
                          ? <span title={`${r.arquivo_count} documento(s) anexado(s) a esta análise`} style={{ fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconClip size={13} /> {r.arquivo_count}</span>
                          : <span style={{ color: '#D1D5DB' }}>-</span>}
                      </td>
                      <td>
                        {r.ia_recomendacao ? (
                          <span title={divergiu ? 'A IA sugeriu diferente da decisão do operador' : 'IA de acordo com a decisão'}
                            style={{ fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', color: divergiu ? '#B45309' : '#6B7280' }}>
                            {divergiu && <><IconAlert size={11} /> </>}{DEC_LABEL[r.ia_recomendacao] ?? r.ia_recomendacao}
                          </span>
                        ) : <span style={{ color: '#D1D5DB' }}>-</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="ac-btn outline sm ac-btn-ico" onClick={() => abrir(r)} disabled={abrindo === r.id}>
                          <IconEye size={13} /> {abrindo === r.id ? 'Abrindo…' : 'Ver'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Anexo do parecer: relatório DEPS ────────────────────────────────────────
// Mesma estrutura do relatório gerado pelo card da solicitação (as linhas vêm
// da mesma função em lib/depsReport), só que impressa junto do parecer: cada
// parte vira um anexo em página própria, com o link do relatório oficial.
const ROMANOS = ['I', 'II', 'III', 'IV'];

function DepsAnexoSecao({ anexo, numero, protocolo }: { anexo: DepsAnexo; numero: number; protocolo: string }) {
  const papel = anexo.alvo === 'ced' ? 'Cedente' : 'Sacado';
  const credito = depsCreditoRows(anexo.norm?.deps);
  const cadastro = depsCadastroRows(anexo.norm?.empresa);
  const tabela = (titulo: string, rows: DepsReportRow[], vazio: string) => (
    <div className="ac-anexo-sec">
      <h3 className="ac-anexo-sec-t">{titulo}</h3>
      {rows.length ? (
        <table className="ac-anexo-table">
          <tbody>
            {rows.map(r => (
              <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="ac-anexo-empty">{vazio}</p>}
    </div>
  );
  return (
    <div className="ac-rep-anexo">
      <div className="ac-anexo-head">
        <div className="ac-anexo-tag">Anexo {ROMANOS[numero - 1] ?? numero}</div>
        <div className="ac-anexo-title">Relatório de Crédito DEPS · {papel}</div>
        <div className="ac-anexo-sub">
          {[anexo.nome || '-', anexo.documento ? fmtDoc(anexo.documento) : null, `Parecer ${protocolo}`]
            .filter(Boolean).join(' · ')}
        </div>
      </div>
      <div className="ac-anexo-meta">
        {anexo.produto && <span>Produto DEPS: <strong>{anexo.produto}</strong></span>}
        {anexo.dataConsulta && <span>Consulta: <strong>{anexo.dataConsulta}</strong></span>}
        <span>Origem: <strong>{anexo.reutilizou ? 'histórico da DEPS' : 'consulta nova'}</strong></span>
      </div>
      {tabela('Crédito & Restritivos', credito, 'Sem dados de crédito retornados pela DEPS.')}
      {tabela('Dados Cadastrais', cadastro, 'Sem dados cadastrais retornados pela DEPS.')}
      {anexo.link && (
        <div className="ac-anexo-link">
          <strong>Relatório oficial DEPS</strong> - versão completa e interativa no portal:<br />
          <a href={anexo.link} target="_blank" rel="noopener noreferrer">{anexo.link}</a>
        </div>
      )}
      <div className="ac-anexo-foot">
        Dados de bureau fornecidos pela DEPS e retidos nesta análise. Uso restrito à análise de crédito da DUX Factoring.
      </div>
    </div>
  );
}

function Parecer({ gv, dec, adeqs, docsFaltantes, checks, validado, solicitacao, protocolo, emitidoEm, salvoEm, depsAnexos = [] }: {
  gv: (id: string) => string;
  dec: ReturnType<typeof computeDecisao>;
  adeqs: Adeq[];
  docsFaltantes: string[];
  checks: Record<string, boolean>;
  validado: boolean;
  solicitacao: SolicitacaoItem | null;
  protocolo?: string;        // protocolo fixo (histórico); sem ele, gera na hora
  emitidoEm?: string;        // data ISO de emissão (histórico)
  salvoEm?: string | null;   // preenchido quando o parecer veio do histórico
  depsAnexos?: DepsAnexo[];  // relatórios DEPS anexados ao final do parecer
}) {
  const status = gv('dec-status');
  if (!status) {
    return <div className="ac-note purple" style={{ textAlign: 'center', padding: 40 }}><IconAlert size={14} /> Selecione o status (Aprovado / Condicionantes / Reprovado) na etapa Decisão.</div>;
  }
  // Partes: priorizam o que está registrado na solicitação; caem para o formulário
  const cedNome = solicitacao?.cedente_nome ?? solicitacao?.nome_contratado ?? gv('op-cedente-nome');
  const cedCnpj = solicitacao?.cedente_cnpj ?? solicitacao?.cnpj_contratado ?? gv('op-cedente-cnpj');
  const sacNome = solicitacao?.sacado_razao_social ?? solicitacao?.nome_sacado ?? gv('op-sacado-nome');
  const sacCnpj = solicitacao?.sacado_cnpj_db ?? solicitacao?.cnpj_sacado ?? gv('op-sacado-cnpj');
  const sMap: Record<string, string> = { aprovado: 'APROVADO', condicionantes: 'APROVADO COM CONDICIONANTES', reprovado: 'REPROVADO' };
  const iconMap: Record<string, ReactNode> = {
    aprovado: <IconCheckCircle size={34} />, condicionantes: <IconAlert size={34} />, reprovado: <IconXCircle size={34} />,
  };
  const subMap: Record<string, string> = {
    aprovado: 'Operação dentro dos parâmetros de risco da DUX.',
    condicionantes: 'Aprovada mediante cumprimento das condicionantes abaixo.',
    reprovado: 'Risco acima dos parâmetros aceitos pela DUX.',
  };
  const now = emitidoEm ? new Date(emitidoEm) : new Date();
  const numAC = protocolo || novoProtocolo(now);

  // Documentos faltantes - IA + checklist
  const faltantes = [...docsFaltantes];
  const addF = (cond: boolean, kw: string[], label: string) => {
    if (cond && !faltantes.some(f => kw.some(k => f.toLowerCase().includes(k)))) faltantes.push(label);
  };
  addF(!checks['ck-identidade'], ['cnh', 'identidade'], 'Identidade do representante legal (CNH/RG)');
  addF(!checks['ck-contrato'], ['contrato social'], 'Contrato social / alteração contratual');
  addF(!checks['ck-endereco'], ['endereço'], 'Comprovante de endereço');
  addF(!checks['ck-financeiro'], ['balanço', 'dre'], 'Demonstrativos financeiros (Balanço/DRE)');
  addF(!checks['ck-faturamento'], ['faturamento'], 'Declaração de faturamento');
  addF(!checks['ck-bancario'], ['bancário'], 'Dados bancários');
  addF(!checks['ck-deps-ced'], ['deps cedente', 'crédito do cedente'], 'Relatório de crédito do cedente (DEPs/Quod/Serasa)');
  addF(!checks['ck-deps-sac'], ['deps sacado', 'crédito do sacado'], 'Relatório de crédito do sacado (DEPs/Quod/Serasa)');

  // Justificativa
  const justM = gv('dec-justificativa');
  let just = justM;
  if (!just) {
    just = `Análise da operação de ${fmtMoeda(gv('op-valor'), 'N/D')} entre cedente ${cedNome || 'N/D'} e sacado ${sacNome || 'N/D'}. `;
    if (gv('ced-score')) just += `Cedente: score ${gv('ced-score')}${gv('ced-pont12') ? ', pont. ' + gv('ced-pont12') + '%' : ''}. `;
    if (gv('sac-score')) just += `Sacado: score ${gv('sac-score')}${gv('sac-pont12') ? ', pont. ' + gv('sac-pont12') + '%' : ''}. `;
    just += `Tipo recomendado: ${gv('dec-tipo-rec')}. ${gv('dec-tipo-just') || ''} `;
    if (status === 'condicionantes') just += 'Operação aprovada mediante cumprimento das condicionantes.';
    else if (status === 'reprovado') just += 'Risco acima dos parâmetros DUX.';
    else just += 'Indicadores dentro dos parâmetros.';
  }

  const validAdeqs = adeqs.filter(a => a.texto.trim());

  return (
    <div className="ac-parecer ac-rep">
      {/* Cabeçalho */}
      <div className="ac-rep-head">
        <div className="ac-rep-logo"><IconChart size={24} /></div>
        <div className="ac-rep-title">Parecer de Análise de Crédito</div>
        <div className="ac-rep-sub">Antecipação de Recebíveis · DUX Factoring</div>
      </div>

      {/* Protocolo */}
      <div className="ac-rep-proto">
        <div className="ac-rep-proto-label">Protocolo</div>
        <div className="ac-rep-proto-value">{numAC}</div>
        <div className="ac-rep-proto-date">Emitido em {now.toLocaleDateString('pt-BR')}</div>
      </div>

      {/* Resultado */}
      <div className={`ac-rep-result ${status}`}>
        <div className="ac-rep-result-icon">{iconMap[status]}</div>
        <div>
          <div className="ac-rep-result-label">Resultado da análise</div>
          <div className="ac-rep-result-text">{sMap[status]}</div>
          <div className="ac-rep-result-sub">{subMap[status]}</div>
        </div>
      </div>

      {/* Partes */}
      <RepCard icon={<IconBuilding size={15} />} title="Cedente">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 48px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 340 }}><RepItem label="Razão Social" value={cedNome} /></div>
          <RepItem label="CNPJ" value={maskCpfCnpj(cedCnpj)} cls="sec" />
        </div>
      </RepCard>
      <RepCard icon={<IconFactory size={15} />} title="Sacado">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 48px', alignItems: 'flex-start' }}>
          <div style={{ minWidth: 340 }}><RepItem label="Razão Social" value={sacNome} /></div>
          <RepItem label="CNPJ" value={maskCpfCnpj(sacCnpj)} cls="sec" />
        </div>
      </RepCard>

      {/* Condições comerciais */}
      <RepCard icon={<IconMoney size={15} />} title="Condições Comerciais">
        <div className="ac-rep-grid">
          <RepItem label="Taxa (a.m.)" value={`${gv('dec-taxa') || '-'}%`} cls="purple" />
          <RepItem label="Limite de Crédito" value={fmtMoeda(gv('dec-limite'))} cls="green" />
          <RepItem label="Tipo de Operação" value={gv('dec-tipo-rec')} cls="purple" />
          {dec.venc && <RepItem label="Vencimento" value={dec.venc} cls={dec.vencDias > 0 ? 'red' : 'green'} />}
        </div>
      </RepCard>

      {/* Condicionantes e adequações */}
      {validAdeqs.length > 0 && (
        <RepCard icon={<IconClipboard size={15} />} title={`${status === 'condicionantes' ? 'Condicionantes e ' : ''}Adequações (${validAdeqs.length})`}>
          {validAdeqs.map((a, i) => (
            <div key={i} className="ac-rep-adeq">
              <span className={`ac-rep-adeq-num ${a.tipo === 'Bloqueante' ? 'bloq' : 'naobl'}`}>{i + 1}</span>
              <div>
                <div className="ac-rep-adeq-text">{a.texto}</div>
                <div className="ac-rep-adeq-meta">{a.resp} · {a.tipo}</div>
              </div>
            </div>
          ))}
        </RepCard>
      )}

      {/* Documentos pendentes */}
      {faltantes.length > 0 && (
        <RepCard icon={<IconClip size={15} />} title={`Documentos Pendentes (${faltantes.length})`}>
          <p className="ac-rep-text" style={{ marginBottom: 10 }}>Os seguintes documentos não foram fornecidos e devem ser solicitados ao cedente:</p>
          <ul className="ac-rep-pend">{faltantes.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </RepCard>
      )}

      {/* Justificativa */}
      <RepCard icon={<IconNote size={15} />} title="Justificativa da Análise">
        <p className="ac-rep-text">{just}</p>
      </RepCard>

      {/* Formalização */}
      <RepCard icon={<IconUser size={15} />} title="Formalização">
        <p className="ac-rep-text">
          <strong>Representante legal:</strong> {gv('ced-repr-nome') || 'Não identificado'}{gv('ced-repr-cpf') ? ' - CPF: ' + maskCPF(gv('ced-repr-cpf')) : ''}
        </p>
        <p className="ac-rep-text" style={{ marginTop: 4 }}>
          <strong>Tipo de operação recomendado:</strong> {gv('dec-tipo-rec') || '-'}
        </p>
      </RepCard>

      {salvoEm
        ? <div className="ac-note ok"><strong><IconCheckCircle size={13} /> Parecer validado e salvo no histórico</strong> em {fmtDataHora(salvoEm)}.</div>
        : validado && <div className="ac-note ok"><strong><IconCheckCircle size={13} /> Parecer validado e registrado nesta sessão.</strong></div>}

      {/* Assinatura */}
      <div className="ac-rep-foot">
        <div className="ac-sign">
          <div className="ac-sign-line" />
          <div className="ac-sign-label">Análise de Crédito · DUX Factoring</div>
        </div>
        <div className="ac-sign">
          <div className="ac-sign-line" />
          <div className="ac-sign-label">Emitido em {now.toLocaleDateString('pt-BR')} · {numAC}</div>
        </div>
      </div>

      {/* Anexos - relatórios DEPS que alimentaram esta análise, um por página */}
      {depsAnexos.length > 0 && (
        <div className="ac-rep-anexo-nota">
          <IconClip /> Este parecer segue acompanhado de {depsAnexos.length === 1 ? '1 anexo' : `${depsAnexos.length} anexos`}:
          {' '}{depsAnexos.map((a, i) => `Anexo ${ROMANOS[i] ?? i + 1} - Relatório DEPS do ${a.alvo === 'ced' ? 'cedente' : 'sacado'}`).join('; ')}.
        </div>
      )}
      {depsAnexos.map((a, i) => (
        <DepsAnexoSecao key={a.alvo} anexo={a} numero={i + 1} protocolo={numAC} />
      ))}
    </div>
  );
}
