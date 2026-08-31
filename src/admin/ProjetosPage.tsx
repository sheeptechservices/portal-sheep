import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import {
  IconAlert, IconClip, IconDoc, IconDownload, IconImage, IconInbox,
  IconChevronRight, IconEdit, IconEye, IconLink, IconMarcoAndamento, IconMarcoBloqueado,
  IconAgrupar, IconCalendario, IconCheck, IconFolder, IconOrdenar, IconSearch,
  IconMarcoCancelado, IconMarcoConcluido, IconMarcoPlanejado,
  IconPlus, IconPrioridadeAlta, IconPrioridadeBaixa, IconPrioridadeMaxima,
  IconPrioridadeMedia, IconTrash, IconTrendDown, IconTrendFlat, IconTrendUp, IconTrendWavy,
  IconX, IconZip,
} from '../components/icons';
import FilterDropdown from '../components/FilterDropdown';
import { logoDoCliente } from '../lib/marcas';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';

// ─────────────────────────────────────────────────────────────────────────────
//  Projetos - o cadastro dos projetos da casa e o acompanhamento de cada um.
//
//  Duas abas sobre a mesma lista, porque são duas perguntas diferentes:
//    Geral  → "quais projetos existem?"  cadastro, edição e exclusão.
//    Gestão → "como eles estão indo?"    gestor, prazo e progresso.
//
//  A segunda não é só leitura: o progresso e o status são o que mais muda no
//  dia a dia, então ficam editáveis ali mesmo, sem abrir o formulário inteiro.
// ─────────────────────────────────────────────────────────────────────────────

export const STATUS_PROJETO = ['Em andamento', 'Pausado', 'Concluído', 'Cancelado'] as const;

/** Cor de cada status. Verde só para concluído: no resto do sistema verde é
 *  desfecho positivo, e "em andamento" não é desfecho nenhum. */
const COR_STATUS: Record<string, string> = {
  'Em andamento': '#B58300',
  'Pausado': '#6E6F69',
  'Concluído': '#23A455',
  'Cancelado': '#D93025',
};

/** Como a lista de entregas pode ser ordenada. A ordem de criação é o padrão
 *  porque as entregas são cadastradas na sequência em que devem acontecer. */
/** Como a lista de entregas pode ser agrupada. Desligado por padrão: agrupar
 *  ajuda em lista longa e atrapalha em lista curta. */
const AGRUPAMENTOS_ENTREGA = [
  { valor: 'nenhum', label: 'Sem agrupamento' },
  { valor: 'status', label: 'Agrupar por status' },
  { valor: 'categoria', label: 'Agrupar por categoria' },
] as const;

const ORDENS_ENTREGA = [
  { valor: 'criacao', label: 'Ordem de criação' },
  { valor: 'titulo', label: 'Título (A a Z)' },
  { valor: 'prazo', label: 'Prazo mais próximo' },
  { valor: 'status', label: 'Status' },
] as const;

/** Estados possíveis de uma entrega, para exibição. Só dois são escolhidos por
 *  alguém: ver `RESOLUCAO_ENTREGA`. */
export const STATUS_ENTREGA = ['Planejada', 'Em andamento', 'Bloqueada', 'Concluída', 'Cancelada'] as const;
export const ENTREGA_CONCLUIDA = 'Concluída';
export const ENTREGA_CANCELADA = 'Cancelada';

/** O que uma pessoa decide. "Em andamento" e "Bloqueada" saem das tarefas da
 *  entrega - respectivamente, ter tarefa em curso e ter tarefa com etiqueta de
 *  bloqueio - e por isso não estão aqui. "Planejada" é o estado de partida e o
 *  destino de quem reabre uma entrega resolvida. */
export const RESOLUCAO_ENTREGA = [ENTREGA_CONCLUIDA, ENTREGA_CANCELADA] as const;
export const ENTREGA_PLANEJADA = 'Planejada';

const ICONE_ENTREGA: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Planejada': IconMarcoPlanejado,
  'Em andamento': IconMarcoAndamento,
  'Bloqueada': IconMarcoBloqueado,
  'Concluída': IconMarcoConcluido,
  'Cancelada': IconMarcoCancelado,
};

const COR_ENTREGA: Record<string, string> = {
  'Planejada': '#6E6F69',
  'Em andamento': '#B58300',
  'Bloqueada': '#D93025',
  'Concluída': '#23A455',
  'Cancelada': '#8A857A',
};

/** Prioridade do projeto. Sai como "Média" porque a maioria é: exigir a
 *  escolha consciente em todo cadastro só produziria ruído. */
export const PRIORIDADES = ['Urgentíssima', 'Urgente', 'Média', 'Baixa'] as const;
export const PRIORIDADE_PADRAO = 'Média';

const COR_PRIORIDADE: Record<string, string> = {
  'Urgentíssima': '#D93025',
  'Urgente': '#C2410C',
  'Média': '#B58300',
  'Baixa': '#6E6F69',
};

/** Barras que crescem com o nível; o topo da escala usa desenho próprio. */
const DESENHO_PRIORIDADE: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Urgentíssima': IconPrioridadeMaxima,
  'Urgente': IconPrioridadeAlta,
  'Média': IconPrioridadeMedia,
  'Baixa': IconPrioridadeBaixa,
};

/** O ícone já sai na cor do nível. A cor mora aqui, e não em cada uso, senão a
 *  célula editável e a de leitura acabam divergindo. */
const ICONE_PRIORIDADE: Record<string, (p: { size?: number }) => JSX.Element> =
  Object.fromEntries(PRIORIDADES.map(nivel => [
    nivel,
    ({ size = 14 }: { size?: number }) => (
      <span style={{ color: COR_PRIORIDADE[nivel], display: 'inline-flex' }}>
        {DESENHO_PRIORIDADE[nivel]({ size })}
      </span>
    ),
  ]));

/** Leitura semanal de saúde: semáforo mais o porquê. É histórico, não estado,
 *  então a saúde atual é sempre a leitura mais recente. */
export const SAUDES = ['Saudável', 'Em risco', 'Com problemas'] as const;

const COR_SAUDE: Record<string, string> = {
  'Saudável': '#23A455',
  'Em risco': '#B58300',
  'Com problemas': '#D93025',
};

/** Cada estado também tem desenho próprio: quem não distingue verde de vermelho
 *  fica sem informação nenhuma se a cor for o único sinal. */
const ICONE_SAUDE: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Saudável': IconTrendUp,
  'Em risco': IconTrendWavy,
  'Com problemas': IconTrendDown,
};

/** Com que etiqueta o arquivo entra. A classificação fina é feita na linha
 *  do anexo, depois de ver o que subiu. */
const ETIQUETA_PADRAO = 'Documento';

const ETIQUETAS = ['Proposta', 'Contrato', 'Documento', 'Slide', 'Planilha', 'Outro'] as const;

/** Papéis da equipe. Gestor vem primeiro porque é o que a aba de gestão destaca. */
export const PAPEIS_EQUIPE = ['Gestor', 'Dev', 'Designer', 'Analista', 'QA', 'Outro'] as const;

/** Tipos de projeto da casa. Lista fechada de propósito: campo livre viraria
 *  "BI", "bi" e "Business Intelligence" na mesma base, e o filtro não fecharia. */
export const TIPOS_PROJETO = ['BI', 'SaaS', 'Automação', 'Integração', 'App', 'Site', 'Consultoria', 'Outro'] as const;


/** Anexo grande vira base64 ainda maior (~33% a mais) e o corpo do POST estoura.
 *  8 MB é o teto confortável para o limite de 20 MB do endpoint. */
const LIMITE_ANEXO = 8 * 1024 * 1024;

interface Pessoa { id: string; nome: string; email: string; foto_url: string | null }
interface Membro extends Pessoa { papel: string }

export interface Arquivo {
  id: number;
  projeto_id: string;
  etiqueta: string;
  nome: string;
  tipo: string;
  tamanho: number;
  criado_em: string;
  criado_por_nome: string | null;
}

export interface RegistroSaude {
  id: number;
  projeto_id: string;
  estado: string;
  descricao: string;
  criado_em: string;
  criado_por_nome: string | null;
}

export interface Evidencia {
  id: number;
  entrega_id: number;
  nome: string;
  tipo: string;
  tamanho: number;
  /** O que o arquivo prova. */
  comentario: string | null;
  criado_em: string;
  criado_por_nome: string | null;
}

export interface Entrega {
  id: number;
  projeto_id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  status: string;
  prazo: string | null;
  responsaveis: string[];
  links: { label: string; url: string }[];
  ordem: number;
  evidencias: Evidencia[];
}

/** Entrega ainda sem id, montada no cadastro de um projeto novo. */
export interface EntregaPendente {
  titulo: string;
  descricao: string;
  categoria: string;
  status: string;
  prazo: string;
  responsaveis: string[];
  links: { label: string; url: string }[];
}

export interface Reuniao {
  id: number;
  projeto_id: string;
  data: string;
  assunto: string;
  notas: string;
  participantes: string[];
  criado_por_nome: string | null;
}

export interface Projeto {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  tipo: string | null;
  repositorio: string | null;
  drive: string | null;
  objetivo: string | null;
  status: string;
  prioridade: string;
  data_inicio: string | null;
  previsao_entrega: string | null;
  progresso: number;
  observacoes: string | null;
  equipe: Membro[];
  arquivos: Arquivo[];
  /** Da leitura mais recente para a mais antiga. */
  saude: RegistroSaude[];
  /** Da reunião mais recente para a mais antiga. */
  reunioes: Reuniao[];
  /** Na ordem em que foram criadas. */
  entregas: Entrega[];
  criado_em: string;
}

interface Cliente { id: string; nome: string }

/** Anexo ainda não enviado. Projeto novo só ganha id depois de salvo, então os
 *  arquivos ficam aqui até existir a que anexá-los. */
interface AnexoPendente {
  etiqueta: string; nome: string; tipo: string; tamanho: number; base64: string;
}

const VAZIO = {
  nome: '', descricao: '', cliente_id: '', tipo: '', repositorio: '', drive: '',
  entregas: [] as EntregaPendente[],
  status: 'Em andamento' as string, prioridade: PRIORIDADE_PADRAO as string,
  equipe: [] as { usuario_id: string; papel: string }[],
  data_inicio: '', previsao_entrega: '', observacoes: '',
  // Sem controle no formulário: o progresso passa a ser automático. Continua no
  // rascunho porque o update grava a coluna - se saísse daqui, toda edição
  // devolveria 0 ao banco e apagaria o andamento.
  progresso: 0,
};

type Rascunho = typeof VAZIO;

const fmtData = (v: string | null) =>
  v ? new Date(`${v}T00:00:00`).toLocaleDateString('pt-BR') : '-';

const fmtTamanho = (b: number) =>
  b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Dias até a entrega. Negativo é atraso. */
function diasPara(v: string | null): number | null {
  if (!v) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${v}T00:00:00`).getTime() - hoje.getTime()) / 86400000);
}

/** O gestor sai da própria equipe, não de uma coluna separada: um só lugar
 *  define quem faz o quê no projeto. */
const gestorDe = (p: Projeto) => p.equipe.find(m => m.papel === 'Gestor') ?? null;

/** Fração de entregas concluídas. O servidor guarda o mesmo número em
 *  `progresso`; calcular aqui evita a tela mostrar valor velho entre a gravação
 *  de uma entrega e o recarregamento. */
/** Conteúdo do arquivo em base64, sem o prefixo `data:`. Serve tanto ao anexo
 *  do projeto quanto à evidência de entrega. */
function lerBase64(f: File): Promise<string> {
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.readAsDataURL(f);
  });
}

/** Nome de exibição de um link, tirado do próprio endereço. Pedir um rótulo a
 *  quem só quer colar um link do Drive é atrito sem retorno. */
function rotuloDoLink(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const CONHECIDOS: Record<string, string> = {
      'drive.google.com': 'Drive',
      'docs.google.com': 'Documento',
      'github.com': 'GitHub',
      'figma.com': 'Figma',
      'notion.so': 'Notion',
    };
    return CONHECIDOS[host] ?? host;
  } catch {
    return url;
  }
}

/** Há quanto tempo foi a última leitura de saúde. A idade importa tanto quanto
 *  o estado: "Saudável" de dois meses atrás não diz nada sobre hoje. */
function idadeDaLeitura(iso: string | undefined, hoje = new Date()): string {
  if (!iso) return '';
  const dias = Math.floor((hoje.getTime() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias < 7) return `${dias}d`;
  const semanas = Math.floor(dias / 7);
  return semanas < 9 ? `${semanas}sem` : `${Math.floor(dias / 30)}m`;
}

/** Anel de progresso, no lugar da barra: ocupa a largura de um ícone e a fatia
 *  preenchida se lê de relance, que é o que uma linha de tabela pede. */
function AnelProgresso({ valor, size = 15 }: { valor: number; size?: number }) {
  const v = Math.min(100, Math.max(0, valor));
  const r = 7;
  const volta = 2 * Math.PI * r;
  const cor = v === 100 ? COR_ENTREGA[ENTREGA_CONCLUIDA] : 'var(--gray)';
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r={r} stroke="var(--gray3)" strokeWidth="2.4" />
      <circle cx="9" cy="9" r={r} stroke={cor} strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * volta} ${volta}`} transform="rotate(-90 9 9)" />
    </svg>
  );
}

