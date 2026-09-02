import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import {
  IconAlert, IconArrowRight, IconClip, IconClipboard, IconDoc, IconDownload,
  IconImage, IconInbox,
  IconChevronDown, IconChevronRight, IconChevronUp, IconChevronUpDown,
  IconEdit, IconEye, IconGlobo, IconLink, IconMarcoAndamento, IconMarcoBloqueado,
  IconAgrupar, IconCalendario, IconCheck, IconExternal, IconOrdenar, IconSearch,
  IconMarcoCancelado, IconMarcoConcluido, IconMarcoPlanejado, IconMarcoValidado,
  IconPlus, IconPrioridadeAlta, IconPrioridadeBaixa, IconPrioridadeMaxima,
  IconPrioridadeMedia, IconTrash, IconTrendDown, IconTrendFlat, IconTrendUp, IconTrendWavy,
  IconTriangulo, IconVisaoLista, IconVisaoQuadro,
  IconX, IconZip,
} from '../components/icons';
import FilterDropdown from '../components/FilterDropdown';
import { logoDoCliente } from '../lib/marcas';
import { PAPEIS_EQUIPE, porNivelDeContato } from '../lib/papeisDeEquipe';
import { SkeletonCards, SkeletonTabela } from '../components/Skeleton';
import { CartaoKpi, CartoesKpiEsqueleto } from '../components/CartaoKpi';
import { Abas, AbaPainel } from '../components/Abas';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';
// Reexportadas: moraram aqui e metade do sistema as importa deste arquivo. A
// definição saiu para a lib porque o formulário de tarefa, compartilhado com a
// tela de Tarefas, também precisa delas - e importá-las daqui fecharia um ciclo.
export {
  COR_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES, PRIORIDADE_PADRAO,
} from '../lib/prioridades';
export { useFecharNoFundo } from '../lib/useFecharNoFundo';
import {
  COR_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES, PRIORIDADE_PADRAO,
} from '../lib/prioridades';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
// O quadro e o calendário são os mesmos da página do cliente: uma
// implementação só, para os dois lados não divergirem no primeiro ajuste.
import {
  CalendarioEntregas, QuadroEntregas, SwitcherVisao, type ItemVisao, type Visao,
} from '../components/VisoesEntregas';
import { PAINEL_MAX, PAINEL_MIN, useLarguraPainel } from '../lib/painelLateral';
import { Donut, type FatiaDonut } from '../components/Donut';
// O mesmo formulário da tela de Tarefas: o quadro da semana abre a tarefa aqui,
// e uma cópia local divergiria dela no primeiro campo novo.
import {
  ConfirmarExclusao, FormularioTarefa, indexarEtiquetas,
  type EtapaTarefa, type EtiquetaTarefa, type Rascunho as RascunhoTarefa,
} from './FormularioTarefa';
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
  { valor: 'responsavel', label: 'Agrupar por responsável' },
] as const;

const ORDENS_ENTREGA = [
  { valor: 'criacao', label: 'Ordem de criação' },
  { valor: 'titulo', label: 'Título (A a Z)' },
  { valor: 'prazo', label: 'Prazo mais próximo' },
  { valor: 'status', label: 'Status' },
] as const;

/** Estados possíveis de uma entrega, para exibição. Só dois são escolhidos por
 *  alguém: ver `RESOLUCAO_ENTREGA`. */
export const STATUS_ENTREGA = [
  'Planejada', 'Em andamento', 'Bloqueada', 'Entregue', 'Validada', 'Cancelada',
] as const;
/** Saiu da nossa mão. Ainda não é o fim: o cliente pode pedir ajuste. */
export const ENTREGA_ENTREGUE = 'Entregue';
/** O cliente deu o aceite. É este que conta como pronto. */
export const ENTREGA_VALIDADA = 'Validada';
export const ENTREGA_CANCELADA = 'Cancelada';
/** Cada estado é provado pela sua própria evidência: o comprovante do que foi
 *  enviado não serve de aceite do cliente, e vice-versa. */
export const PROVA_DA_ETAPA: Record<string, string> = {
  [ENTREGA_ENTREGUE]: 'Entrega',
  [ENTREGA_VALIDADA]: 'Validação',
};

/** O que uma pessoa decide. "Em andamento" e "Bloqueada" saem das tarefas da
 *  entrega - respectivamente, ter tarefa em curso e ter tarefa com etiqueta de
 *  bloqueio - e por isso não estão aqui. "Planejada" é o estado de partida e o
 *  destino de quem reabre uma entrega resolvida. */
export const RESOLUCAO_ENTREGA = [ENTREGA_ENTREGUE, ENTREGA_VALIDADA, ENTREGA_CANCELADA] as const;
export const ENTREGA_PLANEJADA = 'Planejada';

/** Um certo para entregue, dois para validada: a leitura de mensageiro, que
 *  todo mundo já conhece. */
const ICONE_ENTREGA: Record<string, (p: { size?: number }) => JSX.Element> = {
  'Planejada': IconMarcoPlanejado,
  'Em andamento': IconMarcoAndamento,
  'Bloqueada': IconMarcoBloqueado,
  'Entregue': IconMarcoConcluido,
  'Validada': IconMarcoValidado,
  'Cancelada': IconMarcoCancelado,
};

const COR_ENTREGA: Record<string, string> = {
  'Planejada': '#6E6F69',
  'Em andamento': '#B58300',
  'Bloqueada': '#D93025',
  'Entregue': '#7C3AED',
  'Validada': '#23A455',
  'Cancelada': '#D9730D',
};

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
export { PAPEIS_EQUIPE } from '../lib/papeisDeEquipe';

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
  criado_por_id: string | null;
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
  /** Qual afirmação ele sustenta: "Entrega" ou "Validação". */
  etapa: string;
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
  /** Vêm do servidor, deduzidos das tarefas ligadas a esta entrega. O `status`
   *  acima já chega deduzido junto - só resolução manual sobrevive à dedução. */
  tarefas_total: number;
  tarefas_feitas: number;
  /** Fração concluída das tarefas desta entrega, já calculada pelo servidor. */
  progresso: number;
}

/** Tarefa do projeto. Mora aqui, e não na tela de Tarefas, porque é dado de
 *  projeto: chega na mesma carga e é dela que sai o andamento das entregas. */
export interface Tarefa {
  id: number;
  projeto_id: string;
  /** Nulo quando a tarefa não pende de nenhum marco. */
  entrega_id: number | null;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  responsavel_foto: string | null;
  prazo: string | null;
  etiquetas: string[];
  ordem: number;
  concluida_em: string | null;
  criado_em: string;
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
  /** Endereço do que foi entregue. É o único link do projeto que o cliente vê. */
  link_portal: string | null;
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
  /** Todas as do projeto, presas a uma entrega ou soltas. */
  tarefas: Tarefa[];
  criado_em: string;
  /** Chave da página de acompanhamento do cliente. Nulo é não publicado. */
  publico_token: string | null;
  publicado_em: string | null;
}

interface Cliente { id: string; nome: string }

/** Anexo ainda não enviado. Projeto novo só ganha id depois de salvo, então os
 *  arquivos ficam aqui até existir a que anexá-los. */
interface AnexoPendente {
  etiqueta: string; nome: string; tipo: string; tamanho: number; base64: string;
}

const VAZIO = {
  nome: '', descricao: '', cliente_id: '', tipo: '', repositorio: '', drive: '',
  link_portal: '',
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

/** As entregas que todo projeto novo já nasce tendo. São as três cerimônias por
 *  que todo projeto da casa passa, e deixá-las prontas poupa recadastrá-las uma
 *  a uma e evita que cada projeto invente um nome diferente para a mesma coisa.
 *  São entregas comuns depois de criadas: dá para renomear, adiar ou apagar
 *  antes mesmo de salvar. */
const CATEGORIA_DE_PARTIDA = 'Ritos';

const ENTREGAS_DE_PARTIDA = [
  {
    titulo: 'Kickoff',
    descricao: 'Reunião de abertura com o cliente: alinhamento de escopo, prazos, '
      + 'responsáveis de cada lado e canais de comunicação.',
  },
  {
    titulo: 'Levantamento de Requisitos',
    descricao: 'Coleta e registro do que o sistema precisa fazer, fechada com o '
      + 'documento de requisitos aprovado pelo cliente.',
  },
  {
    titulo: 'Signoff',
    descricao: 'Aceite formal do cliente sobre o que foi entregue, encerrando o '
      + 'escopo acordado.',
  },
  {
    // Depois do aceite, e não antes: perguntar como foi enquanto o escopo ainda
    // está aberto mede uma coisa que ainda vai mudar.
    titulo: 'Pesquisa de Satisfação',
    descricao: 'Envio e apuração da pesquisa de satisfação com o cliente depois '
      + 'da entrega, com o resultado anexado como evidência.',
  },
];

/** Uma lista nova a cada projeto: devolver sempre o mesmo array deixaria dois
 *  formulários abertos mexendo na mesma lista. */
function entregasDePartida(): EntregaPendente[] {
  return ENTREGAS_DE_PARTIDA.map(e => ({
    titulo: e.titulo,
    descricao: e.descricao,
    categoria: CATEGORIA_DE_PARTIDA,
    status: ENTREGA_PLANEJADA,
    prazo: '', responsaveis: [], links: [],
  }));
}

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

/** Anel de progresso, no lugar da barra: ocupa a largura de um ícone e a fatia
 *  preenchida se lê de relance, que é o que uma linha de tabela pede. */
function AnelProgresso({ valor, size = 15 }: { valor: number; size?: number }) {
  const v = Math.min(100, Math.max(0, valor));
  const r = 7;
  const volta = 2 * Math.PI * r;
  const cor = v === 100 ? COR_ENTREGA[ENTREGA_VALIDADA] : 'var(--gray)';
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true"
      style={{ flexShrink: 0 }}>
      <circle cx="9" cy="9" r={r} stroke="var(--gray3)" strokeWidth="2.4" />
      <circle cx="9" cy="9" r={r} stroke={cor} strokeWidth="2.4" strokeLinecap="round"
        strokeDasharray={`${(v / 100) * volta} ${volta}`} transform="rotate(-90 9 9)" />
    </svg>
  );
}

/** Valor pelo qual cada coluna ordena. Texto sai como texto, escala sai como
 *  posição na escala - ordenar prioridade em ordem alfabética colocaria "Baixa"
 *  antes de "Urgente", que é o contrário do que se quer ver. */
const CHAVE_ORDEM: Record<string, (p: Projeto) => string | number> = {
  projeto: p => p.nome.toLocaleLowerCase('pt-BR'),
  cliente: p => p.cliente_nome?.toLocaleLowerCase('pt-BR') ?? '\uffff',
  saude: p => (p.saude[0] ? SAUDES.indexOf(p.saude[0].estado as typeof SAUDES[number]) : SAUDES.length),
  prioridade: p => PRIORIDADES.indexOf((p.prioridade ?? PRIORIDADE_PADRAO) as typeof PRIORIDADES[number]),
  gestor: p => gestorDe(p)?.nome.toLocaleLowerCase('pt-BR') ?? '\uffff',
  // Sem data vai para o fim: projeto sem prazo não disputa urgência.
  entrega: p => p.previsao_entrega ?? '9999-99-99',
  progresso: p => progressoDe(p),
  status: p => STATUS_PROJETO.indexOf(p.status as typeof STATUS_PROJETO[number]),
};

function progressoDe(p: Projeto): number {
  // Só a validada conta como pronta: entregue e ainda sem o aceite é trabalho
  // que pode voltar. Cancelada sai da conta: deixou de ser trabalho a fazer.
  const valem = (p.entregas ?? []).filter(e => e.status !== ENTREGA_CANCELADA);
  if (!valem.length) return 0;
  return Math.round((valem.filter(e => e.status === ENTREGA_VALIDADA).length / valem.length) * 100);
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

/** Só aparece dentro de linha de tabela, onde o nome é dado secundário: 12px,
 *  como as outras colunas. Herdando os 13px da tabela ele pesava mais que o
 *  nome do projeto ao lado. */
function Gestor({ nome, email, foto }: { nome: string | null; email: string | null; foto?: string | null }) {
  if (!nome) return <span style={{ fontSize: 12, color: 'var(--gray2)' }}>Sem gestor</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 }}
      title={email ?? undefined}>
      <Avatar nome={nome} foto={foto} size={20} />{nome}
    </span>
  );
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

function LinhaAnexo({ nome, tamanho, tipo, etiqueta, somenteLeitura, onEtiqueta, onBaixar, onVer, onRemover }: {
  nome: string; tamanho: number; tipo: string; etiqueta: string;
  somenteLeitura: boolean;
  onEtiqueta: (v: string) => void;
  /** Ausentes no anexo que ainda não subiu: não há de onde baixar nem o que ver. */
  onBaixar?: () => void;
  onVer?: () => void;
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
      {somenteLeitura
        ? <span className="anexo-cat-trigger" style={{ cursor: 'default' }}>{etiqueta}</span>
        : <SeletorCompacto valor={etiqueta} opcoes={ETIQUETAS} titulo="Etiqueta" onChange={onEtiqueta} />}
      {onVer && (
        <button type="button" className="file-eye-btn" title="Visualizar"
          aria-label={`Visualizar ${nome}`} onClick={onVer}>
          <IconEye size={13} />
        </button>
      )}
      {onBaixar && (
        <button type="button" className="admin-file-download" title="Baixar"
          aria-label={`Baixar ${nome}`} onClick={onBaixar}>
          <IconDownload size={13} />
        </button>
      )}
      {!somenteLeitura && (
        <button type="button" className="file-delete-btn" title="Remover anexo"
          aria-label={`Remover ${nome}`} onClick={onRemover}>
          <IconTrash size={13} />
        </button>
      )}
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
function SecaoSaude({ registros, salvando, somenteLeitura, onRegistrar, onExcluir }: {
  registros: RegistroSaude[];
  salvando: boolean;
  somenteLeitura: boolean;
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
        {!somenteLeitura && (
          <button type="button" className="secao-add" onClick={() => setAbrindo(a => !a)}
            title="Registrar leitura de saúde" aria-label="Registrar leitura de saúde">
            <IconPlus size={14} />
          </button>
        )}
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
              {!somenteLeitura && (
                <button type="button" className="file-delete-btn" title="Excluir leitura"
                  aria-label="Excluir leitura de saúde" onClick={() => onExcluir(reg)}>
                  <IconX size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Campo de endereço com o atalho de abrir ao lado. O botão só aparece com o
 *  campo preenchido: convidar para um link vazio é oferecer uma aba em branco. */
function CampoEndereco({ rotulo, valor, placeholder, dica, somenteLeitura, onChange }: {
  rotulo: string;
  valor: string;
  placeholder: string;
  /** Linha de apoio abaixo do campo, para quando o rótulo não basta. */
  dica?: string;
  somenteLeitura: boolean;
  onChange: (v: string) => void;
}) {
  const limpo = valor.trim();
  const abrir = () => window.open(limpo, '_blank', 'noopener,noreferrer');

  return (
    <div className="form-group">
      <label className="form-label">{rotulo}</label>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {somenteLeitura ? (
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: limpo ? 'var(--gray)' : 'var(--gray2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={limpo || undefined}>
            {limpo || 'Não informado'}
          </span>
        ) : (
          <input className="form-input" style={{ flex: 1, minWidth: 0 }} value={valor}
            onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        )}
        {limpo && (
          <button type="button" className="secao-add" style={{ width: 34, height: 34 }}
            onClick={abrir} title={`Abrir ${rotulo.toLocaleLowerCase('pt-BR')} numa aba nova`}
            aria-label={`Abrir ${rotulo} numa aba nova`}>
            <IconExternal size={14} />
          </button>
        )}
      </span>
      {dica && <p className="form-hint" style={{ marginTop: 4 }}>{dica}</p>}
    </div>
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

// ── Fechar clicando no fundo ────────────────────────────────────────────────

// ── Largura do painel ───────────────────────────────────────────────────────

// ── Prévia de arquivo ───────────────────────────────────────────────────────

/** Mostra a evidência sem sair do portal, no mesmo modal que o Funil usa para
 *  os anexos. Imagem e PDF abrem aqui; o resto oferece o download, porque o
 *  navegador não sabe desenhar. */
/** Serve à evidência da entrega e ao anexo do projeto: os dois são arquivo com
 *  id, e o que muda é só de onde o conteúdo vem. */
function PreviaArquivo({ arquivo, onCarregar, onBaixar, onFechar }: {
  arquivo: { nome: string; comentario?: string | null };
  /** O buscador vem da página: o `api` carrega o token da sessão. */
  onCarregar: () => Promise<{ tipo: string; base64: string } | null>;
  onBaixar: () => void;
  onFechar: () => void;
}) {
  const [conteudo, setConteudo] = useState<{ tipo: string; url: string } | null>(null);
  const [erro, setErro] = useState('');
  const fundo = useFecharNoFundo(onFechar);

  useEffect(() => {
    let vivo = true;
    let criada = '';
    (async () => {
      try {
        const r = await onCarregar();
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
  }, [arquivo.nome]);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [onFechar]);

  const imagem = conteudo?.tipo.startsWith('image/');
  const pdf = conteudo?.tipo === 'application/pdf';

  return createPortal(
    <div className="file-preview-backdrop" style={{ zIndex: 10002 }} {...fundo}>
      <div className="file-preview-modal" onClick={e => e.stopPropagation()}>
        <div className="file-preview-header">
          <span className="file-preview-name">{arquivo.nome}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="file-preview-action" onClick={() => onBaixar()}>
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
            <img src={conteudo.url} alt={arquivo.nome} className="file-preview-img" />
          )}
          {conteudo && pdf && (
            <iframe src={conteudo.url} className="file-preview-iframe" title={arquivo.nome} />
          )}
          {conteudo && !imagem && !pdf && (
            <div className="file-preview-unsupported">
              <p>Visualização não disponível para este formato.</p>
              <button type="button" className="btn btn-primary" style={{ marginTop: 16 }}
                onClick={() => onBaixar()}>
                Baixar arquivo
              </button>
            </div>
          )}
        </div>
        {arquivo.comentario && (
          <p style={{ fontSize: 12.5, color: 'var(--gray)', margin: 0, padding: '12px 20px',
            borderTop: '1px solid var(--gray3)', whiteSpace: 'pre-wrap' }}>
            {arquivo.comentario}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Cabeçalho que ordena ao clique. Reusa o `.sortable-th` do Funil; a seta vem
 *  de `icons.tsx`, que já tem os três estados desenhados. */
function ThOrdenavel({ coluna, atual, dir, onOrdenar, children, ...resto }: {
  coluna: string;
  atual: string | null;
  dir: 'asc' | 'desc';
  onOrdenar: (c: string) => void;
  children: React.ReactNode;
} & React.ThHTMLAttributes<HTMLTableCellElement>) {
  const ativa = atual === coluna;
  return (
    <th {...resto} className={`sortable-th${ativa ? ' sorted' : ''}`}
      aria-sort={ativa ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      onClick={() => onOrdenar(coluna)}>
      {children}
      <span className="sort-arrow" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
        {ativa
          ? (dir === 'asc' ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />)
          : <IconChevronUpDown size={12} />}
      </span>
    </th>
  );
}

// ── Células editáveis da listagem ───────────────────────────────────────────

/** Gatilho discreto de uma célula: parece texto até o mouse chegar. Numa tabela
 *  de nove colunas, nove controles desenhados viram um formulário. */
function CelulaEditavel({ titulo, onAbrir, children, refBotao }: {
  titulo: string;
  onAbrir: () => void;
  children: React.ReactNode;
  refBotao?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button ref={refBotao} type="button" className="celula-editavel" title={titulo} aria-label={titulo}
      onClick={e => { e.stopPropagation(); onAbrir(); }}
      onKeyDown={e => e.stopPropagation()}>
      {children}
    </button>
  );
}

/** Lista suspensa presa a uma célula. Some ao escolher, ao clicar fora e ao rolar. */
function ListaDaCelula({ aberto, ancora, itens, onFechar }: {
  aberto: boolean;
  ancora: React.RefObject<HTMLButtonElement | null>;
  itens: { chave: string; conteudo: React.ReactNode; ativo?: boolean; ao: () => void }[];
  onFechar: () => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (aberto && ancora.current) setPos(ancorar(ancora.current, itens.length, 200));
  }, [aberto, itens.length]);

  useDropdownDismiss(aberto, [ancora, dropRef], onFechar);
  if (!aberto) return null;

  return createPortal(
    <div ref={dropRef} className="status-select-dropdown"
      style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
      {itens.map(i => (
        <div key={i.chave} className={`status-select-option${i.ativo ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); i.ao(); onFechar(); }}>
          {i.conteudo}
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Saúde na tabela: a lista de estados vem antes do modal. Escolher o estado é
 *  a parte que a pessoa já sabe ao olhar a linha; o texto que sustenta a
 *  leitura vem depois, com o estado já resolvido. */
function CelulaSaude({ registro, onEscolher }: {
  registro: RegistroSaude | undefined;
  onEscolher: (estado: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      {/* Só o chip: a idade da leitura vivia aqui dentro e alargava o botão,
          o que espalhava o realce do hover e a dica por meia célula. Na aba
          Gestão ela tem coluna própria, que é onde a comparação entre projetos
          acontece. */}
      <CelulaEditavel refBotao={botao}
        titulo={registro?.descricao ?? 'Registrar leitura de saúde'}
        onAbrir={() => setAberto(a => !a)}>
        <ChipSaude estado={registro?.estado ?? SEM_LEITURA} size={11} />
      </CelulaEditavel>
      <ListaDaCelula aberto={aberto} ancora={botao} onFechar={() => setAberto(false)}
        itens={SAUDES.map(e => ({
          chave: e,
          ativo: e === registro?.estado,
          conteudo: <ChipSaude estado={e} size={11} />,
          ao: () => onEscolher(e),
        }))} />
    </>
  );
}

function CelulaPrioridade({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <CelulaEditavel refBotao={botao} titulo={`Prioridade: ${valor}`} onAbrir={() => setAberto(a => !a)}>
        {ICONE_PRIORIDADE[valor]?.({ size: 15 })}
      </CelulaEditavel>
      <ListaDaCelula aberto={aberto} ancora={botao} onFechar={() => setAberto(false)}
        itens={PRIORIDADES.map(p => ({
          chave: p,
          ativo: p === valor,
          ao: () => onChange(p),
          conteudo: <>{ICONE_PRIORIDADE[p]({ size: 14 })}<span>{p}</span></>,
        }))} />
    </>
  );
}

function CelulaGestor({ gestor, pessoas, onChange }: {
  gestor: Membro | null;
  pessoas: Pessoa[];
  onChange: (usuarioId: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  return (
    <>
      <CelulaEditavel refBotao={botao} titulo={gestor ? `Gestor: ${gestor.nome}` : 'Definir gestor'}
        onAbrir={() => setAberto(a => !a)}>
        <Gestor nome={gestor?.nome ?? null} email={gestor?.email ?? null} foto={gestor?.foto_url} />
      </CelulaEditavel>
      <ListaDaCelula aberto={aberto} ancora={botao} onFechar={() => setAberto(false)}
        itens={[
          { chave: '', ativo: !gestor, ao: () => onChange(''),
            conteudo: <span style={{ color: 'var(--gray2)' }}>Sem gestor</span> },
          ...pessoas.map(p => ({
            chave: p.id,
            ativo: p.id === gestor?.id,
            ao: () => onChange(p.id),
            conteudo: (
              <>
                <Avatar nome={p.nome} foto={p.foto_url} size={20} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.nome}</span>
              </>
            ),
          })),
        ]} />
    </>
  );
}

/** Data que vira campo só enquanto está sendo trocada: fora disso a linha
 *  continua sendo texto, e o `DatePicker` inteiro em nove linhas pesaria. */
function CelulaData({ valor, atrasado, onChange }: {
  valor: string | null;
  atrasado: boolean;
  onChange: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <span style={{ display: 'block', width: 150 }}
        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
        <DatePicker compact allowPast value={valor ?? ''}
          onChange={v => { onChange(v); setEditando(false); }} />
      </span>
    );
  }

  return (
    <CelulaEditavel titulo="Trocar o fim previsto" onAbrir={() => setEditando(true)}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, color: atrasado ? 'var(--red)' : 'var(--gray)' }}>
        <IconCalendario size={13} />
        {fmtData(valor)}
      </span>
    </CelulaEditavel>
  );
}

/** Saúde não é um valor que se troca, é uma leitura que se registra: por isso
 *  abre o mesmo diálogo do resto do sistema, com o descritivo obrigatório. */
function DialogoSaude({ projeto, inicial, salvando, onRegistrar, onFechar }: {
  projeto: Projeto;
  /** Estado já escolhido na lista da tabela. Sem ele vale a leitura anterior. */
  inicial?: string;
  salvando: boolean;
  onRegistrar: (estado: string, descricao: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [estado, setEstado] = useState<string>(inicial ?? projeto.saude[0]?.estado ?? 'Saudável');
  const [descricao, setDescricao] = useState('');
  const [erro, setErro] = useState('');
  const fundo = useFecharNoFundo(onFechar);

  async function registrar() {
    if (!descricao.trim()) { setErro('Descreva a situação do projeto.'); return; }
    await onRegistrar(estado, descricao.trim());
    onFechar();
  }

  return createPortal(
    <div className="admin-modal-overlay" style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
      {...fundo}>
      <div className="delete-confirm-modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">Registrar leitura de saúde</p>
        <p className="delete-confirm-desc">{projeto.nome}</p>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
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
                <Icone size={13} />{e}
              </button>
            );
          })}
        </div>

        <textarea className={`form-input${erro ? ' error' : ''}`} rows={3} value={descricao}
          onChange={e => { setDescricao(e.target.value); if (erro) setErro(''); }}
          placeholder="O que sustenta essa leitura" style={{ fontSize: 13 }} />
        {erro && <p className="form-error">{erro}</p>}

        <div className="delete-confirm-actions" style={{ marginTop: 16 }}>
          <button type="button" className="delete-confirm-cancel" onClick={onFechar}>Cancelar</button>
          <button type="button" className="delete-confirm-ok" disabled={salvando}
            style={{ background: COR_SAUDE[estado], color: 'var(--on-yellow)' }}
            onClick={() => void registrar()}>
            {salvando ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** As tarefas de uma entrega, num balão preso à contagem.
 *
 *  Fica aqui, e não numa ida à tela de Tarefas, porque a pergunta nasce dentro
 *  do projeto aberto: sair daqui fecharia o painel e obrigaria a refazer o
 *  caminho para voltar. O cabeçalho repete cliente, projeto e entrega, que é o
 *  caminho que levou até esta lista. */
function TarefasDaEntrega({ tarefas, caminho, ancora, onAbrirNaPagina, onFechar }: {
  tarefas: Tarefa[];
  caminho: string[];
  ancora: React.RefObject<HTMLButtonElement | null>;
  /** Sai para a tela de Tarefas, que é onde se edita. Ausente quando o projeto
   *  ainda não foi salvo. */
  onAbrirNaPagina?: () => void;
  onFechar: () => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const LARGURA = 340;

  useEffect(() => {
    const el = ancora.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const altura = Math.min(120 + tarefas.length * 44, 400);
    const paraCima = window.innerHeight - r.bottom - 8 < altura && r.top > altura;
    setPos({
      top: paraCima ? r.top - altura - 4 : r.bottom + 6,
      // Ancorado pela direita: a contagem fica no fim da linha.
      left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)),
    });
  }, [ancora, tarefas.length]);

  useDropdownDismiss(true, [ancora, dropRef], onFechar);

  return createPortal(
    <div ref={dropRef} className="status-select-dropdown"
      style={{ top: pos.top, left: pos.left, width: LARGURA, maxHeight: 400, zIndex: 10001,
        display: 'flex', flexDirection: 'column' }}>
      <p style={{ padding: '6px 10px 8px', margin: 0, flexShrink: 0, fontSize: 10.5,
        color: 'var(--gray2)', borderBottom: '1px solid var(--gray3)', lineHeight: 1.4 }}>
        {caminho.filter(Boolean).join(' > ')}
      </p>

      <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
      {tarefas.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--black)', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.titulo}
            </p>
            <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '2px 0 0',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t.status}
              {t.responsavel_nome ? ` - ${t.responsavel_nome}` : ''}
              {t.prazo ? ` - ${fmtData(t.prazo)}` : ''}
            </p>
          </div>
          {t.responsavel_nome && (
            <Avatar nome={t.responsavel_nome} foto={t.responsavel_foto} size={20} />
          )}
        </div>
      ))}

      {tarefas.length === 0 && (
        <p style={{ padding: '12px 10px', margin: 0, fontSize: 12, color: 'var(--gray2)' }}>
          Nenhuma tarefa ligada a esta entrega ainda.
        </p>
      )}
      </div>

      {/* O balão responde "quais são" de relance; editar, comentar prazo e
          trocar responsável é trabalho de mesa, e mora na tela de Tarefas. */}
      {onAbrirNaPagina && (
        <button type="button" className="modal-acao" onClick={onAbrirNaPagina}
          style={{ margin: '6px 4px 2px', width: 'calc(100% - 8px)', justifyContent: 'center',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          Abrir em Tarefas
          <IconArrowRight size={13} />
        </button>
      )}
    </div>,
    document.body,
  );
}

/** A contagem na linha da entrega. Só abre quando há o que mostrar. */
function ContagemTarefas({ tarefas, caminho, onAbrirNaPagina }: {
  tarefas: Tarefa[];
  caminho: string[];
  onAbrirNaPagina?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const total = tarefas.length;

  return (
    <>
      <button
        ref={botao}
        type="button"
        disabled={total === 0}
        aria-expanded={aberto}
        title={total === 0
          ? 'Nenhuma tarefa ligada a esta entrega'
          : `Ver as ${total} tarefa(s) desta entrega`}
        onClick={e => { e.stopPropagation(); setAberto(a => !a); }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600,
          padding: '2px 7px', borderRadius: 'var(--radius-pill)',
          border: '1px solid transparent', background: 'none',
          color: total === 0 ? 'var(--gray3)' : 'var(--gray2)',
          cursor: total === 0 ? 'default' : 'pointer',
          borderColor: aberto ? 'var(--gray3)' : 'transparent',
          transition: 'border-color var(--transition), color var(--transition)',
        }}
      >
        <IconClipboard size={12} />
        {total}
      </button>
      {aberto && (
        <TarefasDaEntrega tarefas={tarefas} caminho={caminho} ancora={botao}
          onAbrirNaPagina={onAbrirNaPagina}
          onFechar={() => setAberto(false)} />
      )}
    </>
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
      <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
  entregas, pendentes, tarefas, caminho, onVerTarefasDaEntrega, pessoas, categorias, salvando, somenteLeitura,
  onSalvarEntrega, onExcluirEntrega, onAlterarPendentes,
  onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  /** Já gravadas. Vazio enquanto o projeto não existe. */
  entregas: Entrega[];
  /** Todas as do projeto. Cada entrega filtra as suas pelo `entrega_id`. */
  tarefas: Tarefa[];
  /** Cliente e projeto, para o balão dizer de onde a lista veio. */
  caminho: string[];
  /** Abre a tela de Tarefas estreitada nesta entrega. */
  onVerTarefasDaEntrega?: (entregaId: number) => void;
  /** Em memória, no cadastro de um projeto novo. */
  pendentes: EntregaPendente[];
  pessoas: Pessoa[];
  /** Categorias já usadas em qualquer projeto: a grafia vem de lá. */
  categorias: string[];
  salvando: boolean;
  /** Filtrar, agrupar, buscar, baixar e pré-visualizar seguem valendo. O que
   *  sai é criar, editar, concluir e excluir. */
  somenteLeitura: boolean;
  onSalvarEntrega: (dados: EntregaPendente, id?: number) => Promise<void>;
  onExcluirEntrega: (e: Entrega) => void;
  onAlterarPendentes: (v: EntregaPendente[]) => void;
  onSubirEvidencia: (e: Entrega, arquivos: FileList | null, comentario?: string, etapa?: string) => Promise<void>;
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
  /** Entrega cuja mudança de estado espera a prova, e para onde ela vai. */
  const [concluindo, setConcluindo] = useState<{ entrega: Entrega; alvo: string } | null>(null);
  /** Excluir leva as evidências junto e não tem desfazer: confirma antes. */
  const [excluindoEntrega, setExcluindoEntrega] = useState<Entrega | null>(null);
  const fundoEntrega = useFecharNoFundo(() => setExcluindoEntrega(null));

  /** Troca só o status, preservando o resto da entrega - `salvar_entrega`
   *  regrava a linha inteira. */
  function comStatus(e: Entrega, status: string): EntregaPendente {
    return {
      titulo: e.titulo, descricao: e.descricao ?? '', categoria: e.categoria ?? '', status,
      prazo: e.prazo ?? '', responsaveis: e.responsaveis, links: e.links,
    };
  }

  async function escolherStatus(e: Entrega, status: string) {
    // Cada estado pede a prova da sua etapa, e sempre: reentregar produz um
    // comprovante novo, revalidar produz um aceite novo. Um não substitui o
    // outro, então os dois passam pelo diálogo.
    if (PROVA_DA_ETAPA[status]) {
      setConcluindo({ entrega: e, alvo: status });
      return;
    }
    await onSalvarEntrega(comStatus(e, status), e.id);
  }

  const gravado = entregas.length > 0;
  const total = entregas.length + pendentes.length;

  const [busca, setBusca] = useState('');
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

  /** O resultado visível, como uma linha só. Muda quando a busca, a ordem ou o
   *  próprio conjunto muda, e serve de `key` da lista: a troca de chave remonta
   *  os itens, e é isso que faz a animação de entrada tocar de novo. Digitar uma
   *  letra que não altera o resultado não reanima nada. */
  const assinatura = visiveis.map(e => e.id).join(',');

  /** A lista já filtrada e ordenada, repartida em blocos. Sem agrupamento é um
   *  bloco só, sem título, e o desenho da lista não muda. */
  const blocos = useMemo(() => {
    if (agrupar === 'nenhum') return [{ titulo: '', itens: visiveis }];

    // Entrega com dois responsáveis aparece nos dois blocos: ela é de ambos, e
    // esconder uma cópia faria o time procurar o que é dele e não achar.
    const chavesDe = (e: Entrega): string[] => {
      if (agrupar === 'status') return [e.status];
      if (agrupar === 'categoria') return [(e.categoria ?? '').trim() || 'Sem categoria'];
      const nomes = e.responsaveis
        .map(id => pessoas.find(p => p.id === id)?.nome)
        .filter((n): n is string => !!n);
      return nomes.length ? nomes : ['Sem responsável'];
    };

    // Por status a ordem é a da escala, não a alfabética: "Bloqueada" antes de
    // "Planejada" inverteria a leitura do andamento. Nos outros, o balde de
    // sobra ("Sem categoria", "Sem responsável") vai para o fim.
    const sobra = agrupar === 'categoria' ? 'Sem categoria' : 'Sem responsável';
    const nomes = [...new Set(visiveis.flatMap(chavesDe))].sort((a, b) => (
      agrupar === 'status'
        ? STATUS_ENTREGA.indexOf(a as typeof STATUS_ENTREGA[number])
          - STATUS_ENTREGA.indexOf(b as typeof STATUS_ENTREGA[number])
        : a === sobra ? 1 : b === sobra ? -1 : a.localeCompare(b, 'pt-BR')
    ));

    return nomes.map(titulo => ({
      titulo,
      itens: visiveis.filter(e => chavesDe(e).includes(titulo)),
    }));
  }, [visiveis, agrupar, pessoas]);

  /** Lista é a padrão: é a leitura que responde "o que está acontecendo". */
  const [visao, setVisao] = useState<Visao>('lista');
  /** Entrega que acabou de ser aberta pelo quadro ou pelo calendário. */
  const [realcada, setRealcada] = useState<number | null>(null);

  /** As visíveis no formato enxuto que o quadro e o calendário pedem. Os
   *  responsáveis são ids no painel, e viram nome e foto aqui. */
  const paraVisao: ItemVisao[] = visiveis.map(e => ({
    id: e.id,
    titulo: e.titulo,
    categoria: e.categoria ?? null,
    status: e.status,
    prazo: e.prazo,
    progresso: e.status === ENTREGA_VALIDADA ? 100 : (e.progresso ?? 0),
    donos: e.responsaveis
      .map(id => pessoas.find(p => p.id === id))
      .filter((p): p is Pessoa => !!p)
      .map(p => ({ nome: p.nome, foto: p.foto_url ?? null })),
  }));

  /** As colunas do quadro, na ordem do fluxo, todas mesmo vazias: coluna que
   *  some esconde que não há nada travado. */
  const situacoesDoQuadro = [...STATUS_ENTREGA];

  /** Clicar num cartão ou numa marca leva de volta à lista, com a entrega
   *  aberta e piscando: o detalhe mora lá, e mantê-lo em três lugares seria
   *  manter três. */
  const verNaLista = (id: number) => {
    setVisao('lista');
    setAbertas(a => (a.includes(id) ? a : [...a, id]));
    setJaAbertas(a => (a.includes(id) ? a : [...a, id]));
    setRealcada(id);
    setTimeout(() => setRealcada(r => (r === id ? null : r)), 2200);
  };

  /** Grupos recolhidos. Guardado por título: com a lista longa, fechar o que
   *  não interessa é o que faz o agrupamento valer a pena. Trocar o critério
   *  reabre tudo, senão a pessoa mudaria de eixo e veria uma lista vazia. */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  useEffect(() => { setRecolhidos(new Set()); }, [agrupar]);

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
          <SeletorLista valor={ordem} onChange={setOrdem} opcoes={ORDENS_ENTREGA}
            icone={IconOrdenar} rotulo="Ordenar entregas" />
          <SeletorLista valor={agrupar} onChange={setAgrupar} opcoes={AGRUPAMENTOS_ENTREGA}
            icone={IconAgrupar} rotulo="Agrupar entregas" />
          {/* Ordenar e agrupar continuam: são leitura. Só o acrescentar sai,
              junto com o resto do que grava. */}
          {!somenteLeitura && (
            <button type="button" className="secao-add"
              onClick={() => (gravado ? setEditando('novo') : setEditandoPendente(-1))}
              title="Adicionar entrega" aria-label="Adicionar entrega">
              <IconPlus size={14} />
            </button>
          )}
        </span>
      </div>

      {/* A busca fica à vista, e não atrás de um botão: num projeto com dezenas
          de entregas, procurar uma é o primeiro gesto de quem abre a seção. O
          switcher divide a faixa com ela - procurar e escolher como olhar são o
          mesmo momento. */}
      <div className="secao-busca">
        <span className="secao-busca-campo">
          <IconSearch size={13} />
          <input value={busca} aria-label="Buscar entrega"
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título ou descritivo"
            onKeyDown={e => { if (e.key === 'Escape') setBusca(''); }} />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
              <IconX size={12} />
            </button>
          )}
        </span>
        <SwitcherVisao valor={visao} onChange={setVisao} />
      </div>

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

      {visao === 'quadro' && (
        <QuadroEntregas itens={paraVisao} situacoes={situacoesDoQuadro}
          cores={COR_ENTREGA} icones={ICONE_ENTREGA} onAbrir={verNaLista} />
      )}
      {visao === 'calendario' && (
        <CalendarioEntregas itens={paraVisao} cores={COR_ENTREGA}
          fechados={[ENTREGA_VALIDADA, ENTREGA_CANCELADA]} onAbrir={verNaLista} />
      )}

      {visao === 'lista' && blocos.map(bloco => {
      const fechado = recolhidos.has(bloco.titulo);
      return (
      // A árvore só existe havendo cabeçalho: sem agrupamento não há de onde
      // os ramos sairem.
      <div key={bloco.titulo} className={bloco.titulo ? 'grupo-arvore' : undefined}
        style={{ marginBottom: bloco.titulo ? 12 : 0 }}>
      {bloco.titulo && (
        <button type="button" className={`grupo-cabeca${fechado ? '' : ' aberto'}`}
          aria-expanded={!fechado}
          onClick={() => setRecolhidos(r => {
            const n = new Set(r);
            if (n.has(bloco.titulo)) n.delete(bloco.titulo); else n.add(bloco.titulo);
            return n;
          })}>
          <span className="grupo-seta" aria-hidden="true" />
          {bloco.titulo}
          <span className="grupo-conta">{bloco.itens.length}</span>
        </button>
      )}
      <div className={`grupo-corpo${fechado ? '' : ' aberto'}`}>
       <div>
        {/* Com um editor aberto a chave congela: a remontagem que faz a
            animação tocar apagaria o rascunho de quem está digitando se uma
            atualização de fundo mudasse a lista no meio da edição. */}
        <div className="admin-file-list lista-anima"
          key={editando === null ? assinatura : 'editando'}>
        {bloco.itens.map(e => (
          editando === e.id ? (
            <EditorEntrega key={e.id} inicial={e} pessoas={pessoas} categorias={categorias}
              salvando={salvando}
              onSalvar={dados => { void onSalvarEntrega(dados, e.id); setEditando(null); }}
              onCancelar={() => setEditando(null)} />
          ) : (() => {
            const aberta = abertas.includes(e.id);
            const feita = e.status === ENTREGA_VALIDADA;
            const cor = COR_ENTREGA[e.status] ?? 'var(--gray2)';
            return (
              <div key={e.id}
                className={`admin-file-item${realcada === e.id ? ' realcada' : ''}`}
                // Depois de vir do quadro ou do calendario, a linha rola ate o
                // meio e pisca uma vez: sem isso a pessoa cai numa lista de
                // dezenas e procura de novo o que ja tinha achado.
                ref={el => { if (realcada === e.id && el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
                style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: '8px 12px' }}>

                {/* Linha fechada: marco, título e o essencial à direita. */}
                <div className="entrega-linha" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  {somenteLeitura ? (
                    <span className="marco-bolha" title={`Status: ${e.status}`}
                      style={{ '--mc': COR_ENTREGA[e.status] } as React.CSSProperties}>
                      {(ICONE_ENTREGA[e.status] ?? IconMarcoPlanejado)({ size: 14 })}
                    </span>
                  ) : (
                    <MarcoEntrega status={e.status} onEscolher={st => void escolherStatus(e, st)} />
                  )}

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
                    {/* Quem responde pela entrega, colado na contagem de
                        tarefas: as duas respondem a mesma pergunta - quanto
                        falta e com quem falo sobre isso. O detalhe aberto
                        repete as fotos com o nome, e aqui elas sao so o
                        lembrete. */}
                    {e.responsaveis.length > 0 && (
                      <span style={{ display: 'flex', gap: 3 }}>
                        {e.responsaveis.map(id => {
                          const p = pessoas.find(x => x.id === id);
                          return (
                            <span key={id} title={p?.nome ?? 'Usuário removido'}>
                              <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={18} />
                            </span>
                          );
                        })}
                      </span>
                    )}
                    <ContagemTarefas
                      tarefas={tarefas.filter(t => t.entrega_id === e.id)}
                      caminho={[...caminho, e.titulo]}
                      onAbrirNaPagina={onVerTarefasDaEntrega
                        ? () => onVerTarefasDaEntrega(e.id)
                        : undefined} />
                    {/* Validada vale 100 mesmo com tarefa em aberto: o aceite do
                        cliente é o que encerra. Fora disso, quem manda é a
                        fração de tarefas concluídas que o servidor calculou. */}
                    <span style={{ fontWeight: 700, color: feita ? cor : 'var(--gray2)', minWidth: 30, textAlign: 'right' }}>
                      {feita ? 100 : (e.progresso ?? 0)}%
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
                        {/* Uma seção por etapa: a prova do envio e o aceite do
                            cliente são afirmações diferentes e ficam separadas.
                            Aparecem assim que existem, mesmo antes de a entrega
                            chegar ao estado que elas sustentam. */}
                        {e.evidencias.length > 0 && ['Entrega', 'Validação'].map(et => {
                          const daEtapa = e.evidencias.filter(v => v.etapa === et);
                          if (!daEtapa.length) return null;
                          return (
                          <div key={et} style={{ marginTop: 10 }}>
                            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
                              textTransform: 'uppercase', color: 'var(--gray2)', margin: '0 0 5px' }}>
                              {et === 'Entrega' ? 'Comprovante de entrega' : 'Aceite do cliente'}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {daEtapa.map(ev => (
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
                          );
                        })}
                      </div>

                      {!somenteLeitura && (
                        <>
                          <button type="button" className="admin-file-download" title="Editar entrega"
                            aria-label={`Editar ${e.titulo}`} onClick={() => setEditando(e.id)}>
                            <IconEdit size={13} />
                          </button>
                          <button type="button" className="file-delete-btn" title="Excluir entrega"
                            aria-label={`Excluir ${e.titulo}`} onClick={() => setExcluindoEntrega(e)}>
                            <IconTrash size={13} />
                          </button>
                        </>
                      )}
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
      </div>
      </div>
      );
      })}

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
          {...fundoEntrega}>
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
          entrega={concluindo.entrega}
          alvo={concluindo.alvo}
          salvando={salvando}
          onFechar={() => setConcluindo(null)}
          onConcluir={async (arquivos, comentario) => {
            await onSubirEvidencia(concluindo.entrega, arquivos, comentario, PROVA_DA_ETAPA[concluindo.alvo]);
            await onSalvarEntrega(comStatus(concluindo.entrega, concluindo.alvo), concluindo.entrega.id);
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
  const resolvida = RESOLUCAO_ENTREGA.includes(status as typeof RESOLUCAO_ENTREGA[number]);
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
                <span>
                  {reabrir ? 'Reabrir' : st}
                  {reabrir && (
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)' }}>
                      volta ao estado automático
                    </span>
                  )}
                </span>
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
function DialogoEvidencia({ entrega, alvo, salvando, onConcluir, onFechar }: {
  entrega: Entrega;
  /** Estado de destino: muda o texto, o botão e a cor da ação. */
  alvo: string;
  salvando: boolean;
  onConcluir: (arquivos: FileList, comentario: string) => Promise<void>;
  onFechar: () => void;
}) {
  const [escolhidos, setEscolhidos] = useState<FileList | null>(null);
  const [comentario, setComentario] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const nomes = Array.from(escolhidos ?? []);
  const fundo = useFecharNoFundo(onFechar);

  return createPortal(
    // Mesmo molde da confirmação de exclusão: caixa centrada, título,
    // descrição e as duas ações no rodapé.
    <div className="admin-modal-overlay" style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
      {...fundo}>
      <div className="delete-confirm-modal" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">
          {alvo === ENTREGA_ENTREGUE ? 'Marcar como entregue' : 'Marcar como validada'}
        </p>
        <p className="delete-confirm-desc">
          {alvo === ENTREGA_ENTREGUE
            ? <>"<strong>{entrega.titulo}</strong>" só é dada como entregue com a prova do que foi enviado ao cliente.</>
            : <>"<strong>{entrega.titulo}</strong>" só é dada como validada com o aceite do cliente anexado.</>}
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
          placeholder={alvo === ENTREGA_ENTREGUE
            ? 'Comentário: o que foi enviado, e por onde'
            : 'Comentário: quem validou, e quando'}
          style={{ marginTop: 10, fontSize: 13 }} />

        <div className="delete-confirm-actions" style={{ marginTop: 20 }}>
          <button type="button" className="delete-confirm-cancel" onClick={onFechar}>Cancelar</button>
          <button type="button" className="delete-confirm-ok"
            style={{ background: COR_ENTREGA[alvo], color: '#fff' }}
            disabled={!escolhidos?.length || salvando}
            onClick={() => escolhidos && void onConcluir(escolhidos, comentario.trim())}>
            {salvando ? 'Salvando…' : alvo === ENTREGA_ENTREGUE ? 'Anexar e entregar' : 'Anexar e validar'}
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
function SecaoReunioes({ registros, pessoas, equipe, salvando, somenteLeitura, onRegistrar, onExcluir }: {
  registros: Reuniao[];
  pessoas: Pessoa[];
  /** Quem está no projeto aparece primeiro na escolha de participantes. */
  equipe: Membro[];
  salvando: boolean;
  somenteLeitura: boolean;
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
        {!somenteLeitura && (
          <button type="button" className="secao-add" onClick={() => setAbrindo(a => !a)}
            title="Registrar reunião" aria-label="Registrar reunião">
            <IconPlus size={14} />
          </button>
        )}
      </div>

      {abrindo && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              {!somenteLeitura && (
                <button type="button" className="file-delete-btn" title="Excluir reunião"
                  aria-label={`Excluir reunião ${reg.assunto}`} onClick={() => onExcluir(reg)}>
                  <IconX size={13} />
                </button>
              )}
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
function PilulaStatus({ valor, onChange, compacta }: {
  valor: string;
  onChange: (v: string) => void;
  /** Dentro de linha de tabela, onde o status não é o dado principal. */
  compacta?: boolean;
}) {
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
        className={`status-select-trigger sem-contorno${compacta ? ' compacta' : ''}`}
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

function SecaoEquipe({ titulo, pessoas, valor, somenteLeitura, onChange }: {
  /** O título entra aqui, e não na seção acima, porque o botão de acrescentar
   *  mora ao lado dele e depende do estado deste componente. */
  titulo: string;
  pessoas: Pessoa[];
  valor: { usuario_id: string; papel: string }[];
  somenteLeitura: boolean;
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
        {!somenteLeitura && (
          <button ref={botaoRef} type="button" className="secao-add" onClick={abrir}
            disabled={disponiveis.length === 0}
            title={disponiveis.length ? 'Adicionar pessoa à equipe' : 'Todos já estão no time'}
            aria-label={disponiveis.length ? 'Adicionar pessoa à equipe' : 'Todos já estão no time'}>
            <IconPlus size={14} />
          </button>
        )}
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
        <div className="equipe-niveis">
          {/* O aviso não é decoração: em lista escalonada a leitura automática é
              "quem manda em quem", e aqui a ordem é outra. */}
          <p className="equipe-legenda">Do mais próximo ao mais distante do cliente</p>
          {porNivelDeContato(valor, m => m.papel).map(nivel => (
            <div key={nivel.rotulo} className="equipe-nivel">
              <p className="equipe-nivel-rotulo">
                {nivel.rotulo}
                <span>{nivel.membros.length}</span>
              </p>
              <div className="admin-file-list">
          {nivel.membros.map(m => {
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
                {somenteLeitura ? (
                  <span className="anexo-cat-trigger" style={{ cursor: 'default' }}>{m.papel}</span>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ── Aba Gestão ──────────────────────────────────────────────────────────────
//
//  Revista: cada projeto é um capítulo, e a pessoa rola de um para o outro
//  lendo a mesma sequência - como está, o que andou, o que vem, o que preocupa.
//  A ordem das seções é a da narrativa, não a da conveniência do banco: começa
//  pelo diagnóstico (saúde), passa pelo movimento (semana e entregas), mostra o
//  tempo (o que houve e o que vem) e fecha nos pontos de atenção.
//
//  Sem tabela de propósito. Oito colunas viram rolagem lateral no celular, e a
//  pergunta de quem lê isto não é "compare estes números", é "me conte como
//  está cada projeto".

/** Semana é o passo do acompanhamento: define o que é leitura velha, o recorte
 *  da atividade recente e a janela do que está planejado. */
const DIAS_DA_SEMANA = 7;

function idadeEmDias(iso: string | undefined | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Segunda-feira desta semana. A semana da casa começa na segunda, e é ela que
 *  o bloco de ações mostra - não uma janela móvel de sete dias, que na quarta
 *  arrastaria metade da semana passada junto. */
function segundaDaSemana(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // `getDay` põe domingo em 0; aqui o domingo fecha a semana que começou na
  // segunda anterior, e não abre uma nova.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Entre a segunda desta semana e hoje, no fuso de quem lê. */
/** O dia de um carimbo, no fuso de quem lê.
 *
 *  O servidor grava `concluida_em` em UTC: às 22h de Brasília ele já está no
 *  dia seguinte, e recortar os dez primeiros caracteres punha o card na coluna
 *  de amanhã. Campo de data pura - prazo, data de reunião - já é local e passa
 *  direto: convertê-lo jogaria o dia para trás. */
const diaLocal = (iso: string | undefined | null): string => {
  if (!iso) return '';
  if (!iso.includes('T')) return iso.slice(0, 10);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : iso10(d);
};

const dentroDaSemana = (iso: string | undefined | null) => {
  if (!iso) return false;
  const dia = diaLocal(iso);
  return dia >= iso10(segundaDaSemana()) && dia <= hojeIso();
};

/** A data local em texto. Montada a partir dos componentes, e não por
 *  `toISOString`, que converte para UTC: a leste de Greenwich a meia-noite
 *  local cai no dia anterior em UTC, e o dia inteiro sairia deslocado. */
const iso10 = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hojeIso = () => iso10(new Date());

/** Ordem de leitura da revista: o capítulo que pede ação vem primeiro, e dentro
 *  do mesmo estado vem o que ninguém olha há mais tempo. */
const PESO_SAUDE: Record<string, number> = {
  'Com problemas': 0,
  'Em risco': 1,
  [SEM_LEITURA]: 2,
  'Saudável': 3,
};

/** Segunda a sexta desta semana, em ISO. É a régua do quadro: as colunas, o
 *  que conta como "da semana" e o que sobra para o rodapé do fim de semana. */
function diasUteisDaSemana(): string[] {
  const s = segundaDaSemana();
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    return iso10(d);
  });
}

type ItemDaSemana = { tarefa: Tarefa; dia: string; feita: boolean };

/** Os cards do quadro: as concluídas na semana, no dia em que foram concluídas,
 *  e as abertas com prazo na semana, no dia do prazo.
 *
 *  Sem as abertas o quadro só olhava para trás, e numa segunda-feira não havia
 *  para onde arrastar nada - a semana inteira estava no futuro. Com elas, o
 *  bloco vira o plano da semana e o arraste passa a servir para montá-lo. */
function tarefasDaSemana(p: Projeto): ItemDaSemana[] {
  const dias = diasUteisDaSemana();
  const itens: ItemDaSemana[] = [];
  for (const t of p.tarefas ?? []) {
    const feito = diaLocal(t.concluida_em);
    if (feito && dentroDaSemana(t.concluida_em)) {
      itens.push({ tarefa: t, dia: feito, feita: true });
    } else if (!t.concluida_em && t.prazo && dias.includes(t.prazo.slice(0, 10))) {
      itens.push({ tarefa: t, dia: t.prazo.slice(0, 10), feita: false });
    }
  }
  return itens;
}

/** O que aconteceu no projeto nos últimos sete dias. Sai todo do que a listagem
 *  já traz - nenhuma consulta a mais para montar a revista. */
function semanaDoProjeto(p: Projeto) {
  return {
    tarefasFeitas: (p.tarefas ?? []).filter(t => dentroDaSemana(t.concluida_em)),
    tarefasNovas: (p.tarefas ?? []).filter(t => dentroDaSemana(t.criado_em)).length,
    leituras: p.saude.filter(r => dentroDaSemana(r.criado_em)),
    reunioes: p.reunioes.filter(r => dentroDaSemana(r.data)),
    // Evidência nova é o sinal de que uma entrega andou de verdade: ela é
    // exigida tanto para marcar entregue quanto para marcar validada.
    evidencias: p.entregas.flatMap(e => e.evidencias.filter(v => dentroDaSemana(v.criado_em))),
  };
}

/** O que está fora do lugar neste projeto. Só entra o que de fato disparou:
 *  uma lista com "nada a apontar" repetido seis vezes ensina a pular a seção. */
function pontosDeAtencao(p: Projeto): { texto: string; grave: boolean }[] {
  const pontos: { texto: string; grave: boolean }[] = [];
  const hoje = hojeIso();

  const atrasadas = (p.tarefas ?? []).filter(t => t.prazo && !t.concluida_em && t.prazo < hoje);
  if (atrasadas.length) {
    pontos.push({ texto: `${atrasadas.length} tarefa(s) com prazo vencido e ainda abertas`, grave: true });
  }

  const bloqueadas = p.entregas.filter(e => e.status === 'Bloqueada');
  if (bloqueadas.length) {
    pontos.push({
      texto: `${bloqueadas.length} entrega(s) bloqueada(s): ${bloqueadas.slice(0, 3).map(e => e.titulo).join(', ')}`,
      grave: true,
    });
  }

  const dias = diasPara(p.previsao_entrega);
  if (dias !== null && dias < 0 && p.status !== 'Concluído' && p.status !== 'Cancelado') {
    pontos.push({ texto: `Fim previsto passou há ${Math.abs(dias)} dia(s)`, grave: true });
  }

  const idadeLeitura = idadeEmDias(p.saude[0]?.criado_em);
  if (idadeLeitura === null) {
    pontos.push({ texto: 'Nenhuma leitura de saúde registrada até hoje', grave: false });
  } else if (idadeLeitura > DIAS_DA_SEMANA) {
    pontos.push({ texto: `Última leitura de saúde há ${idadeLeitura} dias`, grave: false });
  }

  const semDono = (p.tarefas ?? []).filter(t => !t.responsavel_id && !t.concluida_em);
  if (semDono.length) {
    pontos.push({ texto: `${semDono.length} tarefa(s) aberta(s) sem responsável`, grave: false });
  }

  if (!p.equipe.some(m => m.papel === 'Gestor')) {
    pontos.push({ texto: 'Projeto sem gestor definido', grave: true });
  }

  return pontos;
}

/** Pessoa com foto. Nome sozinho obriga a lembrar quem é; a foto resolve isso
 *  antes da leitura. Quando o registro só guardou o nome - leituras antigas,
 *  antes de o id ser gravado - as iniciais entram no lugar. */
function PessoaFoto({ nome, id, equipe, tamanho = 20 }: {
  nome: string | null | undefined;
  id?: string | null;
  /** Onde procurar a foto: a equipe do projeto já vem com ela. */
  equipe: Membro[];
  tamanho?: number;
}) {
  if (!nome) return null;
  const achado = equipe.find(m => (id && m.id === id) || m.nome === nome);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Avatar nome={nome} foto={achado?.foto_url} size={tamanho} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {nome}
      </span>
    </span>
  );
}

/** Índice do relatório: por onde a pessoa navega e onde ela vê onde está.
 *
 *  Fica preso na lateral enquanto a leitura corre. O item aceso não é escolha
 *  do clique, é do que está sendo lido - por isso um observador de interseção,
 *  e não um estado guardado ao clicar: rolar com a roda também tem de acender
 *  o item certo. */
function Indice({ lista, ativo, progressoDe: pct, estadoDe, onIr }: {
  lista: Projeto[];
  ativo: string | null;
  progressoDe: (p: Projeto) => number;
  estadoDe: (p: Projeto) => string;
  onIr: (id: string) => void;
}) {
  return (
    <nav className="rev-indice" aria-label="Índice dos projetos">
      <p className="rev-indice-titulo">Índice</p>
      <ol>
        {lista.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              className={`rev-indice-item${ativo === p.id ? ' ativo' : ''}`}
              aria-current={ativo === p.id ? 'true' : undefined}
              // O índice lista clientes, mas dois projetos podem ser do mesmo:
              // a dica diz de qual deles é a linha, sem poluir a lista.
              title={p.cliente_nome ? `${p.cliente_nome} - ${p.nome}` : p.nome}
              onClick={() => onIr(p.id)}
            >
              <span className="rev-indice-num">{String(i + 1).padStart(2, '0')}</span>
              {/* O ícone de prioridade no índice: é ele que explica a ordem da
                  lista, que de outro modo pareceria arbitrária. */}
              <span className="rev-indice-prio"
                style={{ color: COR_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO] ?? 'var(--gray2)' }}
                title={`Prioridade: ${p.prioridade ?? PRIORIDADE_PADRAO}`}>
                {ICONE_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO]?.({ size: 13 })}
              </span>
              <span className="rev-indice-ponto"
                style={{ background: COR_SAUDE[estadoDe(p)] ?? 'var(--gray3)' }} />
              <span className="rev-indice-nome">{p.cliente_nome ?? 'Sem cliente'}</span>
              <span className="rev-indice-pct">{pct(p)}%</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ── Página do projeto ───────────────────────────────────────────────────────
//
//  O capítulo é montado como uma página de editor de texto: título, uma tabela
//  de propriedades, um destaque com a leitura da semana e blocos recolhíveis
//  para o resto. O vocabulário é o de quem escreve documento, não o de painel:
//  toggle, destaque, divisor, lista.
//
//  Os blocos nascem abertos. O triângulo está ali para quem quiser fechar o que
//  já leu, e não para esconder coisa de quem chega.

const VERDE = '#23A455';
const AMARELO = '#B58300';
const VERMELHO = '#D93025';
const NEUTRO = '#8A8B84';

/** Etiqueta colorida de propriedade, no desenho de tag de editor: fundo pálido
 *  da própria cor, texto na cor cheia. */
function Tag({ texto, cor = NEUTRO }: { texto: string; cor?: string }) {
  return (
    <span className="nt-tag" style={{ color: cor, background: `${cor}1A` }}>{texto}</span>
  );
}

/** Uma linha da tabela de propriedades: rótulo apagado à esquerda, valor à
 *  direita. É o cabeçalho de página do editor, e resume o projeto antes de
 *  qualquer texto. */
function Prop({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="nt-prop">
      <span className="nt-prop-rotulo">{rotulo}</span>
      <span className="nt-prop-valor">{children}</span>
    </div>
  );
}

/** Bloco recolhível. Abre e fecha deslizando a altura, no tempo de revelação
 *  da casa - o corte seco fazia o documento inteiro pular sob o cursor. */
function Bloco({ titulo, contagem, children }: {
  titulo: string;
  contagem?: number;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(true);
  return (
    <div className={`nt-toggle${aberto ? ' aberto' : ''}`}>
      <button type="button" className="nt-toggle-cabeca" aria-expanded={aberto}
        onClick={() => setAberto(a => !a)}>
        <span className="nt-triangulo"><IconTriangulo size={10} /></span>
        <span className="nt-toggle-titulo">{titulo}</span>
        {contagem != null && contagem > 0 && (
          <span className="nt-toggle-contagem">{contagem}</span>
        )}
      </button>
      {/* O conteúdo fica montado mesmo fechado: é o que permite animar a
          altura. Três camadas porque a técnica exige - a de fora é a grade que
          anima, a do meio recorta, e o respiro mora na de dentro, senão ele
          sobraria como faixa visível no estado fechado. */}
      <div className="nt-toggle-corpo">
        <div>
          <div className="nt-toggle-conteudo">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Barra segmentada com a composição das entregas. Uma barra só, e não seis
 *  números soltos: a proporção é a leitura que interessa. */
/** As entregas do projeto: a composição por situação no anel, e a lista logo
 *  abaixo. Clicar numa fatia recorta a lista - a pergunta que vinha depois da
 *  barra era sempre "quais são as bloqueadas", e ela não respondia. */
function EntregasDoProjeto({ entregas, equipe }: { entregas: Entrega[]; equipe: Membro[] }) {
  const [foco, setFoco] = useState<string | null>(null);

  const fatias: FatiaDonut[] = STATUS_ENTREGA.map(st => ({
    chave: st,
    rotulo: st,
    valor: entregas.filter(e => e.status === st).length,
    cor: COR_ENTREGA[st] ?? NEUTRO,
  }));

  if (entregas.length === 0) {
    return <p className="nt-vazio">Sem entregas cadastradas.</p>;
  }

  const lista = foco ? entregas.filter(e => e.status === foco) : entregas;

  return (
    <div className="nt-entregas">
      <Donut
        fatias={fatias}
        unidade="entregas"
        esticar
        tamanho={124}
        onEscolher={ch => setFoco(f => (f === ch ? null : ch))}
      />

      {/* Só aparece quando há recorte: sem filtro, a linha era instrução, e
          instrução fixa vira ruído depois da primeira vez. */}
      {foco && (
        <div className="nt-recorte">
          <span>{lista.length} de {entregas.length}, em {foco.toLocaleLowerCase('pt-BR')}</span>
          <button type="button" onClick={() => setFoco(null)}>
            Ver todas
            <IconX size={11} />
          </button>
        </div>
      )}

      <table className="nt-tabela">
        <thead>
          <tr><th>Entrega</th><th>Situação</th><th>Prazo</th><th>Tarefas</th></tr>
        </thead>
        <tbody>
          {lista.map(e => {
            const dono = e.responsaveis.map(id => equipe.find(m => m.id === id)).filter(Boolean)[0];
            return (
              <tr key={e.id}>
                <td title={e.titulo}>
                  {e.titulo}
                  {dono && (
                    <span className="nt-entrega-dono">
                      <PessoaFoto nome={dono.nome} id={dono.id} equipe={equipe} tamanho={15} />
                    </span>
                  )}
                </td>
                <td><Tag texto={e.status} cor={COR_ENTREGA[e.status] ?? NEUTRO} /></td>
                <td>{e.prazo
                  ? fmtData(e.prazo)
                  : <span className="nt-vazio">Sem prazo</span>}</td>
                <td>{e.tarefas_total
                  ? `${e.tarefas_feitas}/${e.tarefas_total}`
                  : <span className="nt-vazio">Nenhuma</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Um card do quadro. Mostra e arrasta - editar é trabalho de mesa e mora no
 *  modal, que abre no clique. Edição no lugar convivia mal com o arraste: o
 *  mesmo gesto ora movia, ora entrava no campo. */
function CardDaSemana({ tarefa: t, equipe, feita, podeArrastar, podeMarcar, arrastando,
  onAbrir, onMarcar, onArrastar, onSoltar }: {
  tarefa: Tarefa;
  equipe: Membro[];
  feita: boolean;
  podeArrastar: boolean;
  /** Falso enquanto a configuração de etapas não chegou: sem ela não há para
   *  onde levar a tarefa ao marcar. */
  podeMarcar: boolean;
  arrastando: boolean;
  onAbrir: (t: Tarefa) => void;
  onMarcar: (t: Tarefa, feita: boolean) => void;
  onArrastar: (id: number) => void;
  onSoltar: () => void;
}) {
  return (
    <div
      className={`nt-card${feita ? ' feita' : ' planejada'}${arrastando ? ' arrastando' : ''}`}
      draggable={podeArrastar}
      onDragStart={e => {
        e.dataTransfer.effectAllowed = 'move';
        // Sem carga o Firefox nem começa o arraste; o id vai junto por garantia,
        // ainda que quem lê de fato seja o estado do quadro.
        e.dataTransfer.setData('text/plain', String(t.id));
        onArrastar(t.id);
      }}
      onDragEnd={onSoltar}
    >
      <div className="nt-card-topo">
        <input
          type="checkbox"
          className="form-checkbox nt-card-marca"
          checked={feita}
          disabled={!podeMarcar}
          aria-label={feita ? `Reabrir "${t.titulo}"` : `Marcar "${t.titulo}" como feita`}
          title={feita ? 'Reabrir' : 'Marcar como feita'}
          onChange={e => onMarcar(t, e.target.checked)}
        />
        <button type="button" className="nt-card-abrir" onClick={() => onAbrir(t)}
          title={`${feita ? 'Concluída' : 'Planejada'}: ${t.titulo}`}>
          <p>{t.titulo}</p>
        </button>
      </div>
      {t.responsavel_nome && (
        <span className="nt-card-pe">
          <PessoaFoto nome={t.responsavel_nome} id={t.responsavel_id} equipe={equipe} tamanho={16} />
        </span>
      )}
    </div>
  );
}

function QuadroDaSemana({ projeto: p, itens, etapaDeEntrada, etapaDeConclusao, podeEditar,
  onAbrirTarefa, onSalvarTarefa }: {
  projeto: Projeto;
  itens: ItemDaSemana[];
  /** Onde a tarefa volta a nascer quando é reaberta. Vazio enquanto a
   *  configuração de etapas não chegou. */
  etapaDeEntrada: string;
  /** A etapa de conversão, para onde a tarefa vai ao ser marcada como feita. */
  etapaDeConclusao: string;
  podeEditar: boolean;
  onAbrirTarefa: (t: Tarefa) => void;
  onSalvarTarefa: (t: Tarefa, mudancas: Record<string, unknown>) => void;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const { toast } = useToast();
  const hoje = hojeIso();

  // Cinco colunas fixas, de segunda a sexta: a semana de trabalho da casa.
  const dias = diasUteisDaSemana().map(iso => {
    const d = new Date(`${iso}T12:00:00`);
    return {
      iso,
      // "seg", "ter": o dia da semana em três letras, sem o ponto que o
      // navegador põe em algumas plataformas.
      nome: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').slice(0, 3),
      numero: d.getDate(),
      hoje: iso === hoje,
      // O que ainda não chegou fica apagado: coluna vazia na quinta, numa
      // terça, é calendário e não falta de trabalho.
      futuro: iso > hoje,
      cards: itens.filter(x => x.dia === iso),
    };
  });

  // Sábado e domingo não têm coluna, mas o trabalho feito neles existe e não
  // pode sumir da conta sem aviso.
  const noFimDeSemana = itens.filter(x => !dias.some(d => d.iso === x.dia)).length;

  const emArraste = itens.find(x => x.tarefa.id === arrastando) ?? null;

  /** Marca ou desmarca a tarefa pela caixa do card.
   *
   *  Marcar leva à etapa de conversão e carimba a conclusão agora - o card
   *  anda para a coluna de hoje, porque é hoje que a tarefa ficou pronta.
   *  Desmarcar devolve à etapa de entrada e deixa a tarefa planejada para o dia
   *  em que ela estava, senão ela sumiria do quadro se o prazo fosse de outra
   *  semana. */
  const marcar = (item: ItemDaSemana, feita: boolean) => {
    if (feita) {
      onSalvarTarefa(item.tarefa, {
        status: etapaDeConclusao,
        concluida_em: new Date().toISOString(),
      });
    } else {
      onSalvarTarefa(item.tarefa, {
        status: etapaDeEntrada, concluida_em: null, prazo: item.dia,
      });
    }
  };

  /** Todo dia da semana recebe card. O que muda é o que o gesto grava: para
   *  trás vira registro de conclusão, para frente vira plano. Uma concluída
   *  levada para o futuro é reaberta, porque conclusão em data que não chegou
   *  o servidor recusaria de todo jeito. */
  const aceita = (futuro: boolean) =>
    podeEditar && !!emArraste && (!futuro || !emArraste.feita || !!etapaDeEntrada);

  return (
    <>
    <div className="nt-semana">
      {dias.map(d => (
        <div
          key={d.iso}
          // Não se conclui coisa amanhã: dia futuro não recebe card.
          className={`nt-dia${d.hoje ? ' hoje' : ''}${d.futuro ? ' futuro' : ''}${sobre === d.iso ? ' alvo' : ''}`}
          onDragOver={e => {
            if (!aceita(d.futuro)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setSobre(d.iso);
          }}
          onDragLeave={e => {
            // Passar por cima de um card dispara `dragleave` na coluna; sem
            // esta guarda o destaque piscava a cada card atravessado.
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setSobre(x => (x === d.iso ? null : x));
          }}
          onDrop={e => {
            e.preventDefault();
            setSobre(null);
            const item = emArraste;
            setArrastando(null);
            if (!item || !aceita(d.futuro) || item.dia === d.iso) return;
            if (item.feita && !d.futuro) {
              // Mantém a hora e troca só o dia: a hora do dia continua sendo a
              // que foi registrada, e mover de coluna não a inventa de novo.
              // Mantém a hora do dia e troca só a data, tudo no fuso local: o
              // carimbo vai para o servidor em UTC, e é `diaLocal` que o traz
              // de volta para a coluna certa.
              const antes = item.tarefa.concluida_em ? new Date(item.tarefa.concluida_em) : new Date();
              const quando = new Date(`${d.iso}T00:00:00`);
              quando.setHours(antes.getHours(), antes.getMinutes(), antes.getSeconds(), 0);
              onSalvarTarefa(item.tarefa, { concluida_em: quando.toISOString() });
            } else if (item.feita) {
              // Reabre: quem leva uma concluída para depois de hoje está dizendo
              // que ela não estava pronta, e agora tem data para ficar. O aviso
              // é obrigatório - o gesto foi "mudar de dia", e o efeito é maior.
              onSalvarTarefa(item.tarefa, {
                concluida_em: null, prazo: d.iso, status: etapaDeEntrada,
              });
              toast('info', 'Tarefa reaberta',
                `Deixou de constar concluída e ficou planejada para ${d.nome} ${d.numero}, em "${etapaDeEntrada}".`);
            } else {
              onSalvarTarefa(item.tarefa, { prazo: d.iso });
            }
          }}
        >
          <div className="nt-dia-cabeca">
            <span className="nt-dia-nome">{d.nome}</span>
            <span className="nt-dia-numero">{d.numero}</span>
            {d.cards.length > 0 && <span className="nt-dia-conta">{d.cards.length}</span>}
          </div>
          <div className="nt-dia-corpo">
            {d.cards.map(x => (
              <CardDaSemana
                key={x.tarefa.id}
                tarefa={x.tarefa}
                equipe={p.equipe}
                feita={x.feita}
                podeArrastar={podeEditar}
                podeMarcar={podeEditar && !!etapaDeConclusao && !!etapaDeEntrada}
                arrastando={arrastando === x.tarefa.id}
                onAbrir={onAbrirTarefa}
                onMarcar={(_, feita) => marcar(x, feita)}
                onArrastar={setArrastando}
                onSoltar={() => { setArrastando(null); setSobre(null); }}
              />
            ))}
            {d.cards.length === 0 && aceita(d.futuro) && (
              <p className="nt-dia-alvo">Soltar aqui</p>
            )}
          </div>
        </div>
      ))}
    </div>
    {noFimDeSemana > 0 && (
      <p className="nt-vazio" style={{ marginTop: 8 }}>
        Mais {noFimDeSemana} concluída(s) no fim de semana.
      </p>
    )}
    </>
  );
}

function Capitulo({ projeto: p, numero, registrar, pessoas, onAbrir, onRegistrarSaude,
  onSalvarTarefa, onAbrirTarefa, etapaDeEntrada, etapaDeConclusao,
  podeEditar, podeEditarTarefa }: {
  projeto: Projeto;
  numero: number;
  /** Entrega o nó ao índice, que precisa dele para rolar até aqui. */
  registrar: (id: string, el: HTMLElement | null) => void;
  pessoas: Pessoa[];
  onAbrir: (p: Projeto) => void;
  onRegistrarSaude: (p: Projeto, estado: string) => void;
  onSalvarTarefa: (t: Tarefa, mudancas: Record<string, unknown>) => void;
  onAbrirTarefa: (t: Tarefa, p: Projeto) => void;
  etapaDeEntrada: string;
  etapaDeConclusao: string;
  podeEditar: boolean;
  /** Mexer na tarefa é outra permissão: a revista vive em Projetos, mas o
   *  servidor cobra `tarefas:editar` de quem grava. */
  podeEditarTarefa: boolean;
}) {
  const leitura = p.saude[0];
  const idade = idadeEmDias(leitura?.criado_em);
  const semana = semanaDoProjeto(p);
  const itensDaSemana = tarefasDaSemana(p);
  const pontos = pontosDeAtencao(p);
  const gestor = p.equipe.find(m => m.papel === 'Gestor');
  const progresso = progressoDe(p);
  const hoje = hojeIso();

  const dias = diasPara(p.previsao_entrega);
  // "Aberta" sai do carimbo do servidor: quais etapas encerram é configuração
  // de outra tela, e o relatório não deveria depender dela para contar.
  const atrasadas = (p.tarefas ?? [])
    .filter(t => !t.concluida_em && t.prazo && t.prazo < hoje);

  const acoes = [
    semana.tarefasFeitas.length && `${semana.tarefasFeitas.length} tarefa(s) concluída(s)`,
    semana.tarefasNovas && `${semana.tarefasNovas} criada(s)`,
    semana.evidencias.length && `${semana.evidencias.length} evidência(s) anexada(s)`,
    semana.reunioes.length && `${semana.reunioes.length} reunião(ões)`,
  ].filter(Boolean) as string[];

  const questoes = [
    ...p.entregas.filter(e => e.status === 'Bloqueada').map(e => ({
      nome: e.titulo,
      estado: 'Bloqueada',
      cor: VERMELHO,
      dono: e.responsaveis.map(id => p.equipe.find(m => m.id === id)).filter(Boolean)[0] ?? null,
    })),
    ...atrasadas
      .sort((a, b) => a.prazo!.localeCompare(b.prazo!))
      .slice(0, 5)
      .map(t => ({
        nome: t.titulo,
        estado: `Atrasada ${Math.abs(diasPara(t.prazo)!)}d`,
        cor: AMARELO,
        dono: p.equipe.find(m => m.id === t.responsavel_id) ?? null,
      })),
  ];

  return (
    <article className="nt-pagina" id={`capitulo-${p.id}`} data-id={p.id}
      ref={el => registrar(p.id, el)}>

      <header className="nt-cabeca">
        <span className="nt-numero">{String(numero).padStart(2, '0')}</span>
        <h2 className="nt-titulo">
          <button type="button" onClick={() => onAbrir(p)}>{p.nome}</button>
        </h2>
      </header>

      {/* Tabela de propriedades: o cabeçalho de página do editor. Resume o
          projeto antes de qualquer parágrafo. */}
      <div className="nt-props">
        <Prop rotulo="Cliente">{p.cliente_nome ?? 'Sem cliente'}</Prop>
        <Prop rotulo="Gestor">
          {gestor
            ? <PessoaFoto nome={gestor.nome} id={gestor.id} equipe={p.equipe} tamanho={18} />
            : <span className="nt-vazio">Sem gestor</span>}
        </Prop>
        <Prop rotulo="Prioridade">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
            color: COR_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO] ?? 'var(--gray)' }}>
            {ICONE_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO]?.({ size: 14 })}
            {p.prioridade ?? PRIORIDADE_PADRAO}
          </span>
        </Prop>
        <Prop rotulo="Saúde">
          {podeEditar ? (
            <CelulaSaude registro={leitura} onEscolher={e => onRegistrarSaude(p, e)} />
          ) : (
            <ChipSaude estado={leitura?.estado ?? SEM_LEITURA} size={11} />
          )}
        </Prop>
        <Prop rotulo="Fim previsto">
          {p.previsao_entrega ? (
            <>
              {fmtData(p.previsao_entrega)}
              {dias !== null && (
                <Tag
                  texto={dias < 0 ? `venceu há ${Math.abs(dias)}d` : `faltam ${dias}d`}
                  cor={dias < 0 ? VERMELHO : dias <= DIAS_DA_SEMANA ? AMARELO : VERDE}
                />
              )}
            </>
          ) : <span className="nt-vazio">Sem data</span>}
        </Prop>
        <Prop rotulo="Progresso">
          <span className="nt-progresso">
            <span className="nt-progresso-barra">
              <span style={{ width: `${progresso}%` }} />
            </span>
            {progresso}%
          </span>
        </Prop>
      </div>

      {/* Destaque com a leitura da semana: a barra e o ícone tomam a cor da
          saúde, para o diagnóstico e a frase que o explica lerem como um só. */}
      <div className="nt-destaque"
        style={{ ['--cor-saude' as string]: COR_SAUDE[leitura?.estado ?? ''] ?? 'var(--gray3)' }}>
        <span className="nt-destaque-icone">
          <IconAlert size={15} />
        </span>
        <div className="nt-destaque-texto">
          {leitura ? (
            <>
              <p>{leitura.descricao}</p>
              <p className="nt-destaque-pe">
                <PessoaFoto nome={leitura.criado_por_nome ?? 'Alguém da equipe'}
                  id={leitura.criado_por_id} equipe={p.equipe} tamanho={16} />
                <span className="nt-sep">·</span>
                {idade === null ? '' : idade === 0 ? 'hoje' : `há ${idade} dia${idade > 1 ? 's' : ''}`}
              </p>
            </>
          ) : (
            <p className="nt-vazio">Ninguém registrou como este projeto está indo.</p>
          )}
        </div>
      </div>

      <Bloco titulo="Ações da semana" contagem={semana.tarefasFeitas.length}>
        {acoes.length === 0 && itensDaSemana.length === 0 ? (
          <p className="nt-vazio">Nada registrado nem planejado nesta semana.</p>
        ) : (
          <>
            {itensDaSemana.length > 0 && (
              <QuadroDaSemana projeto={p} itens={itensDaSemana}
                etapaDeEntrada={etapaDeEntrada} etapaDeConclusao={etapaDeConclusao}
                podeEditar={podeEditarTarefa}
                onAbrirTarefa={x => onAbrirTarefa(x, p)} onSalvarTarefa={onSalvarTarefa} />
            )}
          </>
        )}
      </Bloco>

      <Bloco titulo="Entregas" contagem={p.entregas.length}>
        <EntregasDoProjeto entregas={p.entregas} equipe={p.equipe} />
      </Bloco>

      <Bloco titulo="Pontos de atenção" contagem={questoes.length + pontos.length}>
        {questoes.length === 0 && pontos.length === 0 ? (
          <p className="nt-vazio">Nada fora do lugar neste projeto.</p>
        ) : (
          <>
            {questoes.length > 0 && (
              <table className="nt-tabela">
                <thead>
                  <tr><th>Item</th><th>Situação</th><th>Responsável</th></tr>
                </thead>
                <tbody>
                  {questoes.map((q, k) => (
                    <tr key={k}>
                      <td title={q.nome}>{q.nome}</td>
                      <td><Tag texto={q.estado} cor={q.cor} /></td>
                      <td>
                        {q.dono
                          ? <PessoaFoto nome={q.dono.nome} id={q.dono.id} equipe={p.equipe} tamanho={16} />
                          : <span className="nt-vazio">Sem dono</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {pontos.length > 0 && (
              <ul className="nt-lista" style={{ marginTop: questoes.length ? 14 : 0 }}>
                {pontos.map((x, k) => (
                  <li key={k} className={x.grave ? 'grave' : undefined}>{x.texto}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </Bloco>
    </article>
  );
}

function AbaGestao({
  projetos, pessoas, onAbrir, onRegistrarSaude, onSalvarTarefa, onAbrirTarefa,
  etapaDeEntrada, etapaDeConclusao, podeEditar, podeEditarTarefa,
}: {
  projetos: Projeto[];
  pessoas: Pessoa[];
  onAbrir: (p: Projeto) => void;
  onRegistrarSaude: (p: Projeto, estado: string) => void;
  onSalvarTarefa: (t: Tarefa, mudancas: Record<string, unknown>) => void;
  onAbrirTarefa: (t: Tarefa, p: Projeto) => void;
  etapaDeEntrada: string;
  etapaDeConclusao: string;
  podeEditar: boolean;
  podeEditarTarefa: boolean;
}) {
  // Guardado por id de quem está fechado, e não de quem está aberto: assim um
  // projeto novo na lista nasce aberto, que é o padrão da revista.
  const [ativo, setAtivo] = useState<string | null>(null);
  const nos = useRef(new Map<string, HTMLElement>());

  const registrar = useCallback((id: string, el: HTMLElement | null) => {
    if (el) nos.current.set(id, el);
    else nos.current.delete(id);
  }, []);

  const estadoDe = (p: Projeto) => p.saude[0]?.estado ?? SEM_LEITURA;

  // A revista é da operação corrente: projeto concluído, pausado ou cancelado
  // não tem semana que valha a pena contar.
  const emAndamento = useMemo(
    () => projetos.filter(p => p.status === 'Em andamento'),
    [projetos],
  );

  // A ordem do relatório: prioridade primeiro, porque é a decisão que a casa
  // já tomou sobre o que importa mais. Dentro da mesma prioridade decide a
  // saúde, e no empate, quem está sem leitura há mais tempo - dois projetos
  // urgentes não são igualmente urgentes se um deles está com problemas.
  const ordem = (p: Projeto) => {
    const i = PRIORIDADES.indexOf((p.prioridade ?? PRIORIDADE_PADRAO) as typeof PRIORIDADES[number]);
    return i < 0 ? PRIORIDADES.length : i;
  };

  const lista = useMemo(() => {
    return [...emAndamento].sort((a, b) => {
      const oa = ordem(a);
      const ob = ordem(b);
      if (oa !== ob) return oa - ob;
      const pa = PESO_SAUDE[estadoDe(a)] ?? 9;
      const pb = PESO_SAUDE[estadoDe(b)] ?? 9;
      if (pa !== pb) return pa - pb;
      const ia = idadeEmDias(a.saude[0]?.criado_em);
      const ib = idadeEmDias(b.saude[0]?.criado_em);
      // Sem leitura nenhuma é o mais antigo que existe.
      return (ib ?? Infinity) - (ia ?? Infinity);
    });
  }, [emAndamento]);

  const chaves = lista.map(p => p.id).join('|');

  // Um observador só, com duas funções: acender o item do índice e deixar o
  // capítulo entrar quando ele aparece pela primeira vez. A faixa é estreita e
  // fica no alto da área de leitura - é ali que está o capítulo "atual".
  useEffect(() => {
    const alvos = [...nos.current.values()];
    if (alvos.length === 0) return;

    // Sem observador não há entrada nem item aceso, mas o capítulo tem de
    // aparecer: a regra de entrada o deixa invisível até a classe chegar.
    if (typeof IntersectionObserver === 'undefined') {
      for (const el of alvos) el.classList.add('entrou');
      return;
    }

    const raiz = alvos[0].closest('.admin-content-wrap') as HTMLElement | null;

    const espia = new IntersectionObserver(entradas => {
      const visiveis = entradas
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      const alvo = visiveis[0]?.target as HTMLElement | undefined;
      if (alvo) setAtivo(alvo.dataset.id ?? null);
    }, { root: raiz, rootMargin: '-12% 0px -72% 0px', threshold: 0 });

    // A entrada usa margem folgada: o capítulo já começa a aparecer antes de
    // chegar à faixa do índice, senão o movimento acontece fora de vista.
    const entrada = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (e.isIntersecting) {
          e.target.classList.add('entrou');
          entrada.unobserve(e.target);
        }
      }
    }, { root: raiz, rootMargin: '0px 0px -8% 0px', threshold: 0.02 });

    for (const el of alvos) { espia.observe(el); entrada.observe(el); }
    return () => { espia.disconnect(); entrada.disconnect(); };
  }, [chaves]);

  const suave = typeof window !== 'undefined'
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function irPara(id: string) {
    setAtivo(id);
    nos.current.get(id)?.scrollIntoView({
      behavior: suave ? 'smooth' : 'auto',
      block: 'start',
    });
  }

  return (
    <>
      {lista.length === 0 ? (
        <div className="admin-empty" style={{ padding: '48px 0' }}>
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
          <p>Nenhum projeto em andamento.</p>
        </div>
      ) : (
        <div className="rev-pagina">
          <Indice lista={lista} ativo={ativo} progressoDe={progressoDe}
            estadoDe={estadoDe} onIr={irPara} />

          <div className="rev-revista">
            {lista.map((p, i) => (
              <Capitulo
                key={p.id}
                projeto={p}
                numero={i + 1}
                registrar={registrar}
                pessoas={pessoas}
                onAbrir={onAbrir}
                onRegistrarSaude={onRegistrarSaude}
                onSalvarTarefa={onSalvarTarefa}
                onAbrirTarefa={onAbrirTarefa}
                etapaDeEntrada={etapaDeEntrada}
                etapaDeConclusao={etapaDeConclusao}
                podeEditar={podeEditar}
                podeEditarTarefa={podeEditarTarefa}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

function FormularioProjeto({
  editando, pessoas, clientes, salvando, onFechar, onSalvar, onBaixarAnexo, onVerAnexo, onEtiquetar,
  categorias, onExcluir, somenteLeitura, onVerTarefasDaEntrega,
  onRegistrarSaude, onExcluirSaude, onRegistrarReuniao, onExcluirReuniao,
  onPublicar, onSalvarEntrega, onExcluirEntrega, onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  editando: Projeto | null;
  pessoas: Pessoa[];
  clientes: Cliente[];
  salvando: boolean;
  /** Sai para a tela de Tarefas, estreitada numa entrega deste projeto. */
  onVerTarefasDaEntrega?: (entregaId: number) => void;
  onFechar: () => void;
  onSalvar: (r: Rascunho, anexos: AnexoPendente[], removidos: number[]) => void;
  onBaixarAnexo: (a: Arquivo) => void;
  onVerAnexo: (a: Arquivo) => void;
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
  /** Quem tem acesso ao projeto mas não à edição: enxerga tudo, e ainda filtra,
   *  agrupa, busca, baixa e pré-visualiza. Só não grava. */
  somenteLeitura: boolean;
  onExcluir: (p: Projeto) => void;
  /** Publica ou tira do ar. Devolve o token novo, `null` ao despublicar, ou
   *  `undefined` quando a gravação falhou. */
  onPublicar: (p: Projeto, publicar: boolean) => Promise<string | null | undefined>;
  onSalvarEntrega: (p: Projeto, dados: EntregaPendente, id?: number) => Promise<void>;
  onExcluirEntrega: (e: Entrega) => void;
  onSubirEvidencia: (e: Entrega, arquivos: FileList | null, comentario?: string, etapa?: string) => Promise<void>;
  onBaixarEvidencia: (ev: Evidencia) => void;
  onVerEvidencia: (ev: Evidencia) => void;
}) {
  const [r, setR] = useState<Rascunho>(() => editando ? {
    nome: editando.nome, descricao: editando.descricao ?? '',
    cliente_id: editando.cliente_id ?? '',
    tipo: editando.tipo ?? '', repositorio: editando.repositorio ?? '',
    link_portal: editando.link_portal ?? '',
    drive: editando.drive ?? '',
    // As entregas de um projeto existente são gravadas uma a uma, fora do
    // rascunho: aqui a lista fica vazia de propósito.
    entregas: [] as EntregaPendente[],
    status: editando.status, prioridade: editando.prioridade ?? PRIORIDADE_PADRAO,
    equipe: editando.equipe.map(m => ({ usuario_id: m.id, papel: m.papel })),
    data_inicio: editando.data_inicio ?? '', previsao_entrega: editando.previsao_entrega ?? '',
    progresso: editando.progresso ?? 0, observacoes: editando.observacoes ?? '',
  } : { ...VAZIO, entregas: entregasDePartida() });
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
  const [copiadoPublico, setCopiadoPublico] = useState(false);
  const [publicando, setPublicando] = useState(false);
  /** Token da página do cliente. Vem do projeto e é atualizado aqui para o
   *  botão reagir na hora, sem esperar a listagem recarregar. */
  const [tokenPublico, setTokenPublico] = useState<string | null>(
    editando?.publico_token ?? null);
  useEffect(() => { setTokenPublico(editando?.publico_token ?? null); }, [editando?.publico_token]);
  const linkPublico = tokenPublico ? `${window.location.origin}/p/${tokenPublico}` : null;
  const { largura, arrastando, setArrastando, porTecla } = useLarguraPainel('projeto');
  const fundo = useFecharNoFundo(onFechar);

  /** Link que abre este projeto direto, para quem já tem acesso ao portal. É o
   *  mesmo formato que o Funil usa em `?lead=`. */
  /** Copia um endereço, com o `prompt` como plano B: sem HTTPS ou com a
   *  permissão negada, a área de transferência não existe. */
  async function copiar(url: string, marcar: (v: boolean) => void, rotulo: string) {
    try {
      await navigator.clipboard.writeText(url);
      marcar(true);
      window.setTimeout(() => marcar(false), 2000);
    } catch {
      window.prompt(rotulo, url);
    }
  }

  async function alternarPublicacao() {
    if (!editando) return;
    setPublicando(true);
    try {
      const r = await onPublicar(editando, !tokenPublico);
      if (r === undefined) return;
      setTokenPublico(r);
      // Publicou agora: o link já vai para a área de transferência, que é o
      // passo seguinte em todo caso.
      if (r) void copiar(`${window.location.origin}/p/${r}`, setCopiadoPublico,
        'Copie o link de acompanhamento:');
    } finally {
      setPublicando(false);
    }
  }

  async function copiarLink() {
    if (!editando) return;
    const url = `${window.location.origin}/?projeto=${editando.id}`;
    await copiar(url, setCopiado, 'Copie o link do projeto:');
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
    if (inputArquivo.current) inputArquivo.current.value = '';
  }


  return createPortal(
    <div className="admin-modal-overlay" {...fundo}>
      {/* Fora do painel de propósito: dentro dele, que rola, o puxador sumiria
          ao descer o conteúdo. Ancorado pela direita, acompanha a largura.
          Em tela cheia não existe: não há borda para arrastar. */}
      <button
        type="button"
        className={`painel-puxador${arrastando ? ' arrastando' : ''}`}
        style={{ right: `min(${largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}
        // Sem `stopPropagation` no mousedown de propósito: é preciso que o
        // fundo veja o evento para registrar que o gesto NÃO começou nele.
        // Barrando aqui, ele ficava com a marca da interação anterior e o
        // painel fechava ao soltar o arrasto fora.
        onMouseDown={e => { e.preventDefault(); setArrastando(true); }}
        onKeyDown={porTecla}
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar a largura do painel"
        aria-valuenow={largura}
        aria-valuemin={PAINEL_MIN}
        aria-valuemax={PAINEL_MAX}
        title="Arraste para ajustar a largura"
      />
      <div className="admin-modal"
        style={{ width: `min(${largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>


        {/* `com-abas`: a linha que separa cabeçalho e corpo passa a ser a
            linha das abas, em vez de haver uma logo abaixo da outra. */}
        <div className="admin-modal-header com-abas"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            {/* `flex: 1` porque sem ele o bloco encolhe para o tamanho natural
                de um input e o nome corta muito antes da borda. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {editando ? `Projeto ${editando.codigo ?? ''}`.trim() : 'Novo projeto'}
              </p>
              {/* O nome é editado onde ele é lido. Ligado ao rascunho, e não ao
                  projeto gravado: enquanto não se salva, o cabeçalho mostra o
                  que está sendo escrito. */}
              {somenteLeitura ? (
                <h3 className="painel-titulo">{r.nome || 'Sem nome'}</h3>
              ) : (
                <>
                  <input
                    className={`painel-titulo painel-titulo-campo${erros.nome ? ' erro' : ''}`}
                    value={r.nome}
                    autoFocus={!editando}
                    placeholder="Nome do projeto"
                    aria-label="Nome do projeto"
                    aria-invalid={!!erros.nome}
                    title={r.nome}
                    onChange={e => set('nome', e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  />
                  {erros.nome && <p className="form-error" style={{ marginTop: 2 }}>{erros.nome}</p>}
                </>
              )}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {editando && (
                <>
                  {/* No ar, o botão vira um selo pulsando: publicar muda o que
                      existe fora do portal, e isso não pode ficar escondido num
                      ícone que se parece com os vizinhos. No hover ele anuncia o
                      que o clique faz, em vermelho - o rótulo não muda para quem
                      lê por leitor de tela, que recebe o `aria-label`. */}
                  {tokenPublico ? (
                    <button type="button" className="ao-vivo"
                      disabled={publicando || somenteLeitura}
                      title="A página do cliente está no ar. Clique para tirar."
                      aria-label="Tirar a página do cliente do ar"
                      aria-pressed
                      onClick={() => void alternarPublicacao()}>
                      <span className="ao-vivo-ponto" aria-hidden="true" />
                      <span className="ao-vivo-texto" aria-hidden="true">Ao vivo</span>
                      <span className="ao-vivo-acao" aria-hidden="true">Tirar do ar</span>
                    </button>
                  ) : (
                    <button type="button" className="secao-add" style={{ width: 30, height: 30 }}
                      disabled={publicando || somenteLeitura}
                      title="Publicar uma página de acompanhamento para o cliente"
                      aria-label="Publicar a página do cliente"
                      onClick={() => void alternarPublicacao()}>
                      <IconGlobo size={15} />
                    </button>
                  )}
                  {linkPublico && (
                    <button type="button" className="secao-add" style={{ width: 30, height: 30 }}
                      title={copiadoPublico ? 'Link copiado' : 'Copiar o link do cliente'}
                      aria-label="Copiar o link de acompanhamento do cliente"
                      onClick={() => void copiar(linkPublico, setCopiadoPublico,
                        'Copie o link de acompanhamento:')}>
                      {copiadoPublico ? <IconCheck size={15} /> : <IconExternal size={15} />}
                    </button>
                  )}
                  <button type="button" className="secao-add" style={{ width: 30, height: 30 }}
                    title={copiado ? 'Link copiado' : 'Copiar link do projeto'}
                    aria-label="Copiar link para compartilhar o projeto"
                    onClick={() => void copiarLink()}>
                    {copiado ? <IconCheck size={15} /> : <IconLink size={15} />}
                  </button>
                </>
              )}
              <button className="admin-modal-close" aria-label="Fechar" onClick={onFechar}><IconX size={16} /></button>
            </span>
          </div>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {somenteLeitura
              ? <ChipStatus status={r.status} />
              : <PilulaStatus valor={r.status} onChange={v => set('status', v)} />}
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
            <Abas
              valor={abaModal}
              onChange={setAbaModal}
              style={{ marginBottom: 0, marginTop: 6 }}
              opcoes={[
                { valor: 'geral', label: 'Geral' },
                { valor: 'reunioes', label: 'Reuniões' },
                { valor: 'saude', label: 'Saúde' },
              ]}
            />
          )}
        </div>

        {/* A classe da animação vai no próprio corpo, e não num invólucro:
            `display: contents` num invólucro não gera caixa, e sem caixa não há
            o que animar - e uma caixa de verdade quebraria a rolagem daqui. A
            chave repete a entrada a cada aba, e de quebra devolve a rolagem ao
            topo, que é onde a aba nova começa. */}
        {/* `fieldset` desabilitado, e não uma coleção de `disabled` espalhados:
            ele desliga todo controle de formulário que estiver dentro, inclusive
            os que forem acrescentados depois, e tira todos da ordem de tabulação
            de uma vez. Em modo leitura o painel tem de ser uma folha impressa -
            os dropdowns nem abrem, e o cursor não promete clique. */}
        <fieldset className="admin-modal-body aba-painel painel-leitura" key={abaModal}
          disabled={somenteLeitura}>

          {editando && abaModal === 'reunioes' && (
            <SecaoReunioes
              somenteLeitura={somenteLeitura}
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
              somenteLeitura={somenteLeitura}
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
                <label className="form-label">Descrição</label>
                <textarea className="form-input" rows={2} value={r.descricao} readOnly={somenteLeitura}
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
              <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              <CampoEndereco rotulo="Link de acesso" valor={r.link_portal}
                placeholder="https://portal.cliente.com.br/"
                dica="Endereço do que foi entregue. Aparece na página do cliente."
                somenteLeitura={somenteLeitura} onChange={v => set('link_portal', v)} />
              <CampoEndereco rotulo="Repositório no GitHub" valor={r.repositorio}
                placeholder="https://github.com/sheeptechservices/portal-sheep"
                somenteLeitura={somenteLeitura} onChange={v => set('repositorio', v)} />
              <CampoEndereco rotulo="Pasta no Drive" valor={r.drive}
                placeholder="https://drive.google.com/drive/folders/..."
                somenteLeitura={somenteLeitura} onChange={v => set('drive', v)} />
            </div>
          </section>

          <section>
            <p className="admin-section-title">Prazo</p>
            <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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
              somenteLeitura={somenteLeitura} onChange={v => set('equipe', v)} />
            {erros.equipe && <p className="form-error" style={{ marginTop: 6 }}>{erros.equipe}</p>}
          </section>

          <SecaoEntregas
            somenteLeitura={somenteLeitura}
            entregas={editando?.entregas ?? []}
            pendentes={r.entregas}
            tarefas={editando?.tarefas ?? []}
            caminho={[editando?.cliente_nome ?? '', editando?.nome ?? '']}
            onVerTarefasDaEntrega={onVerTarefasDaEntrega}
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
              <textarea className="form-input" rows={2} value={r.observacoes} readOnly={somenteLeitura}
                onChange={e => set('observacoes', e.target.value)}
                placeholder="Riscos, dependências, combinados" />
            </div>
          </section>

          <section>
            <div className="admin-section-head">
              <p className="admin-section-title">Anexos</p>
              {!somenteLeitura && (
                <button type="button" className="secao-add"
                  onClick={() => inputArquivo.current?.click()}
                  title={`Adicionar arquivo · máx. ${fmtTamanho(LIMITE_ANEXO)}`}
                  aria-label="Adicionar arquivo">
                  <IconPlus size={14} />
                </button>
              )}
            </div>
            <input ref={inputArquivo} type="file" multiple hidden
              onChange={e => void escolherArquivos(e.target.files)} />
            {erroAnexo && (
              <p style={{ fontSize: 11.5, color: '#B45309', margin: '0 0 8px' }}>{erroAnexo}</p>
            )}

            {jaAnexados.length === 0 && novos.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhum anexo.</p>
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
                          etiqueta={a.etiqueta} somenteLeitura={somenteLeitura}
                          onEtiqueta={v => {
                            setReetiquetados(r => ({ ...r, [a.id]: v }));
                            void onEtiquetar(a, v);
                          }}
                          onVer={() => onVerAnexo(a)}
                          onBaixar={() => onBaixarAnexo(a)}
                          onRemover={() => setRemovidos(p => [...p, a.id])} />
                      ))}
                      {pendentes.map(({ a, i }) => (
                        <LinhaAnexo key={`novo-${i}`} nome={a.nome} tamanho={a.tamanho} tipo={a.tipo}
                          etiqueta={a.etiqueta} somenteLeitura={somenteLeitura}
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

        </fieldset>

        {/* Mesmo rodapé do painel de tarefa: ações sobre a coisa inteira à
            esquerda, longe do botão que se aperta o tempo todo. */}
        <div className="painel-rodape">
          <span className="painel-rodape-lado">
            {editando && !somenteLeitura && (
              <button type="button" className="rodape-icone perigo"
                title="Excluir projeto" aria-label="Excluir projeto"
                disabled={salvando} onClick={() => onExcluir(editando)}>
                <IconTrash size={15} />
              </button>
            )}
          </span>
          <button type="button" className="modal-acao" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button type="button" className="modal-acao-primaria" onClick={tentarSalvar} disabled={salvando}>
              {salvando ? 'Salvando…' : editando ? 'Salvar' : 'Criar projeto'}
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

type Aba = 'geral' | 'gestao';

export default function ProjetosPage({ token, onVerTarefasDaEntrega }: {
  token: string;
  /** Entregue pelo painel: leva à tela de Tarefas já filtrada numa entrega. */
  onVerTarefasDaEntrega?: (projetoId: string, entregaId: number) => void;
}) {
  const { pode, usuario, onSessionExpired } = useAuth();
  const { toast } = useToast();

  const [aba, setAba] = useState<Aba>('geral');
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  /** As etapas de tarefa, de Configurações > Etapas. Só o relatório usa: é o
   *  seletor do modal e o destino de uma tarefa reaberta no quadro. */
  const [etapasTarefa, setEtapasTarefa] = useState<EtapaTarefa[]>([]);
  const [etiquetasTarefa, setEtiquetasTarefa] = useState<EtiquetaTarefa[]>([]);
  const [etiquetaPorPapel, setEtiquetaPorPapel] = useState(false);
  /** Tarefa aberta pelo quadro da semana, em rascunho: é o que o formulário
   *  compartilhado edita, e ele é o mesmo da tela de Tarefas. */
  const [rascunhoTarefa, setRascunhoTarefa] = useState<RascunhoTarefa | null>(null);
  /** Tarefa esperando confirmação para ser excluída, aberta pelo painel. */
  const [excluindoTarefa, setExcluindoTarefa] = useState<Tarefa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<{ editando: Projeto | null } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Projeto | null>(null);
  const fundoProjeto = useFecharNoFundo(() => setExcluindo(null));
  /** Arquivo aberto em prévia, sem sair do portal. `fonte` diz de onde buscar
   *  o conteúdo: anexo do projeto e evidência de entrega vivem em tabelas
   *  diferentes, com ações próprias. */
  const [previa, setPrevia] = useState<
    { fonte: 'anexo'; item: Arquivo } | { fonte: 'evidencia'; item: Evidencia } | null
  >(null);
  /** Projeto cuja leitura de saúde está sendo registrada pela listagem. */
  // Guarda o estado escolhido na lista junto do projeto: o modal abre com ele
  // já marcado, e continua trocável lá dentro.
  const [lendoSaude, setLendoSaude] = useState<{ projeto: Projeto; estado?: string } | null>(null);
  const [view, setView] = useState<'quadro' | 'lista'>('lista');
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fCliente, setFCliente] = useState<string[]>([]);
  const [fGestor, setFGestor] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[]>([]);

  const podeCriar = pode('projetos:criar');
  const podeEditar = pode('projetos:editar');
  /** Para onde volta uma tarefa reaberta no quadro da semana. */
  const etapaDeEntrada = etapasTarefa.find(e => Number(e.is_entrada) === 1)?.nome
    ?? etapasTarefa[0]?.nome ?? '';
  /** A etapa de conversão, para onde vai a tarefa marcada como feita. Vem de
   *  Configurações > Etapas: é a mesma que faz a entrega contar progresso. */
  const etapaDeConclusao = etapasTarefa.find(e => Number(e.is_conclusao) === 1)?.nome ?? '';


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

  /** A carga inteira, com esqueleto. Só na entrada da tela: depois de uma ação
   *  quem recarrega é `recarregar`, sem trocar a tela pelo esqueleto. */
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [p, u, e, tags] = await Promise.all([
        api('?action=projetos'),
        api('?action=usuarios_notificaveis'),
        api('?action=tarefa_status_configs'),
        api('?action=tarefa_etiquetas'),
      ]);
      setProjetos(p?.projetos ?? []);
      setClientes(p?.clientes ?? []);
      setPessoas(u?.usuarios ?? []);
      setEtapasTarefa(e?.statuses ?? []);
      setEtiquetasTarefa(tags?.etiquetas ?? []);
      setEtiquetaPorPapel(!!tags?.porPapel);
    } catch {
      toast('error', 'Não foi possível carregar', 'A lista de projetos não veio. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [api, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Reconcilia a tela com o servidor depois de uma ação, sem esqueleto e sem
   *  prender ninguém: a mudança já foi pintada, isto só traz o que o servidor
   *  deduz sozinho - status e progresso da entrega, principalmente.
   *
   *  Puxa apenas a listagem: etapas, etiquetas e usuários não mudam por causa
   *  de uma tarefa arrastada, e refazer as quatro chamadas era metade da
   *  demora. */
  /** Conta as mudanças pintadas na tela. A resposta que sai daqui é uma foto do
   *  servidor no instante do pedido: se alguém mexeu enquanto ela vinha, ela já
   *  nasceu velha, e aplicá-la desfaria o gesto na cara da pessoa. */
  const mudancasRef = useRef(0);

  const recarregar = useCallback(async () => {
    const marca = mudancasRef.current;
    const p = await api('?action=projetos');
    if (marca !== mudancasRef.current) return;
    if (p?.projetos) { setProjetos(p.projetos); setClientes(p.clientes ?? []); }
  }, [api]);

  /** Junta rajadas: arrastar três cards seguidos reconcilia uma vez, e não três
   *  vezes com a listagem inteira no meio do caminho. */
  const reconciliarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconciliar = useCallback(() => {
    if (reconciliarRef.current) clearTimeout(reconciliarRef.current);
    reconciliarRef.current = setTimeout(() => {
      reconciliarRef.current = null;
      void recarregar();
    }, 450);
  }, [recarregar]);
  useEffect(() => () => {
    if (reconciliarRef.current) clearTimeout(reconciliarRef.current);
  }, []);

  /** Pinta a mudança na tarefa antes de o servidor responder. */
  const pintarTarefa = useCallback((id: number, mudancas: Partial<Tarefa>) => {
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p,
      tarefas: (p.tarefas ?? []).map(t => (t.id === id ? { ...t, ...mudancas } : t)),
    })));
  }, []);

  const etq = useMemo(() => indexarEtiquetas(etiquetasTarefa), [etiquetasTarefa]);

  /** Abre a tarefa do quadro no mesmo formulário da tela de Tarefas. */
  /** Exclui a tarefa aberta no painel. Some da tela na hora e volta se o
   *  servidor recusar - mesma regra do resto do relatório. */
  const excluirTarefa = useCallback(async (t: Tarefa) => {
    setExcluindoTarefa(null);
    setRascunhoTarefa(null);
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p, tarefas: (p.tarefas ?? []).filter(x => x.id !== t.id),
    })));
    const r = await api('', 'POST', { action: 'excluir_tarefa', id: t.id });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível excluir', r.error); return; }
    toast('success', 'Tarefa excluída');
    reconciliar();
  }, [api, projetos, reconciliar, toast]);

  /** Cópia da tarefa, a partir do relatório. Mesma regra da tela de Tarefas:
   *  igual em tudo, inclusive etapa e data de conclusão. */
  const duplicarTarefa = useCallback(async (t: Tarefa) => {
    const r = await api('', 'POST', {
      action: 'salvar_tarefa',
      projeto_id: t.projeto_id, entrega_id: t.entrega_id,
      titulo: `${t.titulo} (cópia)`, descricao: t.descricao,
      status: t.status, prioridade: t.prioridade,
      responsavel_id: t.responsavel_id, prazo: t.prazo, etiquetas: t.etiquetas,
      concluida_em: t.concluida_em,
    });
    if (r?.error) { toast('error', 'Não foi possível duplicar', r.error); return; }
    toast('success', 'Tarefa duplicada');
    await recarregar();
  }, [api, recarregar, toast]);

  const abrirTarefa = useCallback((t: Tarefa) => setRascunhoTarefa({
    id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id ? String(t.entrega_id) : '',
    titulo: t.titulo, descricao: t.descricao ?? '', status: t.status,
    prioridade: t.prioridade ?? PRIORIDADE_PADRAO, responsavel_id: t.responsavel_id ?? '',
    prazo: t.prazo ?? '', etiquetas: t.etiquetas,
  }), []);

  /** Grava o rascunho inteiro, como faz a tela de Tarefas. Diferente do arraste
   *  no quadro, aqui a pessoa apertou "Salvar": vale o formulário todo. */
  const salvarRascunho = useCallback(async (r: RascunhoTarefa) => {
    if (!r.titulo.trim()) { toast('error', 'Falta o título', 'A tarefa precisa de um título.'); return; }
    setSalvando(true);
    try {
      const resposta = await api('', 'POST', {
        action: 'salvar_tarefa', ...r,
        entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
      });
      if (resposta?.error) { toast('error', 'Não foi possível salvar', resposta.error); return; }
      if (r.id) {
        const dono = pessoas.find(x => x.id === r.responsavel_id);
        pintarTarefa(r.id, {
          titulo: r.titulo, descricao: r.descricao, status: r.status,
          prioridade: r.prioridade, prazo: r.prazo || null, etiquetas: r.etiquetas,
          entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
          responsavel_id: r.responsavel_id || null,
          responsavel_nome: dono?.nome ?? null,
          responsavel_foto: dono?.foto_url ?? null,
        });
      }
      setRascunhoTarefa(null);
      toast('success', 'Tarefa salva');
      reconciliar();
    } finally {
      setSalvando(false);
    }
  }, [api, pessoas, pintarTarefa, reconciliar, toast]);
  /** Grava uma mudança pontual numa tarefa, a partir do relatório. Manda a
   *  tarefa inteira e sobrescreve o que mudou: a ação do servidor grava todos
   *  os campos, e um corpo parcial apagaria o resto. */
  const salvarTarefa = useCallback(async (t: Tarefa, mudancas: Record<string, unknown>) => {
    // Pinta antes de perguntar: arrastar um card tem de responder no gesto, e
    // o servidor não decide nada aqui que a tela não saiba prever. O nome do
    // responsável anda junto do id, senão o card mostraria a foto antiga.
    const naTela: Partial<Tarefa> = { ...mudancas } as Partial<Tarefa>;
    if ('responsavel_id' in mudancas) {
      const dono = pessoas.find(x => x.id === mudancas.responsavel_id);
      naTela.responsavel_nome = dono?.nome ?? null;
      naTela.responsavel_foto = dono?.foto_url ?? null;
    }
    pintarTarefa(t.id, naTela);

    const r = await api('', 'POST', {
      action: 'salvar_tarefa',
      id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id,
      titulo: t.titulo, descricao: t.descricao, status: t.status,
      prioridade: t.prioridade, responsavel_id: t.responsavel_id,
      prazo: t.prazo, etiquetas: t.etiquetas, concluida_em: t.concluida_em,
      ...mudancas,
    });
    if (r?.error) {
      pintarTarefa(t.id, t);  // desfaz: a tela volta ao que era antes do gesto
      toast('error', 'Não foi possível salvar', r.error);
      return;
    }
    // Status e progresso da entrega o servidor deduz das tarefas; é o que a
    // reconciliação vem buscar, já com a tela pintada.
    reconciliar();
  }, [api, pessoas, pintarTarefa, reconciliar, toast]);

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
      await recarregar();
    } finally {
      setSalvando(false);
    }
  }


  /** Grava a leitura e recarrega: o registro nasce no servidor, com id, data e
   *  autor, e inventar isso aqui só para adiantar a tela abriria espaço para
   *  divergência. */
  async function registrarSaude(p: Projeto, estado: string, descricao: string) {
    await api('', 'POST', { action: 'registrar_saude_projeto', projeto_id: p.id, estado, descricao });
    toast('success', 'Leitura registrada');
    await recarregar();
  }

  /** Publica ou tira do ar a página de acompanhamento do cliente. Devolve o
   *  token para o painel montar o link, ou `undefined` se o servidor recusou. */
  async function publicarProjeto(p: Projeto, publicar: boolean) {
    const r = await api('', 'POST', {
      action: publicar ? 'publicar_projeto' : 'despublicar_projeto', id: p.id,
    });
    if (r?.error) {
      toast('error', publicar ? 'Não foi possível publicar' : 'Não foi possível despublicar', r.error);
      return undefined;
    }
    const token: string | null = r?.token ?? null;
    mudancasRef.current++;
    setProjetos(ps => ps.map(x => (x.id === p.id
      ? { ...x, publico_token: token, publicado_em: token ? new Date().toISOString() : null } : x)));
    toast('success', publicar ? 'Página publicada' : 'Página fora do ar',
      publicar ? 'O link foi copiado para a área de transferência.' : undefined);
    return token;
  }

  async function salvarEntrega(p: Projeto, dados: EntregaPendente, id?: number) {
    // Entrega que já existe muda na tela primeiro: trocar o status de uma linha
    // é o gesto mais repetido do painel, e ele esperava a listagem inteira
    // voltar do servidor para mudar de cor. Entrega nova não dá para adiantar -
    // o id nasce lá.
    const antes = id ? p.entregas.find(e => e.id === id) : null;
    if (antes) {
      mudancasRef.current++;
      setProjetos(ps => ps.map(x => (x.id !== p.id ? x : {
        ...x,
        entregas: x.entregas.map(e => (e.id === id ? { ...e, ...dados } as Entrega : e)),
      })));
    }
    const r = await api('', 'POST', { action: 'salvar_entrega', projeto_id: p.id, id, ...dados });
    if (r?.error) {
      if (antes) {
        setProjetos(ps => ps.map(x => (x.id !== p.id ? x : {
          ...x, entregas: x.entregas.map(e => (e.id === id ? antes : e)),
        })));
      }
      toast('error', 'Não deu', r.error);
      return;
    }
    reconciliar();
  }

  async function excluirEntrega(e: Entrega) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => (p.id !== e.projeto_id ? p : {
      ...p, entregas: p.entregas.filter(x => x.id !== e.id),
    })));
    const r = await api('', 'POST', { action: 'excluir_entrega', id: e.id });
    if (r?.error) { setProjetos(antes); toast('error', 'Não deu', r.error); return; }
    reconciliar();
  }

  async function subirEvidencia(e: Entrega, arquivos: FileList | null, comentario?: string, etapa?: string) {
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
        base64: await lerBase64(f), comentario, etapa, substituir: primeiro,
      });
      primeiro = false;
    }
    await recarregar();
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
    toast('success', 'Reunião registrada');
    await recarregar();
  }

  async function excluirReuniao(r: Reuniao) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => (
      p.id === r.projeto_id ? { ...p, reunioes: p.reunioes.filter(x => x.id !== r.id) } : p
    )));
    const resp = await api('', 'POST', { action: 'excluir_reuniao_projeto', id: r.id });
    if (resp?.error) { setProjetos(antes); toast('error', 'Não foi possível excluir', resp.error); }
  }

  async function excluirSaude(r: RegistroSaude) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => (
      p.id === r.projeto_id ? { ...p, saude: p.saude.filter(x => x.id !== r.id) } : p
    )));
    const resp = await api('', 'POST', { action: 'excluir_saude_projeto', id: r.id });
    if (resp?.error) { setProjetos(antes); toast('error', 'Não foi possível excluir', resp.error); }
  }

  /** Reetiqueta na hora e grava. Sem o otimismo o arquivo demoraria a pular de
   *  grupo, e o efeito da troca ficaria invisível. */
  async function etiquetarAnexo(a: Arquivo, etiqueta: string) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p,
      arquivos: p.arquivos.map(x => (x.id === a.id ? { ...x, etiqueta } : x)),
    })));
    const r = await api('', 'POST', { action: 'etiquetar_projeto_arquivo', id: a.id, etiqueta });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível etiquetar', r.error); }
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
    setProjetos(ps => ps.filter(x => x.id !== p.id));
    await api('', 'POST', { action: 'delete_projeto', id: p.id });
    toast('success', 'Projeto excluído');
    await recarregar();
  }

  /** Muda só um campo, sem abrir o formulário. Usado na aba de gestão. */
  /** Ajuste de um campo só, direto da listagem. O update no servidor mexe
   *  apenas no que recebe, então mandar o campo isolado é suficiente - e
   *  reenviar a linha inteira arriscaria sobrescrever o que outra pessoa
   *  acabou de mudar. */
  async function definirGestor(p: Projeto, usuarioId: string) {
    const antes = projetos;
    mudancasRef.current++;
    // Otimista na equipe: quem era gestor vira Dev, o novo assume. É o mesmo
    // que o servidor faz, para a linha não esperar o recarregamento.
    setProjetos(ps => ps.map(x => {
      if (x.id !== p.id) return x;
      const pessoa = pessoas.find(u => u.id === usuarioId);
      const semGestor = x.equipe.map(m => (m.papel === 'Gestor' ? { ...m, papel: 'Dev' } : m));
      if (!pessoa) return { ...x, equipe: semGestor };
      const jaEsta = semGestor.some(m => m.id === usuarioId);
      return {
        ...x,
        equipe: jaEsta
          ? semGestor.map(m => (m.id === usuarioId ? { ...m, papel: 'Gestor' } : m))
          : [...semGestor, { ...pessoa, papel: 'Gestor' }],
      };
    }));
    const r = await api('', 'POST', { action: 'definir_gestor_projeto', projeto_id: p.id, usuario_id: usuarioId });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível trocar o gestor', r.error); }
  }

  /** Ajuste de um campo, direto da listagem. Pinta na hora e desfaz se o
   *  servidor recusar - sem isto, quem não tem permissão de editar via a
   *  célula mudar na tela enquanto o servidor devolvia 403 em silêncio. */
  async function ajustar(p: Projeto, campo: 'status' | 'prioridade' | 'previsao_entrega', valor: string) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(x => (x.id === p.id ? { ...x, [campo]: valor } as Projeto : x)));
    const r = await api('', 'POST', { action: 'update_projeto', id: p.id, [campo]: valor });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível salvar', r.error); }
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

  // Sem coluna escolhida vale a ordem do servidor, do mais novo para o mais
  // velho - é a que responde "o que entrou por último".
  const [ordemCol, setOrdemCol] = useState<string | null>(null);
  const [ordemDir, setOrdemDir] = useState<'asc' | 'desc'>('asc');

  function ordenarPor(col: string) {
    if (ordemCol !== col) { setOrdemCol(col); setOrdemDir('asc'); return; }
    // Terceiro clique desliga: volta para a ordem natural da lista.
    if (ordemDir === 'asc') { setOrdemDir('desc'); return; }
    setOrdemCol(null);
  }

  const filtrados = useMemo(() => projetos.filter(p =>
    (fStatus.length === 0 || fStatus.includes(p.status)) &&
    (fCliente.length === 0 || (p.cliente_nome && fCliente.includes(p.cliente_nome))) &&
    (fGestor.length === 0 || fGestor.includes(gestorDe(p)?.nome ?? '')) &&
    (fTipo.length === 0 || (p.tipo && fTipo.includes(p.tipo)))
  ), [projetos, fStatus, fCliente, fGestor, fTipo]);

  const ordenados = useMemo(() => {
    if (!ordemCol) return filtrados;
    const chave = CHAVE_ORDEM[ordemCol];
    if (!chave) return filtrados;
    const sinal = ordemDir === 'asc' ? 1 : -1;
    return [...filtrados].sort((a, b) => {
      const x = chave(a);
      const y = chave(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sinal;
      return String(x).localeCompare(String(y), 'pt-BR') * sinal;
    });
  }, [filtrados, ordemCol, ordemDir]);

  const temFiltro = fStatus.length + fCliente.length + fGestor.length + fTipo.length > 0;
  const limparFiltros = () => { setFStatus([]); setFCliente([]); setFGestor([]); setFTipo([]); };

  // O resumo conta o que está em tela: com filtro aplicado, número que ignora
  // o filtro vira contradição visível.
  // Os cartões contam o que está na tela: mexer num filtro e ver o número
  // parado faria duvidar de qual dos dois está certo.
  const resumo = useMemo(() => {
    const vivos = filtrados.filter(p => p.status !== 'Concluído' && p.status !== 'Cancelado');
    return {
      total: filtrados.length,
      andamento: filtrados.filter(p => p.status === 'Em andamento').length,
      atrasados: vivos.filter(p => {
        const d = diasPara(p.previsao_entrega);
        return d !== null && d < 0;
      }).length,
      // Só entre os que ainda correm: cobrar leitura de projeto encerrado seria
      // uma pendência que ninguém vai resolver.
      semSaude: vivos.filter(p => !p.saude[0]).length,
      progresso: vivos.length
        ? Math.round(vivos.reduce((soma, p) => soma + progressoDe(p), 0) / vivos.length)
        : 0,
    };
  }, [filtrados]);

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
      <Abas
        valor={aba}
        onChange={setAba}
        opcoes={[{ valor: 'geral', label: 'Geral' }, { valor: 'gestao', label: 'Gestão' }]}
      />

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

      {/* O cabeçalho fica de fora: o título é o mesmo nas duas abas, e vê-lo
          reanimar a cada troca daria a impressão de que a página inteira
          recarregou. */}
      <AbaPainel key={aba} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Os cartões são da aba Geral. Na Gestão nem o esqueleto deles aparece,
          senão a tela prometeria uma faixa que não vem. */}
      {aba === 'gestao' ? null : carregando ? (
        <CartoesKpiEsqueleto cartoes={5} />
      ) : projetos.length > 0 && (
        <div className="admin-stats" style={{ marginBottom: 18 }}>
          <CartaoKpi rotulo="Projetos" valor={resumo.total}
            nota={temFiltro ? 'no filtro atual' : 'cadastrados'}
            cor="var(--yellow)" atraso={0} />
          <CartaoKpi rotulo="Em andamento" valor={resumo.andamento} nota="com trabalho correndo"
            cor="#B58300" atraso={0.05}
            ativo={fStatus.includes('Em andamento')}
            onClick={() => setFStatus(f => f.includes('Em andamento')
              ? f.filter(x => x !== 'Em andamento')
              : [...f, 'Em andamento'])} />
          <CartaoKpi rotulo="Atrasados" valor={resumo.atrasados} nota="com a entrega vencida"
            cor="#D93025" atraso={0.1} />
          <CartaoKpi rotulo="Sem leitura" valor={resumo.semSaude} nota="nunca tiveram update de saúde"
            cor="#6E6F69" atraso={0.15} />
          <CartaoKpi rotulo="Progresso médio" valor={`${resumo.progresso}%`} nota="das entregas validadas"
            cor="#0066CC" atraso={0.2} />
        </div>
      )}

      {/* A barra de filtros é da aba Geral. Na Gestão o relatório é a carteira
          inteira: recortá-la por cliente ou por tipo daria um panorama que não
          é panorama de nada. */}
      {aba === 'geral' && !carregando && projetos.length > 0 && (
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
              <button className={view === 'quadro' ? 'active' : ''} onClick={() => setView('quadro')}
                title="Quadro" aria-label="Ver em quadro">
                <IconVisaoQuadro size={14} />
              </button>
              <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}
                title="Lista" aria-label="Ver em lista">
                <IconVisaoLista size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {carregando ? (
        // O esqueleto imita a visão que está aberta: quadro vira cartões,
        // lista vira linhas. Um giro no meio da tela não diria nada disso.
        aba === 'geral' && view === 'quadro'
          ? <SkeletonCards cards={6} />
          : <SkeletonTabela linhas={6} colunas={aba === 'geral' ? [4, 2, 1, 2, 2, 1, 1, 2, 1] : [3, 2, 2, 2, 2, 2]} />
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
                      onClick={() => setForm({ editando: p })}
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
          <table className="admin-table sem-quebra largura-fixa">
            <thead>
              <tr>
                {/* A coluna do projeto tomava o espaço que sobrava. Presa em
                    32%, o resto da linha respira e o nome corta com reticências. */}
                {([
                  ['projeto', 'Projeto', 400],
                  ['saude', 'Saúde', 145],
                  ['prioridade', 'Prioridade', 70],
                  ['cliente', 'Cliente', 150],
                  ['gestor', 'Gestor', 160],
                  ['entrega', 'Entrega', 120],
                  ['progresso', 'Progresso', 95],
                  // 160px: a pílula mais larga ("Em andamento") pede 128, e a
                  // célula come 32 de recuo. Com 130 ela transbordava, e o corte
                  // da célula desenhava um "..." ao lado de um chip inteiro.
                  ['status', 'Status', 160],
                ] as [string, string, string | number | undefined][]).map(([col, rotulo, largura]) => (
                  <ThOrdenavel key={col} coluna={col} atual={ordemCol} dir={ordemDir}
                    onOrdenar={ordenarPor} style={{ width: largura }}>
                    {rotulo}
                  </ThOrdenavel>
                ))}
                {/* Ações não ordena: não é dado do projeto. */}
                <th style={{ width: 70 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map(p => (
                <tr key={p.id}
                  onClick={() => setForm({ editando: p })}
                  tabIndex={0}
                  onKeyDown={e => {
                    // Linha clicavel tambem precisa abrir pelo teclado.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setForm({ editando: p });
                    }
                  }}
                  style={{ cursor: 'pointer' }}>
                  <td>
                    {(() => {
                      // A entrega em curso é a primeira que ainda não terminou:
                      // é ela que responde "em que pé está o projeto".
                      const atual = p.entregas.find(e =>
                        e.status !== ENTREGA_VALIDADA && e.status !== ENTREGA_CANCELADA);
                      return (
                        <span style={{ display: 'block', minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 600, color: 'var(--black)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={atual ? `Em curso: ${atual.titulo} (${atual.status})` : undefined}>
                            {p.nome}
                          </span>
                          {p.descricao && (
                            <span style={{ display: 'block', marginTop: 3, fontSize: 11.5,
                              color: 'var(--gray2)', overflow: 'hidden',
                              textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={p.descricao}>
                              {p.descricao}
                            </span>
                          )}
                        </span>
                      );
                    })()}
                  </td>

                  <td>
                    {podeEditar ? (
                      <CelulaSaude registro={p.saude[0]}
                        onEscolher={estado => setLendoSaude({ projeto: p, estado })} />
                    ) : (
                      <span title={p.saude[0]?.descricao ?? 'Nenhuma leitura de saúde registrada.'}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ChipSaude estado={p.saude[0]?.estado ?? SEM_LEITURA} size={11} />
                      </span>
                    )}
                  </td>

                  <td>
                    {/* Só o ícone: a escala se lê pela altura das barras, e o
                        nome do nível fica na dica. */}
                    {podeEditar ? (
                      <CelulaPrioridade valor={p.prioridade ?? PRIORIDADE_PADRAO}
                        onChange={v => void ajustar(p, 'prioridade', v)} />
                    ) : (
                      <span title={`Prioridade: ${p.prioridade ?? PRIORIDADE_PADRAO}`}>
                        {ICONE_PRIORIDADE[p.prioridade ?? PRIORIDADE_PADRAO]?.({ size: 15 })}
                      </span>
                    )}
                  </td>

                  <td style={{ color: 'var(--gray)', fontSize: 12 }}
                    title={p.cliente_nome ?? undefined}>
                    <span style={{ display: 'block', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.cliente_nome || '-'}
                    </span>
                  </td>

                  <td>
                    {podeEditar ? (
                      <CelulaGestor gestor={gestorDe(p)} pessoas={pessoas}
                        onChange={id => void definirGestor(p, id)} />
                    ) : (
                      <Gestor nome={gestorDe(p)?.nome ?? null} email={gestorDe(p)?.email ?? null}
                        foto={gestorDe(p)?.foto_url} />
                    )}
                  </td>

                  <td>
                    {(() => {
                      const dias = diasPara(p.previsao_entrega);
                      const atrasado = dias !== null && dias < 0
                        && p.status !== 'Concluído' && p.status !== 'Cancelado';
                      if (!podeEditar) {
                        return (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                            fontSize: 12, color: atrasado ? 'var(--red)' : 'var(--gray)' }}
                            title={atrasado ? `${Math.abs(dias!)} dia(s) de atraso` : undefined}>
                            <IconCalendario size={13} />
                            {fmtData(p.previsao_entrega)}
                          </span>
                        );
                      }
                      return (
                        <CelulaData valor={p.previsao_entrega} atrasado={atrasado}
                          onChange={v => void ajustar(p, 'previsao_entrega', v)} />
                      );
                    })()}
                  </td>

                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}
                      title={`${p.entregas.filter(e => e.status === ENTREGA_VALIDADA).length} de ${p.entregas.length} entrega(s) validada(s)`}>
                      <AnelProgresso valor={progressoDe(p)} />
                      {progressoDe(p)}%
                    </span>
                  </td>

                  <td>
                    {podeEditar ? (
                      // O controle vive dentro de uma linha clicavel: o clique e o
                      // Enter param aqui, senao abririam o modal de edicao junto.
                      <span onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        <PilulaStatus valor={p.status} onChange={v => void ajustar(p, 'status', v)} compacta />
                      </span>
                    ) : <ChipStatus status={p.status} />}
                  </td>
                  <td>
                    {podeExcluir && (
                      <button className="admin-toolbar-btn perigo" title="Excluir projeto"
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
        <AbaGestao
          projetos={projetos}
          pessoas={pessoas}
          onSalvarTarefa={salvarTarefa}
          onAbrirTarefa={abrirTarefa}
          etapaDeEntrada={etapaDeEntrada}
          etapaDeConclusao={etapaDeConclusao}
          podeEditarTarefa={pode('tarefas:editar')}
          onAbrir={p => setForm({ editando: p })}
          onRegistrarSaude={(p, estado) => setLendoSaude({ projeto: p, estado })}
          podeEditar={podeEditar}
        />
      )}
      </AbaPainel>

      {form && (
        <FormularioProjeto
          // Versão viva da lista, e não o retrato de quando o modal abriu: a
          // leitura de saúde recarrega os projetos, e o retrato antigo não
          // mostraria o registro recém-criado.
          editando={form.editando ? projetos.find(p => p.id === form.editando!.id) ?? form.editando : null}
          onVerTarefasDaEntrega={form.editando && onVerTarefasDaEntrega
            ? entregaId => onVerTarefasDaEntrega(form.editando!.id, entregaId)
            : undefined}
          pessoas={pessoas}
          clientes={clientes}
          salvando={salvando}
          onFechar={() => setForm(null)}
          onSalvar={salvar}
          onBaixarAnexo={a => void baixarAnexo(a)}
          categorias={categoriasDeEntrega}
          somenteLeitura={!podeEditar}
          onExcluir={setExcluindo}
          onEtiquetar={etiquetarAnexo}
          onRegistrarSaude={registrarSaude}
          onExcluirSaude={excluirSaude}
          onRegistrarReuniao={registrarReuniao}
          onExcluirReuniao={excluirReuniao}
          onPublicar={publicarProjeto}
          onSalvarEntrega={salvarEntrega}
          onExcluirEntrega={excluirEntrega}
          onSubirEvidencia={subirEvidencia}
          onBaixarEvidencia={baixarEvidencia}
          onVerEvidencia={ev => setPrevia({ fonte: 'evidencia', item: ev })}
          onVerAnexo={a => setPrevia({ fonte: 'anexo', item: a })}
        />
      )}

      {lendoSaude && (
        <DialogoSaude
          projeto={lendoSaude.projeto}
          inicial={lendoSaude.estado}
          salvando={salvando}
          onFechar={() => setLendoSaude(null)}
          onRegistrar={(estado, descricao) => registrarSaude(lendoSaude.projeto, estado, descricao)}
        />
      )}

      {rascunhoTarefa && (
        <FormularioTarefa
          rascunho={rascunhoTarefa}
          projetos={projetos}
          etapas={etapasTarefa}
          etiquetas={etiquetasTarefa}
          etiquetaPorPapel={etiquetaPorPapel}
          usuarioId={usuario?.id}
          etq={etq}
          pessoas={pessoas}
          salvando={salvando}
          somenteLeitura={!pode('tarefas:editar')}
          podeComentar={pode('tarefas:comentar')}
          api={api}
          onMudar={setRascunhoTarefa}
          onFechar={() => setRascunhoTarefa(null)}
          onSalvar={() => void salvarRascunho(rascunhoTarefa)}
          onExcluir={pode('tarefas:excluir') && rascunhoTarefa.id ? () => {
            const alvo = projetos.flatMap(p => p.tarefas ?? []).find(x => x.id === rascunhoTarefa.id);
            if (alvo) setExcluindoTarefa(alvo);
          } : undefined}
          onDuplicar={pode('tarefas:editar') && rascunhoTarefa.id ? () => {
            const alvo = projetos.flatMap(p => p.tarefas ?? []).find(x => x.id === rascunhoTarefa.id);
            if (alvo) void duplicarTarefa(alvo);
          } : undefined}
        />
      )}

      {excluindoTarefa && (
        <ConfirmarExclusao
          tarefa={excluindoTarefa}
          onCancelar={() => setExcluindoTarefa(null)}
          onConfirmar={() => void excluirTarefa(excluindoTarefa)}
        />
      )}

      {previa && (
        <PreviaArquivo
          arquivo={{
            nome: previa.item.nome,
            comentario: previa.fonte === 'evidencia' ? previa.item.comentario : null,
          }}
          onCarregar={() => api(previa.fonte === 'evidencia'
            ? `?action=entrega_evidencia_base64&id=${previa.item.id}`
            : `?action=projeto_arquivo_base64&id=${previa.item.id}`)}
          onBaixar={() => (previa.fonte === 'evidencia'
            ? void baixarEvidencia(previa.item)
            : void baixarAnexo(previa.item))}
          onFechar={() => setPrevia(null)}
        />
      )}

      {excluindo && createPortal(
        <div className="admin-modal-overlay" style={{ zIndex: 1100, alignItems: 'center', justifyContent: 'center' }}
          {...fundoProjeto}>
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