function progressoDe(p: Projeto): number {
  // Cancelada sai da conta: deixou de ser trabalho a fazer.
  const valem = (p.entregas ?? []).filter(e => e.status !== ENTREGA_CANCELADA);
  if (!valem.length) return 0;
  return Math.round((valem.filter(e => e.status === ENTREGA_CONCLUIDA).length / valem.length) * 100);
}

function ChipStatus({ status }: { status: string }) {
  const cor = COR_STATUS[status] ?? 'var(--gray)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700,
      color: cor, background: `${cor}14`, padding: '3px 9px', borderRadius: 'var(--radius-pill)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor }} />
      {status}
    </span>
  );
}

function Barra({ valor }: { valor: number }) {
  const v = Math.min(100, Math.max(0, valor));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--gray3)', overflow: 'hidden' }}>
        <div style={{
          width: `${v}%`, height: '100%', borderRadius: 3,
          background: 'var(--yellow)', transition: 'width var(--transition)',
        }} />
      </div>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray)', minWidth: 32, textAlign: 'right' }}>
        {v}%
      </span>
    </div>
  );
}

function Avatar({ nome, foto, size = 22 }: { nome: string; foto?: string | null; size?: number }) {
  // URL do Google expira e volta 403. Quando a imagem falha, o avatar cai nas
  // iniciais em vez de deixar o quadrado quebrado na tela.
  const [falhou, setFalhou] = useState(false);

  if (foto && !falhou) {
    return (
      <img
        src={foto}
        alt=""
        // Sem isto o Google recusa a imagem servida de outra origem.
        referrerPolicy="no-referrer"
        onError={() => setFalhou(true)}
        title={nome}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }

  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--yellow)',
      color: 'var(--on-yellow)', fontSize: size * 0.43, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{iniciais(nome)}</span>
  );
}

function Gestor({ nome, email, foto }: { nome: string | null; email: string | null; foto?: string | null }) {
  if (!nome) return <span style={{ color: 'var(--gray2)' }}>Sem gestor</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} title={email ?? undefined}>
      <Avatar nome={nome} foto={foto} />{nome}
    </span>
  );
}

/** Onde a lista de um dropdown deve nascer. Ela vive num portal no `body`, e
 *  portal não é cortado por `overflow` - mas nada impede que passe da borda da
 *  janela. Na vertical: sem espaço embaixo e com espaço em cima, abre para
 *  cima. Na horizontal: gatilho estreito e encostado na direita empurraria a
 *  lista para fora, então o canto é preso dentro da janela. */
function ancorar(el: HTMLElement, itens: number, larguraMin = 150) {
  const r = el.getBoundingClientRect();
  const MARGEM = 8;
  const altura = Math.min(MARGEM + itens * 36, 320);
  const cabeAbaixo = window.innerHeight - r.bottom - MARGEM >= altura;
  // Largura fixa, e não mínima: com `minWidth` a caixa cresce com o conteúdo
  // (um email longo, por exemplo) e passa do tamanho que este cálculo reservou,
  // furando o limite abaixo. Quem usa isto precisa cortar o texto com
  // reticências.
  const width = Math.min(Math.max(r.width, larguraMin), window.innerWidth - 2 * MARGEM);
  return {
    top: cabeAbaixo || r.top < altura ? r.bottom + 4 : r.top - altura - 4,
    left: Math.max(MARGEM, Math.min(r.left, window.innerWidth - width - MARGEM)),
    width,
  };
}

// ── Anexos ──────────────────────────────────────────────────────────────────

/** Cor e desenho pelo tipo do arquivo. As classes `pdf`, `img` e `zip` já
 *  existem para a lista de anexos do Funil. */
function iconeArquivo(nome: string, tipo: string) {
  const ext = nome.slice(nome.lastIndexOf('.')).toLowerCase();
  if (tipo === 'application/pdf' || ext === '.pdf') return { classe: 'pdf', icone: <IconDoc size={15} /> };
  if (tipo === 'application/zip' || ext === '.zip') return { classe: 'zip', icone: <IconZip size={15} /> };
  if (tipo.startsWith('image/')) return { classe: 'img', icone: <IconImage size={15} /> };
  return { classe: '', icone: <IconClip size={15} /> };
}

/** Gatilho compacto para trocar a classificação dentro de uma linha, no mesmo
 *  desenho que o Funil usa nos anexos. Serve a etiqueta do arquivo e ao papel
 *  da pessoa: as duas listas são curtas e moram do lado direito da linha. */
function SeletorCompacto({ valor, opcoes, titulo, icones, onChange }: {
  valor: string;
  opcoes: readonly string[];
  titulo: string;
  /** Desenho por opção. Sem isto o seletor mostra só o texto. */
  icones?: Record<string, (p: { size?: number }) => JSX.Element>;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function abrir() {
    setPos(ancorar(triggerRef.current!, opcoes.length));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button ref={triggerRef} type="button" className="anexo-cat-trigger" title={titulo} onClick={abrir}>
        {icones?.[valor]?.({ size: 13 })}
        <span>{valor}</span>
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {opcoes.map(o => (
            <div key={o} className={`status-select-option${o === valor ? ' active' : ''}`}
              onClick={() => { onChange(o); setAberto(false); }}>
              {icones?.[o]?.({ size: 13 })}
              <span>{o}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function LinhaAnexo({ nome, tamanho, tipo, etiqueta, onEtiqueta, onBaixar, onRemover }: {
  nome: string; tamanho: number; tipo: string; etiqueta: string;
  onEtiqueta: (v: string) => void;
  /** Ausente no anexo que ainda não subiu: não há de onde baixar. */
  onBaixar?: () => void;
  onRemover: () => void;
}) {
  const { classe, icone } = iconeArquivo(nome, tipo);
  return (
    <div className="admin-file-item">
      <div className={`detail-file-icon ${classe}`}>{icone}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--black)', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nome}>
          {nome}
        </p>
        <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '1px 0 0' }}>
          {fmtTamanho(tamanho)}{onBaixar ? '' : ' · ainda não enviado'}
        </p>
      </div>
      <SeletorCompacto valor={etiqueta} opcoes={ETIQUETAS} titulo="Etiqueta" onChange={onEtiqueta} />
      {onBaixar && (
        <button type="button" className="admin-file-download" title="Baixar" onClick={onBaixar}>
          <IconDownload size={13} />
        </button>
      )}
      <button type="button" className="file-delete-btn" title="Remover anexo"
        aria-label={`Remover ${nome}`} onClick={onRemover}>
        <IconTrash size={13} />
      </button>
    </div>
  );
}

// ── Saúde do projeto ────────────────────────────────────────────────────────

/** Pastilha do semáforo, no mesmo desenho do chip de status. */
/** Sem leitura o chip não some: um projeto sem acompanhamento é informação, e
 *  esconder isso faz ele parecer igual a um que está em dia. */
const SEM_LEITURA = 'Sem update';

function ChipSaude({ estado, size = 11.5 }: { estado: string; size?: number }) {
  const cor = COR_SAUDE[estado] ?? 'var(--gray2)';
  const Icone = ICONE_SAUDE[estado] ?? IconTrendFlat;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: size, fontWeight: 700,
      color: cor, background: `${cor}14`, padding: '3px 9px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>
      {Icone ? <Icone size={13} /> : null}
      {estado}
    </span>
  );
}

/** Leitura semanal de saúde. Fica fora do formulário de propósito: cada
 *  registro é gravado na hora, e não ao salvar o projeto - o histórico é o
 *  produto aqui, e um rascunho perdido levaria a leitura junto. */
function SecaoSaude({ registros, salvando, onRegistrar, onExcluir }: {
  registros: RegistroSaude[];
  salvando: boolean;
  onRegistrar: (estado: string, descricao: string) => Promise<void>;
  onExcluir: (r: RegistroSaude) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [estado, setEstado] = useState<string>('Saudável');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');

  async function registrar() {
    if (!descricao.trim()) {
      setErro('Descreva a situação do projeto.');
      return;
    }
    await onRegistrar(estado, descricao.trim());
    setDescricao('');
    setErro('');
    setAbrindo(false);
  }

  return (
    <section>
      <div className="admin-section-head">
        <p className="admin-section-title">
          Saúde
          {/* Sem leitura também mostra chip, em cinza: o vazio aqui é a
              informação de que ninguém olhou o projeto ainda. */}
          <span style={{ marginLeft: 8 }}>
            <ChipSaude estado={registros[0]?.estado ?? SEM_LEITURA} size={10} />
          </span>
        </p>
        <button type="button" className="secao-add" onClick={() => setAbrindo(a => !a)}
          title="Registrar leitura de saúde" aria-label="Registrar leitura de saúde">
          <IconPlus size={14} />
        </button>
      </div>

      {abrindo && (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {SAUDES.map(e => {
              const ativo = e === estado;
              const cor = COR_SAUDE[e];
              const Icone = ICONE_SAUDE[e];
              return (
                <button key={e} type="button" onClick={() => setEstado(e)}
                  style={{
                    flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '7px 6px', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    border: `1.5px solid ${ativo ? cor : 'var(--gray3)'}`,
                    background: ativo ? `${cor}14` : 'var(--white)',
                    color: ativo ? cor : 'var(--gray2)',
                    transition: 'border-color var(--transition), color var(--transition), background var(--transition)',
                  }}>
                  <Icone size={13} />
                  {e}
                </button>
              );
            })}
          </div>
          <textarea className={`form-input${erro ? ' error' : ''}`} rows={2} value={descricao}
            onChange={e => { setDescricao(e.target.value); if (erro) setErro(''); }}
            placeholder="O que sustenta essa leitura: o que avançou, o que travou, o que precisa de decisão" />
          {erro && <p className="form-error">{erro}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="modal-acao" onClick={() => { setAbrindo(false); setErro(''); }}>
              Cancelar
            </button>
            <button type="button" className="modal-acao-primaria" disabled={salvando}
              onClick={() => void registrar()}>
              {salvando ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {registros.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>
          Nenhuma leitura ainda. A primeira dá o ponto de partida do acompanhamento.
        </p>
      ) : (
        <div className="admin-file-list">
          {registros.map(reg => (
            <div key={reg.id} className="admin-file-item" style={{ alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, marginTop: 1, color: COR_SAUDE[reg.estado] ?? 'var(--gray)' }}>
                {(ICONE_SAUDE[reg.estado] ?? IconTrendWavy)({ size: 15 })}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0,
                  color: COR_SAUDE[reg.estado] ?? 'var(--gray)' }}>
                  {reg.estado}
                  <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--gray2)' }}>
                    {fmtData(reg.criado_em.slice(0, 10))}
                    {reg.criado_por_nome ? ` · ${reg.criado_por_nome}` : ''}
                  </span>
                </p>
                <p style={{ fontSize: 12, color: 'var(--gray)', margin: '3px 0 0', whiteSpace: 'pre-wrap' }}>
                  {reg.descricao}
                </p>
              </div>
              <button type="button" className="file-delete-btn" title="Excluir leitura"
                aria-label="Excluir leitura de saúde" onClick={() => onExcluir(reg)}>
                <IconX size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Categoria da entrega ────────────────────────────────────────────────────

/** Campo livre que reaproveita o que já foi escrito. Lista fechada engessaria a
 *  casa; campo solto viraria "BI", "bi" e "B.I." na mesma base. A sugestão
 *  puxa a grafia existente sem impedir uma categoria nova. */
function CampoCategoria({ valor, sugestoes, onChange }: {
  valor: string;
  sugestoes: string[];
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const campoRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const q = valor.trim().toLocaleLowerCase('pt-BR');
  const combinam = sugestoes.filter(c =>
    c.toLocaleLowerCase('pt-BR') !== q && (!q || c.toLocaleLowerCase('pt-BR').includes(q)));

  function abrir() {
    if (!campoRef.current) return;
    setPos(ancorar(campoRef.current, Math.min(combinam.length, 6), 200));
    setAberto(true);
  }
  useDropdownDismiss(aberto, [campoRef, dropRef], () => setAberto(false));

  return (
    <>
      <input ref={campoRef} className="form-input" value={valor}
        onChange={e => { onChange(e.target.value); abrir(); }}
        onFocus={abrir}
        placeholder="Automação, Relatório, Integração"
        onKeyDown={e => { if (e.key === 'Escape') setAberto(false); }} />
      {aberto && combinam.length > 0 && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {combinam.slice(0, 8).map(c => (
            <div key={c} className="status-select-option"
              onMouseDown={e => { e.preventDefault(); onChange(c); setAberto(false); }}>
              <span>{c}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Prévia de arquivo ───────────────────────────────────────────────────────

/** Mostra a evidência sem sair do portal, no mesmo modal que o Funil usa para
 *  os anexos. Imagem e PDF abrem aqui; o resto oferece o download, porque o
 *  navegador não sabe desenhar. */
function PreviaEvidencia({ evidencia, onCarregar, onBaixar, onFechar }: {
  evidencia: Evidencia;
  /** O buscador vem da página: o `api` carrega o token da sessão. */
  onCarregar: (ev: Evidencia) => Promise<{ tipo: string; base64: string } | null>;
  onBaixar: (ev: Evidencia) => void;
  onFechar: () => void;
}) {
  const [conteudo, setConteudo] = useState<{ tipo: string; url: string } | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    let criada = '';
    (async () => {
      try {
        const r = await onCarregar(evidencia);
        if (!vivo) return;
        if (!r?.base64) { setErro('O arquivo não veio.'); return; }
        const bytes = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0));
        criada = URL.createObjectURL(new Blob([bytes], { type: r.tipo }));
        setConteudo({ tipo: r.tipo, url: criada });
      } catch {
        if (vivo) setErro('Não foi possível abrir o arquivo.');
      }
    })();
    // A URL do blob segura o arquivo em memória enquanto existir: soltá-la ao
    // fechar evita acumular cópias a cada prévia aberta.
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [evidencia.id]);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [onFechar]);

  const imagem = conteudo?.tipo.startsWith('image/');
  const pdf = conteudo?.tipo === 'application/pdf';

  return createPortal(
    <div className="file-preview-backdrop" style={{ zIndex: 10002 }} onClick={onFechar}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">{evidencia.nome}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="file-preview-action" onClick={() => onBaixar(evidencia)}>
              <IconDownload size={13} />
              Baixar
            </button>
            <button type="button" className="file-preview-close" aria-label="Fechar" onClick={onFechar}>
              <IconX size={16} />
            </button>
          </div>
        </div>
        <div className="file-preview-body">
          {erro && <div className="file-preview-unsupported"><p>{erro}</p></div>}
          {!erro && !conteudo && <div className="file-preview-spinner" />}
          {conteudo && imagem && (
            <img src={conteudo.url} alt={evidencia.nome} className="file-preview-img" />
          )}
          {conteudo && pdf && (
            <iframe src={conteudo.url} className="file-preview-iframe" title={evidencia.nome} />
          )}
          {conteudo && !imagem && !pdf && (
            <div className="file-preview-unsupported">
              <p>Visualização não disponível para este formato.</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }}
                onClick={() => onBaixar(evidencia)}>
                Baixar arquivo
              </button>
            </div>
          )}
        </div>
        {evidencia.comentario && (
          <p style={{ fontSize: 12.5, color: 'var(--gray)', margin: 0, padding: '12px 20px',
            borderTop: '1px solid var(--gray3)', whiteSpace: 'pre-wrap' }}>
            {evidencia.comentario}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Escolha de pessoas ──────────────────────────────────────────────────────

/** Seleção múltipla de pessoas num campo só. Com a lista de usuários crescendo,
 *  espalhar um botão por pessoa na tela ocupava mais espaço a cada cadastro
 *  novo; aqui o campo tem altura fixa e a lista mora no dropdown. */
function SeletorPessoas({ pessoas, valor, onChange, vazio = 'Escolher pessoas' }: {
  pessoas: Pessoa[];
  valor: string[];
  onChange: (v: string[]) => void;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtradas = pessoas.filter(p => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q) return true;
    return p.nome.toLocaleLowerCase('pt-BR').includes(q)
      || p.email.toLocaleLowerCase('pt-BR').includes(q);
  });

  function abrir() {
    setPos(ancorar(triggerRef.current!, Math.min(filtradas.length + 1, 7), 240));
    setBusca('');
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  const escolhidas = valor
    .map(id => pessoas.find(p => p.id === id))
    .filter((p): p is Pessoa => !!p);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={abrir} className="liquidez-trigger"
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0, minHeight: 42,
          padding: '5px 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}>
        {escolhidas.length === 0 ? (
          <span style={{ color: 'var(--gray2)' }}>{vazio}</span>
        ) : (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
            {escolhidas.map(p => (
              <span key={p.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px 2px 2px', borderRadius: 'var(--radius-pill)',
                background: 'var(--gray4)', fontSize: 11.5, fontWeight: 600,
              }}>
                <Avatar nome={p.nome} foto={p.foto_url} size={18} />
                {p.nome}
              </span>
            ))}
          </span>
        )}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--transition)' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {pessoas.length > 6 && (
            <input autoFocus className="form-input" value={busca}
              onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa"
              style={{ height: 32, fontSize: 12.5, marginBottom: 4 }} />
          )}
          {filtradas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, padding: '6px 8px' }}>
              Ninguém com esse nome.
            </p>
          ) : filtradas.map(p => {
            const ativo = valor.includes(p.id);
            return (
              // O dropdown não fecha ao escolher: seleção múltipla quase sempre
              // marca mais de um, e reabrir a cada clique seria um castigo.
              <div key={p.id} className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => onChange(ativo ? valor.filter(x => x !== p.id) : [...valor, p.id])}>
                <Avatar nome={p.nome} foto={p.foto_url} size={20} />
                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ display: 'block', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
                </span>
                {ativo && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--yellow)' }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Entregas do projeto ─────────────────────────────────────────────────────

function ChipEntrega({ status }: { status: string }) {
  const cor = COR_ENTREGA[status] ?? 'var(--gray2)';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      color: cor, background: `${cor}14`, padding: '2px 8px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor }} />
      {status}
    </span>
  );
}

/** Editor de uma entrega. O mesmo componente serve a entrega já gravada e à que
 *  ainda está sendo montada num projeto novo. O status fica de fora: ele é
 *  resolvido no marco da linha ou deduzido das tarefas. */
function EditorEntrega({ inicial, pessoas, categorias, salvando, onSalvar, onCancelar }: {
  inicial?: Entrega | EntregaPendente;
  pessoas: Pessoa[];
  /** Categorias já usadas, para a grafia não se multiplicar. */
  categorias: string[];
  salvando: boolean;
  onSalvar: (e: EntregaPendente) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [categoria, setCategoria] = useState(inicial?.categoria ?? '');
  const status = inicial?.status ?? ENTREGA_PLANEJADA;
  const [prazo, setPrazo] = useState(inicial?.prazo ?? '');
  const [responsaveis, setResponsaveis] = useState<string[]>(inicial?.responsaveis ?? []);
  const [links, setLinks] = useState<{ label: string; url: string }[]>(inicial?.links ?? []);
  const [url, setUrl] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});

  function adicionarLink() {
    const limpo = url.trim();
    if (!limpo) return;
    setLinks(l => [...l, { label: rotuloDoLink(limpo), url: limpo }]);
    setUrl('');
  }

  function salvar() {
    if (!titulo.trim()) {
      setErros({ titulo: 'Informe o título da entrega.' });
      return;
    }
    onSalvar({ titulo: titulo.trim(), descricao, categoria: categoria.trim(),
      status, prazo, responsaveis, links });
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 10,
      border: '1.5px solid var(--gray3)', borderRadius: 'var(--radius-md)', padding: 12,
    }}>
      <div className="form-group">
        <label className="form-label">Título *</label>
        <input className={`form-input${erros.titulo ? ' error' : ''}`} value={titulo} autoFocus
          onChange={e => { setTitulo(e.target.value); setErros({}); }}
          placeholder="Funil de leads no ar" />
        {erros.titulo && <p className="form-error">{erros.titulo}</p>}
      </div>

      {/* Status não é campo de formulário: ou é resolução, tomada no marco da
          linha, ou vem das tarefas. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Categoria</label>
          <CampoCategoria valor={categoria} sugestoes={categorias} onChange={setCategoria} />
        </div>
        <div className="form-group">
          <label className="form-label">Prazo</label>
          <DatePicker compact allowPast value={prazo} onChange={setPrazo} />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Responsáveis</label>
        <SeletorPessoas pessoas={pessoas} valor={responsaveis} onChange={setResponsaveis}
          vazio="Escolher responsáveis" />
      </div>

      <div className="form-group">
        <label className="form-label">Descritivo</label>
        <textarea className="form-input" rows={3} value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="O que precisa estar pronto para esta entrega ser dada como feita" />
      </div>

      <div className="form-group">
        <label className="form-label">Referências</label>
        {links.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
            {links.map((l, i) => (
              <div key={i} className="admin-file-item" style={{ padding: '6px 9px' }}>
                <span style={{ color: 'var(--gray2)', flexShrink: 0 }}><IconLink size={14} /></span>
                <span style={{ flex: 1, minWidth: 0 }} title={l.url}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{l.label}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.url}
                  </span>
                </span>
                <button type="button" className="file-delete-btn" title="Remover link"
                  aria-label={`Remover ${l.label}`}
                  onClick={() => setLinks(x => x.filter((_, j) => j !== i))}>
                  <IconTrash size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="form-input" style={{ flex: 1 }} value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarLink(); } }} />
          <button type="button" className="secao-add" onClick={adicionarLink} disabled={!url.trim()}
            title="Adicionar link" aria-label="Adicionar link">
            <IconPlus size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="modal-acao" onClick={onCancelar}>Cancelar</button>
        <button type="button" className="modal-acao-primaria" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar entrega'}
        </button>
      </div>
    </div>
  );
}

/** Lista de entregas. Num projeto já criado cada mudança grava na hora; num
 *  projeto novo elas ficam em memória até o projeto existir. */
function SecaoEntregas({
  entregas, pendentes, pessoas, categorias, salvando,
  onSalvarEntrega, onExcluirEntrega, onAlterarPendentes,
  onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  /** Já gravadas. Vazio enquanto o projeto não existe. */
  entregas: Entrega[];
  /** Em memória, no cadastro de um projeto novo. */
  pendentes: EntregaPendente[];
  pessoas: Pessoa[];
  /** Categorias já usadas em qualquer projeto: a grafia vem de lá. */
  categorias: string[];
  salvando: boolean;
  onSalvarEntrega: (dados: EntregaPendente, id?: number) => Promise<void>;
  onExcluirEntrega: (e: Entrega) => void;
  onAlterarPendentes: (v: EntregaPendente[]) => void;
  onSubirEvidencia: (e: Entrega, arquivos: FileList | null, comentario?: string) => Promise<void>;
  onBaixarEvidencia: (ev: Evidencia) => void;
  onVerEvidencia: (ev: Evidencia) => void;
}) {
  const [editando, setEditando] = useState<number | 'novo' | null>(null);
  const [editandoPendente, setEditandoPendente] = useState<number | null>(null);
  // Fechadas por padrão: a lista serve para varrer o projeto de relance, e o
  // detalhe de cada uma só interessa quando se olha para ela.
  const [abertas, setAbertas] = useState<number[]>([]);
  // O detalhe só é montado depois da primeira abertura, e daí em diante fica.
  // Sem isso um projeto com muitas entregas construiria todos os detalhes de
  // uma vez, e a lista fechada é justamente o caso comum.
  const [jaAbertas, setJaAbertas] = useState<number[]>([]);

  function alternar(id: number) {
    setJaAbertas(j => (j.includes(id) ? j : [...j, id]));
    setAbertas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  }
  /** Entrega que alguém tentou concluir sem prova: o diálogo pede o arquivo. */
  const [concluindo, setConcluindo] = useState<Entrega | null>(null);
  /** Excluir leva as evidências junto e não tem desfazer: confirma antes. */
  const [excluindoEntrega, setExcluindoEntrega] = useState<Entrega | null>(null);

  /** Troca só o status, preservando o resto da entrega - `salvar_entrega`
   *  regrava a linha inteira. */
  function comStatus(e: Entrega, status: string): EntregaPendente {
    return {
      titulo: e.titulo, descricao: e.descricao ?? '', categoria: e.categoria ?? '', status,
      prazo: e.prazo ?? '', responsaveis: e.responsaveis, links: e.links,
    };
  }

  async function escolherStatus(e: Entrega, status: string) {
    // Concluir passa sempre pelo diálogo, mesmo com prova antiga guardada: a
    // entrega foi reaberta e mudou, então a prova tem que ser a nova.
    if (status === ENTREGA_CONCLUIDA) {
      setConcluindo(e);
      return;
    }
    await onSalvarEntrega(comStatus(e, status), e.id);
  }

  const gravado = entregas.length > 0;
  const total = entregas.length + pendentes.length;

  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [ordem, setOrdem] = useState<string>('criacao');
  const [agrupar, setAgrupar] = useState<string>('nenhum');

  const visiveis = useMemo(() => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    const filtradas = q
      ? entregas.filter(e =>
          e.titulo.toLocaleLowerCase('pt-BR').includes(q)
          || (e.descricao ?? '').toLocaleLowerCase('pt-BR').includes(q))
      : entregas;

    const posicao = (e: Entrega) => STATUS_ENTREGA.indexOf(e.status as typeof STATUS_ENTREGA[number]);
    const copia = [...filtradas];
    if (ordem === 'titulo') copia.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
    // Entrega sem prazo vai para o fim: ela não compete por urgência.
    if (ordem === 'prazo') copia.sort((a, b) => (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999'));
    if (ordem === 'status') copia.sort((a, b) => posicao(a) - posicao(b) || a.ordem - b.ordem);
    return copia;
  }, [entregas, busca, ordem]);

  /** A lista já filtrada e ordenada, repartida em blocos. Sem agrupamento é um
   *  bloco só, sem título, e o desenho da lista não muda. */
  const blocos = useMemo(() => {
    if (agrupar === 'nenhum') return [{ titulo: '', itens: visiveis }];

    const chave = (e: Entrega) => (agrupar === 'status'
      ? e.status
      : (e.categoria ?? '').trim() || 'Sem categoria');

    // Por status a ordem é a da escala, não a alfabética: "Bloqueada" antes de
    // "Planejada" inverteria a leitura do andamento.
    const nomes = [...new Set(visiveis.map(chave))].sort((a, b) => (
      agrupar === 'status'
        ? STATUS_ENTREGA.indexOf(a as typeof STATUS_ENTREGA[number])
          - STATUS_ENTREGA.indexOf(b as typeof STATUS_ENTREGA[number])
        : a === 'Sem categoria' ? 1 : b === 'Sem categoria' ? -1 : a.localeCompare(b, 'pt-BR')
    ));

    return nomes.map(titulo => ({ titulo, itens: visiveis.filter(e => chave(e) === titulo) }));
  }, [visiveis, agrupar]);

  return (
    <section>
      <div className="admin-section-head">
        <p className="admin-section-title">
          Entregas *
          {total > 0 && (
            <span style={{ marginLeft: 6, fontWeight: 600 }}>
              ({busca.trim() ? `${visiveis.length} de ${total}` : total})
            </span>
          )}
        </p>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" className="secao-add"
            onClick={() => { setBuscando(b => !b); if (buscando) setBusca(''); }}
            title="Buscar entrega" aria-label="Buscar entrega" aria-expanded={buscando}>
            <IconSearch size={13} />
          </button>
          <SeletorLista valor={ordem} onChange={setOrdem} opcoes={ORDENS_ENTREGA}
            icone={IconOrdenar} rotulo="Ordenar entregas" />
          <SeletorLista valor={agrupar} onChange={setAgrupar} opcoes={AGRUPAMENTOS_ENTREGA}
            icone={IconAgrupar} rotulo="Agrupar entregas" />
          <button type="button" className="secao-add"
            onClick={() => (gravado ? setEditando('novo') : setEditandoPendente(-1))}
            title="Adicionar entrega" aria-label="Adicionar entrega">
            <IconPlus size={14} />
          </button>
        </span>
      </div>

      {buscando && (
        <input autoFocus className="form-input" value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por título ou descritivo"
          onKeyDown={e => { if (e.key === 'Escape') { setBusca(''); setBuscando(false); } }}
          style={{ marginBottom: 10, height: 36, fontSize: 13 }} />
      )}

      {(editando === 'novo' || editandoPendente === -1) && (
        <EditorEntrega
          pessoas={pessoas}
          categorias={categorias}
          salvando={salvando}
          onSalvar={dados => {
            if (gravado || entregas.length) void onSalvarEntrega(dados);
            else onAlterarPendentes([...pendentes, dados]);
            setEditando(null); setEditandoPendente(null);
          }}
          onCancelar={() => { setEditando(null); setEditandoPendente(null); }}
        />
      )}

      {total === 0 && editando === null && editandoPendente === null && (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>
          Nenhuma entrega. O projeto precisa de ao menos uma.
        </p>
      )}

      {total > 0 && visiveis.length === 0 && pendentes.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>
          Nenhuma entrega com "{busca.trim()}".
        </p>
      )}

      {blocos.map(bloco => (
      <div key={bloco.titulo} style={{ marginBottom: bloco.titulo ? 12 : 0 }}>
      {bloco.titulo && (
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)',
          textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' }}>
          {bloco.titulo}
          <span style={{ marginLeft: 6, fontWeight: 600 }}>({bloco.itens.length})</span>
        </p>
      )}
      <div className="admin-file-list">
        {bloco.itens.map(e => (
          editando === e.id ? (
            <EditorEntrega key={e.id} inicial={e} pessoas={pessoas} categorias={categorias}
              salvando={salvando}
              onSalvar={dados => { void onSalvarEntrega(dados, e.id); setEditando(null); }}
              onCancelar={() => setEditando(null)} />
          ) : (() => {
            const aberta = abertas.includes(e.id);
            const feita = e.status === ENTREGA_CONCLUIDA;
            const cor = COR_ENTREGA[e.status] ?? 'var(--gray2)';
            return (
              <div key={e.id} className="admin-file-item"
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '8px 12px' }}>

                {/* Linha fechada: marco, título e o essencial à direita. */}
                <div className="entrega-linha" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <MarcoEntrega status={e.status} onEscolher={st => void escolherStatus(e, st)} />

                  <button type="button" onClick={() => alternar(e.id)} aria-expanded={aberta}
                    style={{
                      flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                    }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--black)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.titulo}
                    </span>
                    <span className={`entrega-seta${aberta ? ' aberta' : ''}`}>
                      <IconChevronRight size={12} />
                    </span>
                  </button>

                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
                    fontSize: 11.5, color: 'var(--gray2)' }}>
                    {e.prazo && <span>{fmtData(e.prazo)}</span>}
                    <span style={{ fontWeight: 700, color: feita ? cor : 'var(--gray2)', minWidth: 30, textAlign: 'right' }}>
                      {feita ? 100 : 0}%
                    </span>
                  </span>
                </div>

                <div className={`entrega-detalhe${aberta ? ' aberta' : ''}`}>
                  <div>
                   {jaAbertas.includes(e.id) && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gray3)',
                      display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <ChipEntrega status={e.status} />

                        {e.descricao && (
                          <p style={{ fontSize: 12, color: 'var(--gray)', margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>
                            {e.descricao}
                          </p>
                        )}

                        {e.responsaveis.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                            {e.responsaveis.map(id => {
                              const p = pessoas.find(x => x.id === id);
                              return (
                                <span key={id} title={p?.nome ?? 'Usuário removido'}>
                                  <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={20} />
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {e.links.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {e.links.map((l, i) => (
                              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11,
                                  fontWeight: 600, color: 'var(--gray)', textDecoration: 'none',
                                  border: '1px solid var(--gray3)', borderRadius: 'var(--radius-pill)',
                                  padding: '2px 9px',
                                }}>
                                <IconLink size={11} />{l.label}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* A evidência entra pelo diálogo de conclusão e por
                            nenhum outro caminho, então a seção só existe em
                            entrega concluída - onde ela obrigatoriamente tem. */}
                        {feita && e.evidencias.length > 0 && (
                          <div style={{ marginTop: 10 }}>
                            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                              textTransform: 'uppercase', color: 'var(--gray2)', margin: '0 0 5px' }}>
                              Evidência
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {e.evidencias.map(ev => (
                                <div key={ev.id}>
                                  {/* Sem excluir: a prova de uma entrega concluída
                                      não se apaga. Trocar exige reabrir a entrega e
                                      concluí-la de novo com o arquivo novo. */}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
                                    <span style={{ color: 'var(--gray2)' }}><IconClip size={12} /></span>
                                    <span style={{ flex: 1, minWidth: 0, color: 'var(--black)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                      title={ev.nome}>
                                      {ev.nome}
                                    </span>
                                    <span style={{ color: 'var(--gray2)', fontSize: 10.5 }}>{fmtTamanho(ev.tamanho)}</span>
                                    <button type="button" className="file-eye-btn" title="Visualizar"
                                      aria-label={`Visualizar ${ev.nome}`} onClick={() => onVerEvidencia(ev)}>
                                      <IconEye size={13} />
                                    </button>
                                    <button type="button" className="admin-file-download" title="Baixar"
                                      aria-label={`Baixar ${ev.nome}`} onClick={() => onBaixarEvidencia(ev)}>
                                      <IconDownload size={12} />
                                    </button>
                                  </div>
                                  {ev.comentario && (
                                    <p style={{ fontSize: 11.5, color: 'var(--gray)', margin: '3px 0 0 19px',
                                      whiteSpace: 'pre-wrap' }}>
                                      {ev.comentario}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <button type="button" className="admin-file-download" title="Editar entrega"
                        aria-label={`Editar ${e.titulo}`} onClick={() => setEditando(e.id)}>
                        <IconEdit size={13} />
                      </button>
                      <button type="button" className="file-delete-btn" title="Excluir entrega"
                        aria-label={`Excluir ${e.titulo}`} onClick={() => setExcluindoEntrega(e)}>
                        <IconTrash size={13} />
                      </button>
                    </div>
                   )}
                  </div>
                </div>
              </div>
            );
          })()
        ))}
      </div>
      </div>
      ))}

      <div className="admin-file-list">
        {pendentes.map((e, i) => (
          editandoPendente === i ? (
            <EditorEntrega key={`pend-${i}`} inicial={e} pessoas={pessoas} categorias={categorias}
              salvando={salvando}
              onSalvar={dados => {
                onAlterarPendentes(pendentes.map((x, j) => (j === i ? dados : x)));
                setEditandoPendente(null);
              }}
              onCancelar={() => setEditandoPendente(null)} />
          ) : (
            <div key={`pend-${i}`} className="admin-file-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--black)' }}>{e.titulo}</span>
                  <ChipEntrega status={e.status} />
                  {e.prazo && <span style={{ fontSize: 11, color: 'var(--gray2)' }}>{fmtData(e.prazo)}</span>}
                </div>
                {e.descricao && (
                  <p style={{ fontSize: 12, color: 'var(--gray)', margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>
                    {e.descricao}
                  </p>
                )}
                <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '6px 0 0' }}>
                  A evidência pode ser anexada depois de o projeto ser criado.
                </p>
              </div>
              <button type="button" className="admin-file-download" title="Editar entrega"
                aria-label={`Editar ${e.titulo}`} onClick={() => setEditandoPendente(i)}>
                <IconEdit size={13} />
              </button>
              <button type="button" className="file-delete-btn" title="Remover entrega"
                aria-label={`Remover ${e.titulo}`}
                onClick={() => onAlterarPendentes(pendentes.filter((_, j) => j !== i))}>
                <IconTrash size={13} />
              </button>
            </div>
          )
        ))}
      </div>

      {excluindoEntrega && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExcluindoEntrega(null)}>
          <div className="delete-confirm-modal" onClick={ev => ev.stopPropagation()}>
            <p className="delete-confirm-title">Excluir entrega</p>
            <p className="delete-confirm-desc">
              Tem certeza que deseja excluir "<strong>{excluindoEntrega.titulo}</strong>"?
              {excluindoEntrega.evidencias.length > 0 && (
                <>
                  {' '}As {excluindoEntrega.evidencias.length === 1
                    ? 'evidência anexada vai junto'
                    : `${excluindoEntrega.evidencias.length} evidências anexadas vão junto`}.
                </>
              )}
            </p>
            <div className="delete-confirm-actions">
              <button type="button" className="delete-confirm-cancel"
                onClick={() => setExcluindoEntrega(null)}>Cancelar</button>
              <button type="button" className="delete-confirm-ok" disabled={salvando}
                onClick={() => { const alvo = excluindoEntrega; setExcluindoEntrega(null); onExcluirEntrega(alvo); }}>
                Excluir
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {concluindo && (
        <DialogoEvidencia
          entrega={concluindo}
          salvando={salvando}
          onFechar={() => setConcluindo(null)}
          onConcluir={async (arquivos, comentario) => {
            await onSubirEvidencia(concluindo, arquivos, comentario);
            await onSalvarEntrega(comStatus(concluindo, ENTREGA_CONCLUIDA), concluindo.id);
            setConcluindo(null);
          }}
        />
      )}
    </section>
  );
}

/** Ícone-botão do cabeçalho que abre uma lista curta de critérios. Serve à
 *  ordenação e ao agrupamento, que só diferem no ícone e nas opções. */
function SeletorLista({ valor, opcoes, icone: Icone, rotulo, onChange }: {
  valor: string;
  opcoes: readonly { valor: string; label: string }[];
  icone: (p: { size?: number }) => JSX.Element;
  rotulo: string;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const atual = opcoes.find(o => o.valor === valor);

  function abrir() {
    setPos(ancorar(triggerRef.current!, opcoes.length, 190));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button ref={triggerRef} type="button" className="secao-add" onClick={abrir}
        title={`${rotulo}: ${atual?.label}`} aria-label={`${rotulo}. Atual: ${atual?.label}`}>
        <Icone size={13} />
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {opcoes.map(o => (
            <div key={o.valor} className={`status-select-option${o.valor === valor ? ' active' : ''}`}
              onClick={() => { onChange(o.valor); setAberto(false); }}>
              <span>{o.label}</span>
              {o.valor === valor && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  style={{ marginLeft: 'auto', color: 'var(--yellow)' }}>
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2"
                    strokeLinecap="round" strokeLinejoin="round" />
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

/** O marco à esquerda da entrega é o próprio seletor de status: clicar nele
 *  abre a lista, e o desenho escolhido fica ali. */
function MarcoEntrega({ status, onEscolher }: {
  status: string;
  onEscolher: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const Icone = ICONE_ENTREGA[status] ?? IconMarcoPlanejado;

  // Resolvida ganha uma linha a mais, para desfazer.
  const resolvida = status === ENTREGA_CONCLUIDA || status === ENTREGA_CANCELADA;
  const opcoes: string[] = resolvida
    ? [...RESOLUCAO_ENTREGA, ENTREGA_PLANEJADA]
    : [...RESOLUCAO_ENTREGA];

  function abrir() {
    setPos(ancorar(triggerRef.current!, opcoes.length, 200));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button ref={triggerRef} type="button" className="marco-entrega" onClick={abrir}
        title={`Status: ${status}`} aria-label={`Status da entrega: ${status}`}
        style={{ '--mc': COR_ENTREGA[status] ?? 'var(--gray2)' } as React.CSSProperties}>
        <Icone size={14} />
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {opcoes.map(st => {
            const Desenho = ICONE_ENTREGA[st];
            const reabrir = resolvida && st === ENTREGA_PLANEJADA;
            return (
              <div key={st} className={`status-select-option${st === status ? ' active' : ''}`}
                onClick={() => { setAberto(false); onEscolher(st); }}>
                <span className="marco-bolha" style={{ '--mc': COR_ENTREGA[st] } as React.CSSProperties}>
                  <Desenho size={14} />
                </span>
                <span>{reabrir ? 'Reabrir' : st}</span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/** Portão da conclusão. Aparece quando alguém escolhe "Concluída" numa entrega
 *  sem prova anexada: em vez de recusar com um erro, o diálogo pede o arquivo
 *  que falta e conclui em seguida. */
function DialogoEvidencia({ entrega, salvando, onConcluir, onFechar }: {
  entrega: Entrega;
  salvando: boolean;
  onConcluir: (arquivos: FileList, comentario: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<FileList | null>(null);
  const [comentario, setComentario] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const nomes = Array.from(escolhidos ?? []);

  return createPortal(
    // Mesmo molde da confirmação de exclusão: caixa centrada, título,
    // descrição e as duas ações no rodapé.
    <div className="admin-modal-overlay" style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
      onClick={onFechar}>
      <div className="delete-confirm-modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">Concluir entrega</p>
        <p className="delete-confirm-desc">
          "<strong>{entrega.titulo}</strong>" só é dada como concluída com a evidência anexada.
        </p>

        <input ref={input} type="file" multiple hidden
          onChange={e => setEscolhidos(e.target.files)} />

        <button type="button" className="secao-add"
          style={{ width: '100%', height: 38, gap: 7, borderRadius: 'var(--radius-md)',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
          onClick={() => input.current?.click()}>
          <IconPlus size={14} />
          {nomes.length ? 'Trocar arquivo' : 'Escolher evidência'}
        </button>

        {nomes.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {nomes.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 }}>
                <span style={{ color: 'var(--gray2)' }}><IconClip size={12} /></span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ color: 'var(--gray2)', fontSize: 11 }}>{fmtTamanho(f.size)}</span>
              </div>
            ))}
          </div>
        )}

        <textarea className="form-input" rows={3} value={comentario}
          onChange={e => setComentario(e.target.value)}
          placeholder="Comentário: o que este arquivo comprova"
          style={{ marginTop: 10, fontSize: 13 }} />

        <div className="delete-confirm-actions" style={{ marginTop: 20 }}>
          <button type="button" className="delete-confirm-cancel" onClick={onFechar}>Cancelar</button>
          <button type="button" className="delete-confirm-ok"
            style={{ background: COR_ENTREGA[ENTREGA_CONCLUIDA], color: 'var(--on-yellow)' }}
            disabled={!escolhidos?.length || salvando}
            onClick={() => escolhidos && void onConcluir(escolhidos, comentario.trim())}>
            {salvando ? 'Concluindo…' : 'Concluir'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Reuniões do projeto ─────────────────────────────────────────────────────

/** Diário de reuniões. Mesma forma da saúde: cada registro é gravado na hora e
 *  o valor está na série, não no último item. */
function SecaoReunioes({ registros, pessoas, equipe, salvando, onRegistrar, onExcluir }: {
  registros: Reuniao[];
  pessoas: Pessoa[];
  /** Quem está no projeto aparece primeiro na escolha de participantes. */
  equipe: Membro[];
  salvando: boolean;
  onRegistrar: (r: { data: string; assunto: string; notas: string; participantes: string[] }) => Promise<void>;
  onExcluir: (r: Reuniao) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [data, setData] = useState('');
  const [assunto, setAssunto] = useState('');
  const [notas, setNotas] = useState('');
  const [quem, setQuem] = useState<string[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});

  const doProjeto = equipe.map(m => m.id);
  const ordenadas = [
    ...pessoas.filter(p => doProjeto.includes(p.id)),
    ...pessoas.filter(p => !doProjeto.includes(p.id)),
  ];

  function limpar() {
    setData(''); setAssunto(''); setNotas(''); setQuem([]); setErros({}); setAbrindo(false);
  }

  async function registrar() {
    const novos: Record<string, string> = {};
    if (!data) novos.data = 'Informe a data.';
    if (!assunto.trim()) novos.assunto = 'Informe o assunto.';
    if (!notas.trim()) novos.notas = 'Registre o que foi tratado.';
    setErros(novos);
    if (Object.keys(novos).length) return;
    await onRegistrar({ data, assunto: assunto.trim(), notas: notas.trim(), participantes: quem });
    limpar();
  }

  return (
    <section>
      <div className="admin-section-head">
        <p className="admin-section-title">
          Reuniões
          {registros.length > 0 && <span style={{ marginLeft: 6, fontWeight: 600 }}>({registros.length})</span>}
        </p>
        <button type="button" className="secao-add" onClick={() => setAbrindo(a => !a)}
          title="Registrar reunião" aria-label="Registrar reunião">
          <IconPlus size={14} />
        </button>
      </div>

      {abrindo && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="form-group">
              <label className="form-label">Data *</label>
              <DatePicker compact allowPast value={data}
                onChange={v => { setData(v); setErros(e => ({ ...e, data: '' })); }} error={erros.data} />
            </div>
            <div className="form-group">
              <label className="form-label">Assunto *</label>
              <input className={`form-input${erros.assunto ? ' error' : ''}`} value={assunto}
                onChange={e => { setAssunto(e.target.value); setErros(x => ({ ...x, assunto: '' })); }}
                placeholder="Alinhamento semanal" />
              {erros.assunto && <p className="form-error">{erros.assunto}</p>}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Participantes</label>
            <SeletorPessoas pessoas={ordenadas} valor={quem} onChange={setQuem}
              vazio="Escolher participantes" />
          </div>

          <div className="form-group">
            <label className="form-label">O que foi tratado *</label>
            <textarea className={`form-input${erros.notas ? ' error' : ''}`} rows={4} value={notas}
              onChange={e => { setNotas(e.target.value); setErros(x => ({ ...x, notas: '' })); }}
              placeholder="Decisões, encaminhamentos e responsáveis" />
            {erros.notas && <p className="form-error">{erros.notas}</p>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="modal-acao" onClick={limpar}>Cancelar</button>
            <button type="button" className="modal-acao-primaria" disabled={salvando}
              onClick={() => void registrar()}>
              {salvando ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      {registros.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhuma reunião registrada.</p>
      ) : (
        <div className="admin-file-list">
          {registros.map(reg => (
            <div key={reg.id} className="admin-file-item" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--black)', margin: 0 }}>
                  {reg.assunto}
                  <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--gray2)' }}>
                    {fmtData(reg.data)}
                    {reg.criado_por_nome ? ` · ${reg.criado_por_nome}` : ''}
                  </span>
                </p>
                <p style={{ fontSize: 12, color: 'var(--gray)', margin: '3px 0 0', whiteSpace: 'pre-wrap' }}>
                  {reg.notas}
                </p>
                {reg.participantes.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 7 }}>
                    {reg.participantes.map(id => {
                      const p = pessoas.find(x => x.id === id);
                      return (
                        <span key={id} title={p?.nome ?? 'Usuário removido'}>
                          <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={20} />
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <button type="button" className="file-delete-btn" title="Excluir reunião"
                aria-label={`Excluir reunião ${reg.assunto}`} onClick={() => onExcluir(reg)}>
                <IconX size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Status como pílula ───────────────────────────────────────────────────────

/** O mesmo controle de etapa que o Funil usa no cabeçalho do card: pílula na
 *  cor do status, com o dropdown num portal para não ser cortado pelo modal. */
function PilulaStatus({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const cor = COR_STATUS[valor] ?? '#aaa';

  function abrir() {
    setPos(ancorar(triggerRef.current!, STATUS_PROJETO.length, 200));
    setAberto(true);
  }

  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="status-select-trigger sem-contorno"
        style={{ '--sc': cor } as React.CSSProperties}
        onClick={abrir}
      >
        <span className="status-select-dot" style={{ background: cor }} />
        <span>{valor}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {STATUS_PROJETO.map(st => {
            const ativo = st === valor;
            return (
              <div key={st} className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => { onChange(st); setAberto(false); }}>
                <span className="status-select-dot" style={{ background: COR_STATUS[st] }} />
                <span>{st}</span>
                {ativo && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    style={{ marginLeft: 'auto', color: COR_STATUS[st] }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Equipe do projeto ────────────────────────────────────────────────────────

function SecaoEquipe({ titulo, pessoas, valor, onChange }: {
  /** O título entra aqui, e não na seção acima, porque o botão de acrescentar
   *  mora ao lado dele e depende do estado deste componente. */
  titulo: string;
  pessoas: Pessoa[];
  valor: { usuario_id: string; papel: string }[];
  onChange: (v: { usuario_id: string; papel: string }[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const botaoRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Quem já está no time sai da lista: a chave da tabela é (projeto, usuário),
  // então a mesma pessoa não entra duas vezes.
  const disponiveis = pessoas.filter(p => !valor.some(m => m.usuario_id === p.id));

  function abrir() {
    // Linha de pessoa é mais alta que a de texto: conta 44px por item. E mais
    // larga, por causa do email, daí a largura mínima maior.
    setPos(ancorar(botaoRef.current!, Math.ceil(disponiveis.length * 44 / 36), 240));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [botaoRef, dropRef], () => setAberto(false));

  // Entra como Dev e o papel se ajusta na própria linha. Perguntar o papel
  // antes de saber quem é a pessoa invertia a ordem natural.
  function adicionar(id: string) {
    onChange([...valor, { usuario_id: id, papel: 'Dev' }]);
    setAberto(false);
  }

  return (
    <div>
      <div className="admin-section-head">
        <p className="admin-section-title">{titulo}</p>
        <button ref={botaoRef} type="button" className="secao-add" onClick={abrir}
          disabled={disponiveis.length === 0}
          title={disponiveis.length ? 'Adicionar pessoa à equipe' : 'Todos já estão no time'}
          aria-label={disponiveis.length ? 'Adicionar pessoa à equipe' : 'Todos já estão no time'}>
          <IconPlus size={14} />
        </button>
      </div>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {disponiveis.map(p => (
            <div key={p.id} className="status-select-option" onClick={() => adicionar(p.id)}>
              <Avatar nome={p.nome} foto={p.foto_url} size={20} />
              <span style={{ minWidth: 0, overflow: 'hidden' }}>
                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.nome}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.email}
                </span>
              </span>
            </div>
          ))}
        </div>,
        document.body,
      )}

      {valor.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Ninguém na equipe ainda.</p>
      ) : (
        <div className="admin-file-list">
          {valor.map(m => {
            const p = pessoas.find(x => x.id === m.usuario_id);
            const nome = p?.nome ?? 'Usuário removido';
            return (
              <div key={m.usuario_id} className="admin-file-item">
                {/* O avatar ocupa o lugar do quadradinho de tipo do anexo, no
                    mesmo tamanho, para as duas listas alinharem. */}
                <Avatar nome={nome} foto={p?.foto_url} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--black)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nome}>
                    {nome}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '1px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p?.email ?? 'Sem acesso ao portal'}
                  </p>
                </div>
                <SeletorCompacto
                  valor={m.papel}
                  opcoes={PAPEIS_EQUIPE}
                  titulo="Papel na equipe"
                  onChange={v => onChange(valor.map(x => x.usuario_id === m.usuario_id ? { ...x, papel: v } : x))}
                />
                <button type="button" className="file-delete-btn" title="Remover da equipe"
                  aria-label={`Remover ${nome} da equipe`}
                  onClick={() => onChange(valor.filter(x => x.usuario_id !== m.usuario_id))}>
                  <IconX size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

function FormularioProjeto({
  editando, pessoas, clientes, salvando, onFechar, onSalvar, onBaixarAnexo, onEtiquetar,
  categorias, onExcluir,
  onRegistrarSaude, onExcluirSaude, onRegistrarReuniao, onExcluirReuniao,
  onSalvarEntrega, onExcluirEntrega, onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  editando: Projeto | null;
  pessoas: Pessoa[];
  clientes: Cliente[];
  salvando: boolean;
  onFechar: () => void;
  onSalvar: (r: Rascunho, anexos: AnexoPendente[], removidos: number[]) => void;
  onBaixarAnexo: (a: Arquivo) => void;
  onEtiquetar: (a: Arquivo, etiqueta: string) => Promise<void>;
  onRegistrarSaude: (p: Projeto, estado: string, descricao: string) => Promise<void>;
  onExcluirSaude: (r: RegistroSaude) => void;
  onRegistrarReuniao: (
    p: Projeto,
    r: { data: string; assunto: string; notas: string; participantes: string[] },
  ) => Promise<void>;
  onExcluirReuniao: (r: Reuniao) => void;
  /** Categorias de entrega já usadas, para sugerir no cadastro. */
  categorias: string[];
  onExcluir: (p: Projeto) => void;
  onSalvarEntrega: (p: Projeto, dados: EntregaPendente, id?: number) => Promise<void>;
  onExcluirEntrega: (e: Entrega) => void;
  onSubirEvidencia: (e: Entrega, arquivos: FileList | null, comentario?: string) => Promise<void>;
  onBaixarEvidencia: (ev: Evidencia) => void;
  onVerEvidencia: (ev: Evidencia) => void;
}) {
  const [r, setR] = useState<Rascunho>(() => editando ? {
    nome: editando.nome, descricao: editando.descricao ?? '',
    cliente_id: editando.cliente_id ?? '',
    tipo: editando.tipo ?? '', repositorio: editando.repositorio ?? '',
    drive: editando.drive ?? '',
    // As entregas de um projeto existente são gravadas uma a uma, fora do
    // rascunho: aqui a lista fica vazia de propósito.
    entregas: [] as EntregaPendente[],
    status: editando.status, prioridade: editando.prioridade ?? PRIORIDADE_PADRAO,
    equipe: editando.equipe.map(m => ({ usuario_id: m.id, papel: m.papel })),
    data_inicio: editando.data_inicio ?? '', previsao_entrega: editando.previsao_entrega ?? '',
    progresso: editando.progresso ?? 0, observacoes: editando.observacoes ?? '',
  } : VAZIO);
  const [novos, setNovos] = useState<AnexoPendente[]>([]);
  const [removidos, setRemovidos] = useState<number[]>([]);
  const [erroAnexo, setErroAnexo] = useState('');
  const inputArquivo = useRef<HTMLInputElement>(null);

  // Erro por campo, preenchido só quando a pessoa tenta salvar. O botão fica
  // sempre ativo: bloquear a ação esconde o motivo, e o objetivo aqui é
  // justamente mostrar onde está o problema.
  const [erros, setErros] = useState<Record<string, string>>({});

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => {
    setR(p => ({ ...p, [k]: v }));
    // O erro some assim que o campo é mexido: manter o vermelho enquanto a
    // pessoa corrige é ruído.
    setErros(e => (e[k as string] ? { ...e, [k as string]: '' } : e));
  };
  // `editando` é um retrato de quando o modal abriu: sem guardar a troca aqui,
  // o arquivo reetiquetado só mudaria de grupo depois de fechar e reabrir.
  const [copiado, setCopiado] = useState(false);

  /** Link que abre este projeto direto, para quem já tem acesso ao portal. É o
   *  mesmo formato que o Funil usa em `?lead=`. */
  async function copiarLink() {
    if (!editando) return;
    const url = `${window.location.origin}/?projeto=${editando.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência bloqueada (sem HTTPS, ou permissão negada):
      // mostrar o link ainda deixa a pessoa copiar à mão.
      window.prompt('Copie o link do projeto:', url);
    }
  }

  // Projeto novo não tem reuniões nem saúde a que se prender, então só existe
  // "Geral" até ele ser criado.
  const [abaModal, setAbaModal] = useState<'geral' | 'reunioes' | 'saude'>('geral');
  const [reetiquetados, setReetiquetados] = useState<Record<number, string>>({});
  const jaAnexados = (editando?.arquivos ?? [])
    .filter(a => !removidos.includes(a.id))
    .map(a => (reetiquetados[a.id] ? { ...a, etiqueta: reetiquetados[a.id] } : a));

  function tentarSalvar() {
    const novosErros: Record<string, string> = {};
    if (!r.nome.trim()) novosErros.nome = 'Informe o nome do projeto.';
    if (!r.cliente_id) novosErros.cliente_id = 'Escolha o cliente.';
    if (!r.tipo) novosErros.tipo = 'Escolha o tipo do projeto.';
    if (!r.prioridade) novosErros.prioridade = 'Escolha a prioridade.';
    if (!r.data_inicio) novosErros.data_inicio = 'Informe a data de início.';
    if (!r.previsao_entrega) novosErros.previsao_entrega = 'Informe o fim previsto.';
    if (r.equipe.length === 0) novosErros.equipe = 'Adicione ao menos uma pessoa à equipe.';
    if (!editando && r.entregas.length === 0) {
      novosErros.entregas = 'Adicione ao menos uma entrega.';
    }
    if (jaAnexados.length + novos.length === 0) novosErros.anexos = 'Anexe ao menos um arquivo.';
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) return;
    onSalvar(r, novos, removidos);
  }

  async function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    setErroAnexo('');
    const aceitos: AnexoPendente[] = [];
    for (const f of Array.from(lista)) {
      if (f.size > LIMITE_ANEXO) {
        setErroAnexo(`"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      const base64 = await lerBase64(f);
      aceitos.push({ etiqueta: ETIQUETA_PADRAO, nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size, base64 });
    }
    setNovos(p => [...p, ...aceitos]);
    if (aceitos.length) setErros(e => (e.anexos ? { ...e, anexos: '' } : e));
    if (inputArquivo.current) inputArquivo.current.value = '';
  }


  return createPortal(
    <div className="admin-modal-overlay" onClick={onFechar}>
      <div className="admin-modal" style={{ width: 'min(560px, 96vw)' }} onClick={e => e.stopPropagation()}>

        <div className="admin-modal-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {editando ? `Projeto ${editando.codigo ?? ''}`.trim() : 'Novo projeto'}
              </p>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>
                {editando ? editando.nome : 'Criar manualmente'}
              </h3>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {editando && (
                <>
                  <button type="button" className="secao-add" style={{ width: 30, height: 30 }}
                    title={copiado ? 'Link copiado' : 'Copiar link do projeto'}
                    aria-label="Copiar link para compartilhar o projeto"
                    onClick={() => void copiarLink()}>
                    {copiado ? <IconCheck size={15} /> : <IconLink size={15} />}
                  </button>
                  <button type="button" className="secao-add" style={{ width: 30, height: 30 }}
                    title="Excluir projeto" aria-label="Excluir projeto"
                    onClick={() => onExcluir(editando)}>
                    <IconTrash size={15} />
                  </button>
                </>
              )}
              <button className="admin-modal-close" aria-label="Fechar" onClick={onFechar}><IconX size={16} /></button>
            </span>
          </div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <PilulaStatus valor={r.status} onChange={v => set('status', v)} />
            {/* A saúde só existe em projeto criado, e só depois da primeira
                leitura. Sem registro o cabeçalho não anuncia nada: um estado
                inventado seria pior que a ausência. */}
            {editando && (
              <span title={editando.saude?.[0]?.descricao ?? 'Nenhuma leitura de saúde registrada.'}>
                <ChipSaude estado={editando.saude?.[0]?.estado ?? SEM_LEITURA} />
              </span>
            )}
          </div>

          {editando && (
            <div className="config-tabs" style={{ marginBottom: 0, marginTop: 6 }}>
              <button type="button" className={`config-tab${abaModal === 'geral' ? ' active' : ''}`}
                onClick={() => setAbaModal('geral')}>Geral</button>
              <button type="button" className={`config-tab${abaModal === 'reunioes' ? ' active' : ''}`}
                onClick={() => setAbaModal('reunioes')}>Reuniões</button>
              <button type="button" className={`config-tab${abaModal === 'saude' ? ' active' : ''}`}
                onClick={() => setAbaModal('saude')}>Saúde</button>
            </div>
          )}
        </div>

        <div className="admin-modal-body">

          {editando && abaModal === 'reunioes' && (
            <SecaoReunioes
              registros={editando.reunioes ?? []}
              pessoas={pessoas}
              equipe={editando.equipe}
              salvando={salvando}
              onRegistrar={reg => onRegistrarReuniao(editando, reg)}
              onExcluir={onExcluirReuniao}
            />
          )}

          {editando && abaModal === 'saude' && (
            <SecaoSaude
              registros={editando.saude ?? []}
              salvando={salvando}
              onRegistrar={(estado, descricao) => onRegistrarSaude(editando, estado, descricao)}
              onExcluir={onExcluirSaude}
            />
          )}

          <div style={{ display: abaModal === 'geral' ? 'block' : 'none' }}>

          <section>
            <p className="admin-section-title">Identificação</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Nome do projeto *</label>
                <input className={`form-input${erros.nome ? ' error' : ''}`} value={r.nome} autoFocus
                  onChange={e => set('nome', e.target.value)} placeholder="Portal de gestão" />
                {erros.nome && <p className="form-error">{erros.nome}</p>}
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea className="form-input" rows={2} value={r.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  placeholder="Em poucas linhas, do que se trata o projeto" />
              </div>
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <SelectSistema
                  valor={r.cliente_id}
                  onChange={v => set('cliente_id', v)}
                  placeholder="Escolher cliente"
                  opcoes={clientes.map(c => ({ valor: c.id, label: c.nome, logo: logoDoCliente(c.nome) }))}
                />
                {erros.cliente_id && <p className="form-error">{erros.cliente_id}</p>}
              </div>
              {/* Lado a lado, como as datas: são duas listas curtas de
                  classificação e ocupar uma linha cada desperdiçava altura. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Tipo *</label>
                  <SelectSistema
                    valor={r.tipo}
                    onChange={v => set('tipo', v)}
                    opcoes={[{ valor: '', label: 'Escolher tipo' }, ...TIPOS_PROJETO.map(t => ({ valor: t as string, label: t }))]}
                  />
                  {erros.tipo && <p className="form-error">{erros.tipo}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Prioridade *</label>
                  <SelectSistema
                    valor={r.prioridade}
                    onChange={v => set('prioridade', v)}
                    opcoes={PRIORIDADES.map(x => ({
                      valor: x as string,
                      label: x,
                      icone: ICONE_PRIORIDADE[x]({ size: 15 }),
                    }))}
                  />
                  {erros.prioridade && <p className="form-error">{erros.prioridade}</p>}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Repositório no GitHub</label>
                <input className="form-input" value={r.repositorio}
                  onChange={e => set('repositorio', e.target.value)}
                  placeholder="https://github.com/sheeptechservices/portal-sheep" />
              </div>
              <div className="form-group">
                <label className="form-label">Pasta no Drive</label>
                <input className="form-input" value={r.drive}
                  onChange={e => set('drive', e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..." />
              </div>
            </div>
          </section>

          <section>
            <p className="admin-section-title">Prazo</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label">Data de início *</label>
                <DatePicker compact allowPast value={r.data_inicio}
                  onChange={v => set('data_inicio', v)} error={erros.data_inicio} />
              </div>
              <div className="form-group">
                <label className="form-label">Fim previsto *</label>
                <DatePicker compact allowPast value={r.previsao_entrega}
                  onChange={v => set('previsao_entrega', v)} error={erros.previsao_entrega} />
              </div>
            </div>
          </section>

          <section>
            <SecaoEquipe titulo="Equipe *" pessoas={pessoas} valor={r.equipe}
              onChange={v => set('equipe', v)} />
            {erros.equipe && <p className="form-error" style={{ marginTop: 6 }}>{erros.equipe}</p>}
          </section>

          <SecaoEntregas
            entregas={editando?.entregas ?? []}
            pendentes={r.entregas}
            pessoas={pessoas}
            categorias={categorias}
            salvando={salvando}
            onSalvarEntrega={(dados, id) => onSalvarEntrega(editando!, dados, id)}
            onExcluirEntrega={onExcluirEntrega}
            onAlterarPendentes={v => set('entregas', v)}
            onSubirEvidencia={onSubirEvidencia}
            onBaixarEvidencia={onBaixarEvidencia}
            onVerEvidencia={onVerEvidencia}
          />
          {erros.entregas && <p className="form-error" style={{ marginTop: -4 }}>{erros.entregas}</p>}

          <section>
            <p className="admin-section-title">Observações</p>
            <div className="form-group">
              <textarea className="form-input" rows={2} value={r.observacoes}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Riscos, dependências, combinados" />
            </div>
          </section>

          <section>
            <div className="admin-section-head">
              <p className="admin-section-title">Anexos *</p>
              <button type="button" className="secao-add"
                onClick={() => inputArquivo.current?.click()}
                title={`Adicionar arquivo · máx. ${fmtTamanho(LIMITE_ANEXO)}`}
                aria-label="Adicionar arquivo">
                <IconPlus size={14} />
              </button>
            </div>
            <input ref={inputArquivo} type="file" multiple hidden
              onChange={e => void escolherArquivos(e.target.files)} />
            {erroAnexo && (
              <p style={{ fontSize: 11.5, color: '#B45309', margin: '0 0 8px' }}>{erroAnexo}</p>
            )}

            {jaAnexados.length === 0 && novos.length === 0 ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhum anexo.</p>
                {erros.anexos && <p className="form-error" style={{ marginTop: 6 }}>{erros.anexos}</p>}
              </>
            ) : (
              // Agrupado por etiqueta, na ordem fixa de `ETIQUETAS`: a ordem por
              // chegada faria os grupos dançarem a cada arquivo novo.
              ETIQUETAS.map(et => {
                const salvos = jaAnexados.filter(a => a.etiqueta === et);
                const pendentes = novos
                  .map((a, i) => ({ a, i }))
                  .filter(({ a }) => a.etiqueta === et);
                const total = salvos.length + pendentes.length;
                if (total === 0) return null;
                return (
                  <div key={et} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray2)',
                      textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 6px' }}>
                      {et}<span style={{ marginLeft: 6, fontWeight: 600 }}>({total})</span>
                    </p>
                    <div className="admin-file-list">
                      {salvos.map(a => (
                        <LinhaAnexo key={a.id} nome={a.nome} tamanho={a.tamanho} tipo={a.tipo}
                          etiqueta={a.etiqueta}
                          onEtiqueta={v => {
                            setReetiquetados(r => ({ ...r, [a.id]: v }));
                            void onEtiquetar(a, v);
                          }}
                          onBaixar={() => onBaixarAnexo(a)}
                          onRemover={() => setRemovidos(p => [...p, a.id])} />
                      ))}
                      {pendentes.map(({ a, i }) => (
                        <LinhaAnexo key={`novo-${i}`} nome={a.nome} tamanho={a.tamanho} tipo={a.tipo}
                          etiqueta={a.etiqueta}
                          onEtiqueta={v => setNovos(p => p.map((x, j) => (j === i ? { ...x, etiqueta: v } : x)))}
                          onRemover={() => setNovos(p => p.filter((_, j) => j !== i))} />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>

          </div>

        </div>

        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray3)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button type="button" className="modal-acao" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="modal-acao-primaria" onClick={tentarSalvar} disabled={salvando}>
            {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Criar projeto'}
          </button>
        </div>

      </div>
    </div>,
    document.body,
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

type Aba = 'geral' | 'gestao';

export default function ProjetosPage({ token }: { token: string }) {
  const { pode, onSessionExpired } = useAuth();
  const { toast } = useToast();

  const [aba, setAba] = useState<Aba>('geral');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ editando: Projeto | null } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Projeto | null>(null);
  /** Evidência aberta em prévia, sem sair do portal. */
  const [previa, setPrevia] = useState<Evidencia | null>(null);
  const [view, setView] = useState<'quadro' | 'lista'>('lista');
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fCliente, setFCliente] = useState<string[]>([]);
  const [fGestor, setFGestor] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[]>([]);

  const podeCriar = pode('projetos:criar');
  const podeEditar = pode('projetos:editar');
  const podeExcluir = pode('projetos:excluir');

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return null; }
    return res.json();
  }, [token, onSessionExpired]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, u] = await Promise.all([
        api('?action=projetos'),
        api('?action=usuarios_notificaveis'),
      ]);
      setProjetos(p?.projetos ?? []);
      setClientes(p?.clientes ?? []);
      setPessoas(u?.usuarios ?? []);
    } catch {
      toast('error', 'Não foi possível carregar', 'A lista de projetos não veio. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [api, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  // Link compartilhável: ?projeto=<id> abre o projeto assim que a lista chega.
  // Roda uma vez, e limpa a query para não reabrir a cada recarregamento.
  const linkAbertoRef = useRef(false);
  useEffect(() => {
    if (linkAbertoRef.current || projetos.length === 0) return;
    const alvo = new URLSearchParams(window.location.search).get('projeto');
    if (!alvo) return;
    linkAbertoRef.current = true;
    const p = projetos.find(x => x.id === alvo || x.codigo === alvo);
    if (p) setForm({ editando: p });
    else toast('error', 'Projeto não encontrado', 'O link aponta para um projeto que não existe mais.');
    window.history.replaceState({}, '', window.location.pathname + window.location.hash);
  }, [projetos, toast]);

  async function salvar(r: Rascunho, anexos: AnexoPendente[], removidos: number[]) {
    setSalvando(true);
    try {
      const editando = form?.editando ?? null;
      const resposta = editando
        ? await api('', 'POST', { action: 'update_projeto', id: editando.id, ...r })
        : await api('', 'POST', { action: 'create_projeto', ...r });
      if (resposta?.error) { toast('error', 'Não foi possível salvar', resposta.error); return; }

      const projetoId = editando?.id ?? String(resposta?.id ?? '');
      for (const id of removidos) {
        await api('', 'POST', { action: 'delete_projeto_arquivo', id });
      }
      for (const a of anexos) {
        await api('', 'POST', { action: 'add_projeto_arquivo', projeto_id: projetoId, ...a });
      }

      setForm(null);
      toast('success', editando ? 'Projeto atualizado' : 'Projeto criado');
      await carregar();
    } finally {
      setSalvando(false);
    }
  }


  /** Grava a leitura e recarrega: o registro nasce no servidor, com id, data e
   *  autor, e inventar isso aqui só para adiantar a tela abriria espaço para
   *  divergência. */
  async function registrarSaude(p: Projeto, estado: string, descricao: string) {
    await api('', 'POST', { action: 'registrar_saude_projeto', projeto_id: p.id, estado, descricao });
    await carregar();
    toast('success', 'Leitura registrada');
  }

  async function salvarEntrega(p: Projeto, dados: EntregaPendente, id?: number) {
    const r = await api('', 'POST', { action: 'salvar_entrega', projeto_id: p.id, id, ...dados });
    if (r?.error) { toast('error', 'Não deu', r.error); return; }
    await carregar();
  }

  async function excluirEntrega(e: Entrega) {
    const r = await api('', 'POST', { action: 'excluir_entrega', id: e.id });
    if (r?.error) { toast('error', 'Não deu', r.error); return; }
    await carregar();
  }

  async function subirEvidencia(e: Entrega, arquivos: FileList | null, comentario?: string) {
    // Só o primeiro arquivo do lote substitui a prova antiga; os demais entram
    // ao lado dele, senão cada um apagaria o anterior.
    let primeiro = true;
    for (const f of Array.from(arquivos ?? [])) {
      if (f.size > LIMITE_ANEXO) {
        toast('error', 'Arquivo grande demais',
          `"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      await api('', 'POST', {
        action: 'add_entrega_evidencia', entrega_id: e.id, nome: f.name,
        tipo: f.type || 'application/octet-stream', tamanho: f.size,
        base64: await lerBase64(f), comentario, substituir: primeiro,
      });
      primeiro = false;
    }
    await carregar();
  }

  async function baixarEvidencia(ev: Evidencia) {
    const r = await api(`?action=entrega_evidencia_base64&id=${ev.id}`);
    if (!r?.base64) { toast('error', 'Não deu', 'A evidência não veio.'); return; }
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }



  async function registrarReuniao(
    p: Projeto,
    reg: { data: string; assunto: string; notas: string; participantes: string[] },
  ) {
    await api('', 'POST', { action: 'registrar_reuniao_projeto', projeto_id: p.id, ...reg });
    await carregar();
    toast('success', 'Reunião registrada');
  }

  function excluirReuniao(r: Reuniao) {
    setProjetos(ps => ps.map(p => (
      p.id === r.projeto_id ? { ...p, reunioes: p.reunioes.filter(x => x.id !== r.id) } : p
    )));
    void api('', 'POST', { action: 'excluir_reuniao_projeto', id: r.id });
  }

  function excluirSaude(r: RegistroSaude) {
    setProjetos(ps => ps.map(p => (
      p.id === r.projeto_id ? { ...p, saude: p.saude.filter(x => x.id !== r.id) } : p
    )));
    void api('', 'POST', { action: 'excluir_saude_projeto', id: r.id });
  }

  /** Reetiqueta na hora e grava. Sem o otimismo o arquivo demoraria a pular de
   *  grupo, e o efeito da troca ficaria invisível. */
  async function etiquetarAnexo(a: Arquivo, etiqueta: string) {
    setProjetos(ps => ps.map(p => ({
      ...p,
      arquivos: p.arquivos.map(x => (x.id === a.id ? { ...x, etiqueta } : x)),
    })));
    await api('', 'POST', { action: 'etiquetar_projeto_arquivo', id: a.id, etiqueta });
  }

  async function baixarAnexo(a: Arquivo) {
    const r = await api(`?action=projeto_arquivo_base64&id=${a.id}`);
    if (!r?.base64) { toast('error', 'Não deu', 'O anexo não veio.'); return; }
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  async function excluir(p: Projeto) {
    setExcluindo(null);
    await api('', 'POST', { action: 'delete_projeto', id: p.id });
    toast('success', 'Projeto excluído');
    await carregar();
  }

  /** Muda só um campo, sem abrir o formulário. Usado na aba de gestão. */
  /** Ajuste de um campo só, direto da listagem. O update no servidor mexe
   *  apenas no que recebe, então mandar o campo isolado é suficiente - e
   *  reenviar a linha inteira arriscaria sobrescrever o que outra pessoa
   *  acabou de mudar. */
  async function ajustar(p: Projeto, campo: 'status' | 'prioridade', valor: string) {
    setProjetos(ps => ps.map(x => (x.id === p.id ? { ...x, [campo]: valor } as Projeto : x)));
    await api('', 'POST', { action: 'update_projeto', id: p.id, [campo]: valor });
  }

  /** Categorias de entrega já escritas, de todos os projetos. Sugerir só as do
   *  projeto aberto faria a mesma categoria nascer com grafia diferente em cada
   *  projeto novo. */
  const categoriasDeEntrega = useMemo(() => [...new Set(
    projetos.flatMap(p => p.entregas ?? [])
      .map(e => (e.categoria ?? '').trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'pt-BR')), [projetos]);

  /** Opções vêm do que existe, não de uma lista fixa: filtro que oferece valor
   *  sem resultado é ruído. */
  const opcoes = useMemo(() => {
    const uniq = (vs: (string | null)[]) =>
      [...new Set(vs.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      status: uniq(projetos.map(p => p.status)).map(v => ({ value: v, label: v })),
      cliente: uniq(projetos.map(p => p.cliente_nome)).map(v => ({ value: v, label: v })),
      gestor: uniq(projetos.map(p => gestorDe(p)?.nome ?? null)).map(v => ({ value: v, label: v })),
      tipo: uniq(projetos.map(p => p.tipo)).map(v => ({ value: v, label: v })),
    };
  }, [projetos]);

  const filtrados = useMemo(() => projetos.filter(p =>
    (fStatus.length === 0 || fStatus.includes(p.status)) &&
    (fCliente.length === 0 || (p.cliente_nome && fCliente.includes(p.cliente_nome))) &&
    (fGestor.length === 0 || fGestor.includes(gestorDe(p)?.nome ?? '')) &&
    (fTipo.length === 0 || (p.tipo && fTipo.includes(p.tipo)))
  ), [projetos, fStatus, fCliente, fGestor, fTipo]);

  const temFiltro = fStatus.length + fCliente.length + fGestor.length + fTipo.length > 0;
  const limparFiltros = () => { setFStatus([]); setFCliente([]); setFGestor([]); setFTipo([]); };

  // O resumo conta o que está em tela: com filtro aplicado, número que ignora
  // o filtro vira contradição visível.
  const resumo = useMemo(() => ({
    total: filtrados.length,
    andamento: filtrados.filter(p => p.status === 'Em andamento').length,
    concluidos: filtrados.filter(p => p.status === 'Concluído').length,
    atrasados: filtrados.filter(p => {
      const d = diasPara(p.previsao_entrega);
      return d !== null && d < 0 && p.status !== 'Concluído' && p.status !== 'Cancelado';
    }).length,
  }), [filtrados]);

  if (!pode('projetos:ver')) {
    return (
      <div className="admin-content-wrap">
        <div className="perfil-vazio">
          <IconAlert size={16} />
          <p className="perfil-vazio-titulo">Sem acesso</p>
          <p className="perfil-vazio-desc">Seu perfil não enxerga os projetos.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content-wrap">
      <div className="config-tabs">
        <button className={`config-tab${aba === 'geral' ? ' active' : ''}`} onClick={() => setAba('geral')}>Geral</button>
        <button className={`config-tab${aba === 'gestao' ? ' active' : ''}`} onClick={() => setAba('gestao')}>Gestão</button>
      </div>

      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Projetos</h1>
          <p className="admin-page-desc">
            {aba === 'geral'
              ? 'Cadastro dos projetos da casa'
              : 'Como cada projeto está indo: gestor, prazo e progresso'}
          </p>
        </div>
        {aba === 'geral' && podeCriar && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
            onClick={() => setForm({ editando: null })}>
            + Novo projeto
          </button>
        )}
      </div>

      {!carregando && projetos.length > 0 && (
        <div className="admin-toolbar">
          <span className="admin-toolbar-label">Filtrar</span>
          <FilterDropdown label="Status" values={fStatus} options={opcoes.status} onChange={setFStatus} />
          <FilterDropdown label="Cliente" values={fCliente} options={opcoes.cliente} onChange={setFCliente} />
          <FilterDropdown label="Gestor" values={fGestor} options={opcoes.gestor} onChange={setFGestor} />
          <FilterDropdown label="Tipo" values={fTipo} options={opcoes.tipo} onChange={setFTipo} />
          {temFiltro && (
            <button
              style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={limparFiltros}
            >
              Limpar
            </button>
          )}
          <div className="admin-toolbar-spacer" />
          {aba === 'geral' && (
            <div className="view-toggle">
              <div className="view-toggle-pill" style={{ left: view === 'quadro' ? 3 : 35 }} />
              <button className={view === 'quadro' ? 'active' : ''} onClick={() => setView('quadro')} title="Quadro">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" /><rect x="14" y="3" width="7" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" /></svg>
              </button>
              <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')} title="Lista">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
          )}
        </div>
      )}

      {carregando ? (
        <div className="dux-spinner-row" style={{ padding: '48px 0' }}><span className="dux-spinner" /></div>
      ) : filtrados.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>{temFiltro ? 'Nenhum projeto para esse filtro' : 'Nenhum projeto encontrado'}</p>
          {!temFiltro && podeCriar && (
            <p style={{ fontSize: 12.5, color: 'var(--gray2)', marginTop: 4 }}>
              Cadastre o primeiro em "Novo projeto".
            </p>
          )}
        </div>
      ) : aba === 'geral' && view === 'quadro' ? (
        <div className="kanban-board">
          {STATUS_PROJETO.map(st => {
            const daColuna = filtrados.filter(p => p.status === st);
            const cor = COR_STATUS[st];
            return (
              <div key={st} className="kanban-column">
                <div className="kanban-column-header">
                  <div className="kanban-column-title">
                    <span className="kanban-dot" style={{ background: cor }} />
                    {st}
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)' }}>
                    {daColuna.length}
                  </span>
                </div>
                <div className="kanban-column-body">
                  {daColuna.map(p => (
                    <div key={p.id} className="kanban-card"
                      onClick={() => podeEditar && setForm({ editando: p })}
                      style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                      <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--black)', margin: 0 }}>{p.nome}</p>
                      <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '2px 0 0' }}>
                        {p.codigo}{p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                      </p>
                      <div style={{ marginTop: 10 }}><Barra valor={p.progresso} /></div>
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.equipe.slice(0, 4).map(m => (
                          <span key={m.id} title={`${m.nome} - ${m.papel}`}>
                            <Avatar nome={m.nome} foto={m.foto_url} size={20} />
                          </span>
                        ))}
                        {p.equipe.length > 4 && (
                          <span style={{ fontSize: 11, color: 'var(--gray2)' }}>+{p.equipe.length - 4}</span>
                        )}
                        {p.arquivos.length > 0 && (
                          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--gray2)' }}>
                            {p.arquivos.length} anexo{p.arquivos.length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : aba === 'geral' ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Saúde</th>
                <th style={{ width: 60 }}>Prioridade</th>
                <th>Gestor</th>
                <th>Entrega</th>
                <th style={{ width: 70 }}>Entregas</th>
                <th style={{ width: 90 }}>Progresso</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(p => (
                <tr key={p.id}
                  onClick={() => podeEditar && setForm({ editando: p })}
                  tabIndex={podeEditar ? 0 : undefined}
                  onKeyDown={e => {
                    // Linha clicavel tambem precisa abrir pelo teclado.
                    if (podeEditar && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      setForm({ editando: p });
                    }
                  }}
                  style={{ cursor: podeEditar ? 'pointer' : 'default' }}>
                  <td>
                    {(() => {
                      const marca = logoDoCliente(p.cliente_nome);
                      // A entrega em curso é a primeira que ainda não terminou:
                      // é ela que responde "em que pé está o projeto".
                      const atual = p.entregas.find(e =>
                        e.status !== ENTREGA_CONCLUIDA && e.status !== ENTREGA_CANCELADA);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                          {marca ? (
                            <img className="select-logo" src={marca.src} alt={p.cliente_nome ?? ''}
                              title={p.cliente_nome ?? undefined}
                              data-escurecer={marca.escurecer ? '' : undefined}
                              style={{ height: 15, width: 22, flexShrink: 0 }} />
                          ) : (
                            <span style={{ width: 22, flexShrink: 0, color: 'var(--gray2)' }}
                              title={p.cliente_nome ?? undefined}>
                              <IconFolder size={15} />
                            </span>
                          )}
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={p.descricao ?? undefined}>
                              <span style={{ color: 'var(--gray2)', fontVariantNumeric: 'tabular-nums' }}>
                                [{p.codigo || '-'}]
                              </span>
                              {' '}
                              <span style={{ fontWeight: 600, color: 'var(--black)' }}>{p.nome}</span>
                            </span>
                            {atual && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                                marginTop: 3, fontSize: 11, color: 'var(--gray2)' }}>
                                <span style={{ color: COR_ENTREGA[atual.status], display: 'inline-flex' }}>
                                  {(ICONE_ENTREGA[atual.status] ?? IconMarcoPlanejado)({ size: 11 })}
                                </span>
                                {atual.titulo}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })()}
                  </td>

                  <td>
                    <span title={p.saude[0]?.descricao ?? 'Nenhuma leitura de saúde registrada.'}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ChipSaude estado={p.saude[0]?.estado ?? SEM_LEITURA} size={11} />
                      {p.saude[0] && (
                        <span style={{ fontSize: 11, color: 'var(--gray2)' }}>
                          {idadeDaLeitura(p.saude[0].criado_em)}
                        </span>
                      )}
                    </span>
                  </td>

                  <td>
                    {/* Só o ícone: a escala se lê pela altura das barras, e o
                        nome do nível fica na dica. */}
                    <span title={`Prioridade: ${p.prioridade ?? PRIORIDADE_PADRAO}`}>
                      {ICONE_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO]?.({ size: 15 })}
                    </span>
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Gestor nome={gestorDe(p)?.nome ?? null} email={gestorDe(p)?.email ?? null}
                      foto={gestorDe(p)?.foto_url} />
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    {(() => {
                      const dias = diasPara(p.previsao_entrega);
                      const atrasado = dias !== null && dias < 0
                        && p.status !== 'Concluído' && p.status !== 'Cancelado';
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontSize: 12, color: atrasado ? 'var(--red)' : 'var(--gray)' }}
                          title={atrasado ? `${Math.abs(dias!)} dia(s) de atraso` : undefined}>
                          <IconCalendario size={13} />
                          {fmtData(p.previsao_entrega)}
                        </span>
                      );
                    })()}
                  </td>

                  <td style={{ color: 'var(--gray2)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.entregas.length || '-'}
                  </td>

                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}
                      title={`${p.entregas.filter(e => e.status === ENTREGA_CONCLUIDA).length} de ${p.entregas.length} entrega(s) concluída(s)`}>
                      <AnelProgresso valor={progressoDe(p)} />
                      {progressoDe(p)}%
                    </span>
                  </td>

                  <td>
                    {podeEditar ? (
                      // O controle vive dentro de uma linha clicavel: o clique e o
                      // Enter param aqui, senao abririam o modal de edicao junto.
                      <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <PilulaStatus valor={p.status} onChange={v => void ajustar(p, 'status', v)} />
                      </span>
                    ) : <ChipStatus status={p.status} />}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {podeExcluir && (
                      <button className="admin-toolbar-btn" title="Excluir projeto"
                        onClick={e => { e.stopPropagation(); setExcluindo(p); }}>
                        <IconTrash size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="admin-stats">
            {([
              ['Total', resumo.total, 'projetos cadastrados', 'var(--yellow)'],
              ['Em andamento', resumo.andamento, 'com trabalho ativo', '#0066CC'],
              ['Concluídos', resumo.concluidos, 'entregues', '#1E8A3E'],
              ['Atrasados', resumo.atrasados, 'passaram da previsão', '#D93025'],
            ] as const).map(([label, valor, desc, cor], i) => (
              <div key={label} className="admin-stat-card-v2"
                style={{ '--accent-color': cor, animationDelay: `${i * 0.05}s` } as React.CSSProperties}>
                <p className="stat-v2-label">{label}</p>
                <p className="stat-v2-value">{valor}</p>
                <p className="stat-v2-desc">{desc}</p>
              </div>
            ))}
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Projeto</th><th>Gestor</th><th>Equipe</th><th>Entrega</th>
                  <th>Saúde</th><th>Prioridade</th>
                  <th>Status</th><th style={{ minWidth: 160 }}>Progresso</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const dias = diasPara(p.previsao_entrega);
                  const atrasado = dias !== null && dias < 0
                    && p.status !== 'Concluído' && p.status !== 'Cancelado';
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--black)' }}>{p.nome}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--gray2)', marginTop: 2 }}>
                          {p.codigo}{p.cliente_nome ? ` · ${p.cliente_nome}` : ''}
                        </div>
                      </td>
                      <td><Gestor nome={gestorDe(p)?.nome ?? null} email={gestorDe(p)?.email ?? null}
                          foto={gestorDe(p)?.foto_url} /></td>
                      <td>
                        {p.equipe.filter(m => m.papel !== 'Gestor').length === 0
                          ? <span style={{ color: 'var(--gray2)' }}>-</span>
                          : (
                            <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                              {p.equipe.filter(m => m.papel !== 'Gestor').slice(0, 4).map(m => (
                                <span key={m.id} title={`${m.nome} - ${m.papel}`}>
                                  <Avatar nome={m.nome} foto={m.foto_url} size={20} />
                                </span>
                              ))}
                              {p.equipe.filter(m => m.papel !== 'Gestor').length > 4 && (
                                <span style={{ fontSize: 11, color: 'var(--gray2)' }}>
                                  +{p.equipe.filter(m => m.papel !== 'Gestor').length - 4}
                                </span>
                              )}
                            </span>
                          )}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {fmtData(p.previsao_entrega)}
                        {atrasado && (
                          <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#B45309' }}>
                            {Math.abs(dias!)}d de atraso
                          </span>
                        )}
                      </td>
                      <td>
                        <span title={p.saude[0]?.descricao ?? 'Nenhuma leitura de saúde registrada.'}>
                          <ChipSaude estado={p.saude[0]?.estado ?? SEM_LEITURA} />
                        </span>
                      </td>
                      <td>
                        {podeEditar ? (
                          <SeletorCompacto
                            valor={p.prioridade ?? PRIORIDADE_PADRAO}
                            opcoes={PRIORIDADES}
                            titulo="Prioridade"
                            icones={ICONE_PRIORIDADE}
                            onChange={v => void ajustar(p, 'prioridade', v)}
                          />
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 11.5, fontWeight: 700,
                            color: COR_PRIORIDADE[p.prioridade] ?? 'var(--gray)' }}>
                            {ICONE_PRIORIDADE[p.prioridade]?.({ size: 13 })}
                            {p.prioridade ?? PRIORIDADE_PADRAO}
                          </span>
                        )}
                      </td>
                      <td>
                        {podeEditar ? (
                          <SelectSistema
                            valor={p.status}
                            onChange={v => void ajustar(p, 'status', v)}
                            opcoes={STATUS_PROJETO.map(s => ({ valor: s as string, label: s }))}
                            minWidth={150}
                          />
                        ) : <ChipStatus status={p.status} />}
                      </td>
                      <td>
                        {/* Deixou de ser estimativa digitada: é a fração de
                            entregas concluídas, que o sistema sabe contar. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                          title={`${p.entregas.filter(e => e.status === ENTREGA_CONCLUIDA).length} de ${p.entregas.length} entrega(s) concluída(s)`}>
                          <span style={{ flex: 1, minWidth: 90 }}><Barra valor={progressoDe(p)} /></span>
                          <span style={{ fontSize: 11, color: 'var(--gray2)', whiteSpace: 'nowrap' }}>
                            {p.entregas.filter(e => e.status === ENTREGA_CONCLUIDA).length}/{p.entregas.length}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {form && (
        <FormularioProjeto
          // Versão viva da lista, e não o retrato de quando o modal abriu: a
          // leitura de saúde recarrega os projetos, e o retrato antigo não
          // mostraria o registro recém-criado.
          editando={form.editando ? projetos.find(p => p.id === form.editando!.id) ?? form.editando : null}
          pessoas={pessoas}
          clientes={clientes}
          salvando={salvando}
          onFechar={() => setForm(null)}
          onSalvar={salvar}
          onBaixarAnexo={a => void baixarAnexo(a)}
          categorias={categoriasDeEntrega}
          onExcluir={setExcluindo}
          onEtiquetar={etiquetarAnexo}
          onRegistrarSaude={registrarSaude}
          onExcluirSaude={excluirSaude}
          onRegistrarReuniao={registrarReuniao}
          onExcluirReuniao={excluirReuniao}
          onSalvarEntrega={salvarEntrega}
          onExcluirEntrega={excluirEntrega}
          onSubirEvidencia={subirEvidencia}
          onBaixarEvidencia={baixarEvidencia}
          onVerEvidencia={setPrevia}
        />
      )}

      {previa && (
        <PreviaEvidencia
          evidencia={previa}
          onCarregar={ev => api(`?action=entrega_evidencia_base64&id=${ev.id}`)}
          onBaixar={baixarEvidencia}
          onFechar={() => setPrevia(null)}
        />
      )}

      {excluindo && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setExcluindo(null)}>
          <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
            <p className="delete-confirm-title">Excluir projeto</p>
            <p className="delete-confirm-desc">
              Tem certeza que deseja excluir "<strong>{excluindo.nome}</strong>"?
            </p>
            <div className="delete-confirm-actions">
              <button className="delete-confirm-cancel" onClick={() => setExcluindo(null)}>Cancelar</button>
              <button className="delete-confirm-ok" onClick={() => void excluir(excluindo)}>Excluir</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
