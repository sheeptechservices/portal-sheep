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
  IconPlay, IconPlus, IconPrioridadeAlta, IconPrioridadeBaixa, IconPrioridadeMaxima,
  IconRecolher,
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
import { SeletorVinculo, ChipVinculo } from '../components/VinculoReuniao';
import { ancorar } from '../lib/ancorar';
import {
  DIMENSOES, chavesDe, comparadorDe, marcaDaLinha as marcaFora, type Dimensao,
} from '../lib/agrupamento';
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
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
// O quadro e o calendário são os mesmos da página do cliente: uma
// implementação só, para os dois lados não divergirem no primeiro ajuste.
import {
  CalendarioEntregas, QuadroEntregas, SwitcherVisao, type ItemVisao, type Visao,
} from '../components/VisoesEntregas';
import { useLarguraPainel } from '../lib/painelLateral';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { useRevelar } from '../lib/useRevelar';
import { Donut, type FatiaDonut } from '../components/Donut';
// O mesmo formulário da tela de Tarefas: o quadro da semana abre a tarefa aqui,
// e uma cópia local divergiria dela no primeiro campo novo.
import {
  ConfirmarExclusao, FormularioTarefa, indexarEtiquetas, tarefaGravada, TITULO_PADRAO,
  type EtapaTarefa, type EtiquetaTarefa, type Rascunho as RascunhoTarefa,
} from './FormularioTarefa';
import { PreviaArquivo } from '../components/PreviaArquivo';
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
const ORDENS_ENTREGA = [
  { valor: 'criacao', label: 'Ordem de criação' },
  { valor: 'titulo', label: 'Título (A a Z)' },
  { valor: 'prazo', label: 'Prazo mais próximo' },
  { valor: 'status', label: 'Etapa' },
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
  /** Onde a entrega vive: o primeiro nível (empresa, frente, produto) e o
   *  segundo (a área dentro dele). Era um campo só, "categoria" - e entrega de
   *  duas naturezas virava texto colado com hífen no meio, que nenhum
   *  agrupamento sabia separar. */
  marcador: string | null;
  submarcador: string | null;
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
  /** Quantos comentários a conversa tem. Só o número: o conteúdo desce quando
   *  o card abre. */
  comentarios?: number;
  /** Quantos arquivos vieram pendurados nesses comentários. */
  anexos?: number;
}

/** Entrega ainda sem id, montada no cadastro de um projeto novo. */
export interface EntregaPendente {
  titulo: string;
  descricao: string;
  marcador: string;
  submarcador: string;
  status: string;
  prazo: string;
  responsaveis: string[];
  links: { label: string; url: string }[];
}

export interface Reuniao {
  /** Id da reunião no Fireflies, quando ela veio de lá. Nulo é registro à mão. */
  fireflies_id?: string | null;
  /** Link da transcrição, para quem quiser o detalhe que a nota resume. */
  link?: string | null;
  /** O que veio do Fireflies além da nota: tópicos com horário, palavras-chave
   *  e itens de ação. Chega como JSON e é lido por `lerDados`. */
  dados?: string | null;
  /** Entregas que esta reunião tratou. A tarefa não se liga direto: ela herda
   *  as reuniões da entrega a que pertence. */
  entregas?: number[];
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
const MARCADOR_DE_PARTIDA = 'Ritos';

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
    marcador: MARCADOR_DE_PARTIDA,
    submarcador: '',
    status: ENTREGA_PLANEJADA,
    prazo: '', responsaveis: [], links: [],
  }));
}

/** O nome com que o projeto nasce. Ele é criado no clique, e nome vazio não
 *  passa pela gravação - este fica no campo, já selecionado, para a primeira
 *  tecla o trocar. */
export const NOME_PADRAO = 'Projeto sem nome';

/** O rascunho de um projeto recém-nascido. Só entra aqui o que é verdade sem
 *  perguntar a ninguém: quem clicou é o gestor, e os ritos da casa são os
 *  mesmos de sempre. Cliente, tipo e datas ficam vazios de propósito - chutá-los
 *  poria no quadro de todo mundo um projeto dizendo coisas que ninguém decidiu.
 *
 *  O formulário abre exatamente com isto, e é isto que vai para o banco no
 *  clique: se os dois divergissem, a primeira gravação automática devolveria
 *  campos vazios por cima do que acabou de ser criado. */
function rascunhoDePartida(usuarioId?: string): Rascunho {
  return {
    ...VAZIO,
    nome: NOME_PADRAO,
    equipe: usuarioId ? [{ usuario_id: usuarioId, papel: 'Gestor' }] : [],
    entregas: entregasDePartida(),
  };
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
  const leitura = useRevelar(abrindo);
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

      {/* Mesma regra do editor de entrega: o bloco empurra o resto da coluna,
          então ele cresce e encolhe em vez de piscar. */}
      {leitura.montado && (
        <div className={`revelar${leitura.aberto ? ' aberto' : ''}`}>
        <div>
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

// ── Marcador e submarcador da entrega ───────────────────────────────────────

/** Campo livre que reaproveita o que já foi escrito. Lista fechada engessaria a
 *  casa; campo solto viraria "BI", "bi" e "B.I." na mesma base. A sugestão
 *  puxa a grafia existente sem impedir um marcador novo. */
function CampoMarcador({ valor, sugestoes, exemplo, onChange }: {
  valor: string;
  sugestoes: string[];
  /** O que se escreve ali, como exemplo. */
  exemplo: string;
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
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [campoRef, dropRef], () => setAberto(false));

  return (
    <>
      <input ref={campoRef} className="form-input" value={valor}
        onChange={e => { onChange(e.target.value); abrir(); }}
        onFocus={abrir}
        placeholder={exemplo}
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
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  async function registrar() {
    if (!descricao.trim()) { setErro('Descreva a situação do projeto.'); return; }
    await onRegistrar(estado, descricao.trim());
    onFechar();
  }

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
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

/** Carência antes de uma coluna recolhida voltar a recolher (ms). */
const RECOLHER_APOS_MS = 2000;
/** Tempo parado sobre o traço antes de ele abrir: atravessar o quadro com o
 *  ponteiro não deve disparar a expansão. */
const INTENCAO_MS = 200;

/** Uma coluna do quadro da entrega.
 *
 *  Recolhe quando está vazia - padrão de todo quadro da casa - ou quando a
 *  etapa foi marcada como pontual pelo botão do próprio cabeçalho. Fechada, ela
 *  é um traço com a bolinha da cor e a contagem; abre parando o ponteiro em
 *  cima, e na hora quando um card está sendo arrastado, porque aí a coluna
 *  precisa estar pronta para receber. */
function ColunaDaEntrega({ etapa, tarefas, podeEditar, arrastando, onAbrir, onCriar,
  onExcluir, onSoltarAqui, onArrastar, onFimDoArraste, onFixarRecolhida }: {
  etapa: EtapaTarefa;
  tarefas: Tarefa[];
  podeEditar: boolean;
  arrastando: number | null;
  onAbrir: (t: Tarefa) => void;
  onCriar: () => void;
  onExcluir: (t: Tarefa) => void;
  onSoltarAqui: () => void;
  onArrastar: (id: number) => void;
  onFimDoArraste: () => void;
  /** Ausente para quem não configura etapas. */
  onFixarRecolhida?: (etapaId: number) => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [sobre, setSobre] = useState(false);
  const abrirTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limparAbrir = () => {
    if (abrirTimer.current) { clearTimeout(abrirTimer.current); abrirTimer.current = null; }
  };
  const limparFechar = () => {
    if (fecharTimer.current) { clearTimeout(fecharTimer.current); fecharTimer.current = null; }
  };
  useEffect(() => () => { limparAbrir(); limparFechar(); }, []);

  const recolhivel = tarefas.length === 0 || Number(etapa.always_collapsed) === 1;

  function agendarFechar() {
    limparFechar();
    fecharTimer.current = setTimeout(() => setAberta(false), RECOLHER_APOS_MS);
  }
  function entrou() {
    limparFechar();
    if (aberta) return;
    limparAbrir();
    abrirTimer.current = setTimeout(() => setAberta(true), INTENCAO_MS);
  }
  function saiu() { limparAbrir(); agendarFechar(); }
  // O arraste não espera intenção: a coluna abre na hora para receber a tarefa.
  function segurarAberta() { limparAbrir(); limparFechar(); setAberta(true); }

  const classes = [
    'kanban-column',
    recolhivel ? 'kanban-column-collapsible' : '',
    recolhivel && aberta ? 'is-open' : '',
    recolhivel && arrastando !== null ? 'drop-ready' : '',
    sobre ? 'drag-over' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}
      style={{ ['--col-color' as string]: etapa.cor }}
      onDragOver={ev => {
        if (!podeEditar || arrastando === null) return;
        ev.preventDefault();
        setSobre(true);
        if (recolhivel) segurarAberta();
      }}
      onDragLeave={() => { setSobre(false); if (recolhivel) agendarFechar(); }}
      onDrop={ev => {
        ev.preventDefault();
        setSobre(false);
        if (recolhivel) agendarFechar();
        onSoltarAqui();
      }}
      {...(recolhivel ? { onMouseEnter: entrou, onMouseLeave: saiu } : {})}>

      {recolhivel && (
        <div className="kanban-rail" aria-hidden="true">
          <span className="kanban-dot" style={{ background: etapa.cor }} />
          {tarefas.length > 0 && <span className="kanban-rail-count">{tarefas.length}</span>}
        </div>
      )}

      <div className="kanban-column-header">
        {/* A descrição da etapa vira a dica, como no quadro grande. */}
        <div className="kanban-column-title" title={etapa.descricao ?? undefined}>
          <span className="kanban-dot" style={{ background: etapa.cor }} />
          {etapa.nome}
        </div>
        {/* O subtotal colado no titulo, como na tela de Tarefas. */}
        <span className="kanban-conta-bolha">{tarefas.length}</span>
        {/* Manter a etapa recolhida é decisão sobre o quadro, e se toma olhando
            para ele. É a mesma marca da tela de Tarefas: a etapa marcada aqui
            fica recolhida lá também. Na mesma ordem de lá - marca, contagem e
            o mais -, senão a mesma cabeça de coluna se leria de dois jeitos. */}
        {onFixarRecolhida && (
          <button type="button" className="kanban-column-fixar"
            aria-pressed={Number(etapa.always_collapsed) === 1}
            title={Number(etapa.always_collapsed) === 1
              ? 'Etapa recolhida por padrão. Clique para mantê-la aberta.'
              : 'Manter esta etapa recolhida, mesmo com tarefas dentro'}
            aria-label={Number(etapa.always_collapsed) === 1
              ? 'Manter a etapa aberta' : 'Manter a etapa recolhida'}
            onClick={ev => { ev.stopPropagation(); onFixarRecolhida(etapa.id); }}>
            <IconRecolher size={12} aberta={Number(etapa.always_collapsed) !== 1} />
          </button>
        )}
        {podeEditar && (
          <button type="button" className="kanban-column-fixar"
            title={`Nova tarefa em "${etapa.nome}"`}
            aria-label={`Nova tarefa em ${etapa.nome}`}
            onClick={ev => { ev.stopPropagation(); onCriar(); }}>
            <IconPlus size={12} />
          </button>
        )}
      </div>

      <div className="kanban-column-body">
        {tarefas.map(x => (
          <div key={x.id} className="kanban-card"
            draggable={podeEditar}
            onDragStart={() => onArrastar(x.id)}
            onDragEnd={onFimDoArraste}
            onClick={() => podeEditar && onAbrir(x)}
            style={{ cursor: podeEditar ? 'pointer' : 'default',
              opacity: arrastando === x.id ? 0.45 : 1 }}>
            <p className="kanban-card-title">{x.titulo}</p>
            <div className="entrega-kanban-pe">
              {x.prazo && <span>{fmtData(x.prazo)}</span>}
              {x.responsavel_nome && (
                <span title={x.responsavel_nome} style={{ marginLeft: 'auto' }}>
                  <Avatar nome={x.responsavel_nome} foto={x.responsavel_foto} size={16} />
                </span>
              )}
              {podeEditar && (
                <button type="button" className="kanban-card-acao perigo"
                  title="Excluir tarefa" aria-label={`Excluir ${x.titulo}`}
                  onClick={ev => { ev.stopPropagation(); onExcluir(x); }}>
                  <IconTrash size={11} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** As tarefas de uma entrega, em quadro.
 *
 *  Mesmo quadro da tela de Tarefas, em tamanho de painel: as mesmas colunas, na
 *  mesma ordem do fluxo, com as mesmas cores, o mesmo arraste e as mesmas
 *  colunas recolhíveis. Duas leituras diferentes da mesma coisa fariam a pessoa
 *  reaprender o que ela já sabe.
 *
 *  Todas as etapas aparecem, inclusive as vazias - fechadas num traço, que é
 *  onde o card cabe quando alguém arrasta. O quadro rola de lado dentro do
 *  próprio bloco, e nunca empurra a largura do painel.
 *
 *  Quem abre o quadro é a seção de tarefas, que nasce fechada: a entrega aberta
 *  responde primeiro sobre ela mesma. */
function KanbanDaEntrega({ tarefas, etapas, podeEditar, onAbrir, onCriar, onExcluir,
  onMover, onFixarRecolhida }: {
  tarefas: Tarefa[];
  etapas: EtapaTarefa[];
  podeEditar: boolean;
  onAbrir: (t: Tarefa) => void;
  /** Nasce já na coluna em que foi pedida. */
  onCriar: (status: string) => void;
  onExcluir: (t: Tarefa) => void;
  onMover: (t: Tarefa, status: string) => void;
  onFixarRecolhida?: (etapaId: number) => void;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);

  return (
    <div className="kanban-board entrega-kanban">
      {etapas.map(et => (
        <ColunaDaEntrega key={et.id}
          etapa={et}
          tarefas={tarefas.filter(x => x.status === et.nome)}
          podeEditar={podeEditar}
          arrastando={arrastando}
          onAbrir={onAbrir}
          onCriar={() => onCriar(et.nome)}
          onExcluir={onExcluir}
          onArrastar={setArrastando}
          onFimDoArraste={() => setArrastando(null)}
          onSoltarAqui={() => {
            const alvo = tarefas.find(x => x.id === arrastando);
            setArrastando(null);
            if (alvo && alvo.status !== et.nome) onMover(alvo, et.nome);
          }}
          onFixarRecolhida={onFixarRecolhida} />
      ))}
    </div>
  );
}

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
function EditorEntrega({ inicial, pessoas, marcadores, submarcadores, salvando, onSalvar, onCancelar }: {
  inicial?: Entrega | EntregaPendente;
  pessoas: Pessoa[];
  /** Categorias já usadas, para a grafia não se multiplicar. */
  marcadores: string[];
  submarcadores: string[];
  salvando: boolean;
  onSalvar: (e: EntregaPendente) => void;
  onCancelar: () => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '');
  const [marcador, setMarcador] = useState(inicial?.marcador ?? '');
  const [submarcador, setSubmarcador] = useState(inicial?.submarcador ?? '');
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
    onSalvar({ titulo: titulo.trim(), descricao,
      marcador: marcador.trim(), submarcador: submarcador.trim(),
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
      {/* Os dois níveis lado a lado, e o prazo na linha de baixo: marcador e
          submarcador se leem juntos, e separá-los faria escolher um sem ver o
          outro. */}
      <div className="campos-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Marcador</label>
          <CampoMarcador valor={marcador} sugestoes={marcadores}
            exemplo="Empresa, frente, produto" onChange={setMarcador} />
        </div>
        <div className="form-group">
          <label className="form-label">Submarcador</label>
          <CampoMarcador valor={submarcador} sugestoes={submarcadores}
            exemplo="Área dentro do marcador" onChange={setSubmarcador} />
        </div>
      </div>

      {/* Prazo e responsáveis na mesma linha: são as duas perguntas do
          compromisso - para quando e com quem. A data tem largura fixa porque
          não cresce com o conteúdo; quem fica com a sobra é a lista de
          pessoas, que cresce. */}
      <div className="campos-2" style={{ display: 'grid',
        gridTemplateColumns: '220px minmax(0, 1fr)', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Prazo</label>
          <DatePicker compact allowPast value={prazo} onChange={setPrazo} />
        </div>
        <div className="form-group">
          <label className="form-label">Responsáveis</label>
          <SeletorPessoas pessoas={pessoas} valor={responsaveis} onChange={setResponsaveis}
            vazio="Escolher responsáveis" />
        </div>
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
  entregas, pendentes, tarefas, onVerTarefasDaEntrega, onCriarTarefa, onAbrirTarefa,
  onExcluirTarefa, onMoverTarefa, onFixarRecolhida, podeEditarTarefa, etapasTarefa,
  pessoas, marcadores, submarcadores,
  salvando, somenteLeitura,
  reunioes, focada, onVincular, onAbrirReuniao,
  onSalvarEntrega, onExcluirEntrega, onAlterarPendentes,
  onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  /** Já gravadas. Vazio enquanto o projeto não existe. */
  entregas: Entrega[];
  /** As do projeto, para vincular a entrega às que a trataram. */
  reunioes: Reuniao[];
  /** Entrega que a tela deve abrir e destacar, vinda do chip de uma reunião. */
  focada?: number | null;
  onVincular: (reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onAbrirReuniao: (reuniaoId: number) => void;
  /** Todas as do projeto. Cada entrega filtra as suas pelo `entrega_id`. */
  tarefas: Tarefa[];
  /** Abre a tela de Tarefas estreitada nesta entrega. */
  onVerTarefasDaEntrega?: (entregaId: number) => void;
  /** Cria uma tarefa já ligada a esta entrega, na coluna pedida, e abre o
   *  painel dela. */
  onCriarTarefa: (entregaId: number, status?: string) => void;
  /** Abre a tarefa no mesmo painel da tela de Tarefas. */
  onAbrirTarefa: (t: Tarefa) => void;
  /** Pede a exclusão: quem confirma é o diálogo da página. */
  onExcluirTarefa: (t: Tarefa) => void;
  /** Arrastou de uma coluna para outra. */
  onMoverTarefa: (t: Tarefa, status: string) => void;
  /** As colunas do quadro, na ordem do fluxo. */
  etapasTarefa: EtapaTarefa[];
  /** Marca a etapa como recolhida por padrão. Ausente para quem não configura
   *  etapas: é ajuste do quadro de todo mundo, e não desta entrega. */
  onFixarRecolhida?: (etapaId: number) => void;
  /** Sem isto a lista continua à vista, só que sem criar, abrir nem excluir. */
  podeEditarTarefa: boolean;
  /** Em memória, no cadastro de um projeto novo. */
  pendentes: EntregaPendente[];
  pessoas: Pessoa[];
  /** Categorias já usadas em qualquer projeto: a grafia vem de lá. */
  marcadores: string[];
  submarcadores: string[];
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
  /** Entregas com a seção de tarefas aberta. Fechada por padrão: a lista é o
   *  segundo passo de quem abriu a entrega, e não a primeira coisa que ela diz.
   */
  const [tarefasAbertas, setTarefasAbertas] = useState<number[]>([]);
  const abrirTarefas = (id: number) =>
    setTarefasAbertas(a => (a.includes(id) ? a : [...a, id]));
  const alternarTarefas = (id: number) =>
    setTarefasAbertas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));

  const [editando, setEditando] = useState<number | 'novo' | null>(null);
  const [editandoPendente, setEditandoPendente] = useState<number | null>(null);
  const editorNovo = useRevelar(editando === 'novo' || editandoPendente === -1);
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
      titulo: e.titulo, descricao: e.descricao ?? '',
      marcador: e.marcador ?? '', submarcador: e.submarcador ?? '', status,
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
  // Dois níveis, escolhidos na tela: o grupo maior e o que se reparte dentro
  // dele. Desligado por padrão - agrupar ajuda em lista longa e atrapalha em
  // lista curta.
  const [maior, setMaior] = useState<Dimensao>('nenhum');
  const [menor, setMenor] = useState<Dimensao>('nenhum');

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

  /** O que o cabeçalho do grupo não está dizendo: repetir "Alldax" em toda
   *  linha de um bloco chamado "Alldax" é ruído. */
  const marcaDaLinha = (e: Entrega) => marcaFora(e, [maior, menor]);

  /** A lista já filtrada e ordenada, repartida em blocos. Sem agrupamento é um
   *  bloco só, sem título, e o desenho da lista não muda. */
  /** Quem responde pela entrega, por nome. É o que o agrupamento por
   *  responsável usa como título de bloco. */
  const donosDe = useCallback((e: Entrega) => e.responsaveis
    .map(id => pessoas.find(p => p.id === id)?.nome)
    .filter((n): n is string => !!n), [pessoas]);

  /** Reparte uma lista por uma dimensão. Entrega de dois responsáveis aparece
   *  nos dois blocos: ela é de ambos, e esconder uma cópia faria o time procurar
   *  o que é dele e não achar. */
  const repartir = useCallback((lista: Entrega[], dim: Dimensao) => {
    const chaves = (e: Entrega) => chavesDe(e, dim, () => donosDe(e));
    return [...new Set(lista.flatMap(chaves))]
      .sort(comparadorDe(dim, STATUS_ENTREGA))
      .map(titulo => ({ titulo, itens: lista.filter(e => chaves(e).includes(titulo)) }));
  }, [donosDe]);

  const blocos = useMemo(() => {
    // Com dois níveis quem reparte é `secoes`, logo abaixo: aqui a lista sai
    // inteira, como se não houvesse agrupamento.
    if (maior === 'nenhum' || menor !== 'nenhum') return [{ titulo: '', itens: visiveis }];
    return repartir(visiveis, maior);
  }, [visiveis, maior, menor, repartir]);

  /** Com os dois níveis escolhidos, a lista é repartida duas vezes: o maior
   *  vira seção e o menor, os blocos dentro dela. Com um nível só existe uma
   *  seção sem título, e o desenho é o de sempre. */
  const secoes = useMemo(() => {
    if (maior === 'nenhum' || menor === 'nenhum') return [{ titulo: '', blocos }];
    return repartir(visiveis, maior).map(secao => ({
      titulo: secao.titulo,
      blocos: repartir(secao.itens, menor),
    }));
  }, [maior, menor, blocos, visiveis, repartir]);

  /** Lista é a padrão: é a leitura que responde "o que está acontecendo". */
  const [visao, setVisao] = useState<Visao>('lista');
  /** Entrega que acabou de ser aberta pelo quadro ou pelo calendário. */
  const [realcada, setRealcada] = useState<number | null>(null);

  /** As visíveis no formato enxuto que o quadro e o calendário pedem. Os
   *  responsáveis são ids no painel, e viram nome e foto aqui. */
  const paraVisao: ItemVisao[] = visiveis.map(e => ({
    id: e.id,
    titulo: e.titulo,
    marcador: e.marcador ?? null,
    submarcador: e.submarcador ?? null,
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

  // Vindo do chip de uma reunião: abre a entrega pedida, rola até ela e pisca.
  useEffect(() => {
    if (focada == null) return;
    setAbertas(a => (a.includes(focada) ? a : [...a, focada]));
    setJaAbertas(j => (j.includes(focada) ? j : [...j, focada]));
    setRealcada(focada);
    const t = setTimeout(() => setRealcada(r => (r === focada ? null : r)), 2200);
    return () => clearTimeout(t);
  }, [focada]);

  /** Grupos recolhidos. Guardado por título: com a lista longa, fechar o que
   *  não interessa é o que faz o agrupamento valer a pena. Trocar o critério
   *  reabre tudo, senão a pessoa mudaria de eixo e veria uma lista vazia. */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  useEffect(() => { setRecolhidos(new Set()); }, [maior, menor]);

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
        {/* No alto fica só a escolha de como olhar - lista, quadro ou
            calendário -, que é a decisão que muda a seção inteira. O que opera
            sobre o que está à vista desceu para a linha da busca. */}
        <SwitcherVisao valor={visao} onChange={setVisao} />
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
        <SeletorLista valor={ordem} onChange={setOrdem} opcoes={ORDENS_ENTREGA}
          icone={IconOrdenar} rotulo="Ordenar entregas" />
        <SeletorAgrupamento maior={maior} menor={menor}
          onMudar={(ma, me) => { setMaior(ma); setMenor(me); }} />
        {/* Ordenar e agrupar continuam em leitura. Só o acrescentar sai, junto
            com o resto do que grava. */}
        {!somenteLeitura && (
          <button type="button" className="secao-add"
            onClick={() => (gravado ? setEditando('novo') : setEditandoPendente(-1))}
            title="Adicionar entrega" aria-label="Adicionar entrega">
            <IconPlus size={14} />
          </button>
        )}
      </div>

      {/* Abre e fecha com altura: o formulário empurra a lista inteira para
          baixo, e aparecer de estalo faz a página saltar debaixo do olho. */}
      {editorNovo.montado && (
        <div className={`revelar${editorNovo.aberto ? ' aberto' : ''}`}>
          <div>
            <EditorEntrega
              pessoas={pessoas}
              marcadores={marcadores}
              submarcadores={submarcadores}
              salvando={salvando}
              onSalvar={dados => {
                if (gravado || entregas.length) void onSalvarEntrega(dados);
                else onAlterarPendentes([...pendentes, dados]);
                setEditando(null); setEditandoPendente(null);
              }}
              onCancelar={() => { setEditando(null); setEditandoPendente(null); }}
            />
          </div>
        </div>
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

      {visao === 'lista' && secoes.map(secao => {
      const chaveSecao = `sec:${secao.titulo}`;
      const secaoFechada = recolhidos.has(chaveSecao);
      const blocosDaSecao = secao.blocos.map(bloco => {
      // A chave do recolhido carrega a seção: "Comercial" existe na Alldax e na
      // Tax All, e sem o prefixo fechar um fecharia o outro.
      const chaveBloco = `${secao.titulo}/${bloco.titulo}`;
      const fechado = recolhidos.has(chaveBloco);
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
            if (n.has(chaveBloco)) n.delete(chaveBloco); else n.add(chaveBloco);
            return n;
          })}>
          <span className="grupo-seta" aria-hidden="true" />
          {bloco.titulo}
          <span className="grupo-conta">{bloco.itens.length}</span>
        </button>
      )}
      <div className={`revelar${fechado ? '' : ' aberto'}`}>
       <div>
        {/* Com um editor aberto a chave congela: a remontagem que faz a
            animação tocar apagaria o rascunho de quem está digitando se uma
            atualização de fundo mudasse a lista no meio da edição. */}
        <div className="admin-file-list lista-anima"
          key={editando === null ? assinatura : 'editando'}>
        {bloco.itens.map(e => (
          editando === e.id ? (
            <EditorEntrega key={e.id} inicial={e} pessoas={pessoas}
              marcadores={marcadores} submarcadores={submarcadores}
              salvando={salvando}
              onSalvar={dados => { void onSalvarEntrega(dados, e.id); setEditando(null); }}
              onCancelar={() => setEditando(null)} />
          ) : (() => {
            const aberta = abertas.includes(e.id);
            const daEntrega = tarefas.filter(x => x.entrega_id === e.id);
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
                    <span className="marco-bolha" title={`Etapa: ${e.status}`}
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

                  {marcaDaLinha(e) && (
                    <span className="entrega-marca" title="Marcador e submarcador">
                      {marcaDaLinha(e)}
                    </span>
                  )}

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
                    {/* A contagem abre a entrega, que é onde as tarefas moram.
                        Antes ela abria um balão só de leitura: duas maneiras de
                        ver a mesma lista, e só uma delas deixava mexer. */}
                    <button type="button" className="entrega-conta" aria-expanded={aberta}
                      title={daEntrega.length === 0
                        ? 'Nenhuma tarefa nesta entrega'
                        : `${daEntrega.length} tarefa(s) nesta entrega`}
                      onClick={ev => {
                        ev.stopPropagation();
                        // A contagem é sobre tarefas: abrir a entrega por ela e
                        // ainda ter de abrir a seção seria pedir dois cliques
                        // para uma pergunta só.
                        if (!aberta) abrirTarefas(e.id);
                        alternar(e.id);
                      }}>
                      <IconClipboard size={12} />
                      {daEntrega.length}
                    </button>
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
                    <>
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--gray3)',
                      display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ChipEntrega status={e.status} />
                          {/* As reuniões em que esta entrega foi tratada. O
                              mesmo vínculo do outro lado, criado daqui. Ligar e
                              desligar é edição: quem só lê vê os chips abaixo,
                              sem o gatilho. */}
                          {!somenteLeitura && (
                          <SeletorVinculo
                            rotulo="Reuniões que trataram desta entrega"
                            acao="Vincular reunião"
                            vazio="O projeto ainda não tem reuniões."
                            opcoes={reunioes.map(r => ({
                              id: r.id, nome: r.assunto, nota: fmtData(r.data),
                            }))}
                            escolhidos={reunioes.filter(r => (r.entregas ?? []).includes(e.id)).map(r => r.id)}
                            onAlternar={(reuniaoId, ligar) => onVincular(reuniaoId, 'entrega', e.id, ligar)}
                          />
                          )}
                        </span>

                        {reunioes.some(r => (r.entregas ?? []).includes(e.id)) && (
                          <div className="vinculo-chips" style={{ marginTop: 8 }}>
                            {reunioes.filter(r => (r.entregas ?? []).includes(e.id)).map(r => (
                              <ChipVinculo key={r.id}
                                nome={r.assunto}
                                titulo="Ver na aba de reuniões"
                                onAbrir={() => onAbrirReuniao(r.id)}
                                onSoltar={somenteLeitura
                                  ? undefined
                                  : () => onVincular(r.id, 'entrega', e.id, false)}
                              />
                            ))}
                          </div>
                        )}

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

                    {/* As tarefas desta entrega, no pé do chip e em toda a
                        largura dele. Encaixadas ao lado do resto elas ficavam
                        espremidas numa coluna, e uma lista de linhas inteiras
                        não se lê num canto. A pergunta "o que falta aqui"
                        nasce com o projeto aberto, e sair para a tela de
                        Tarefas obrigaria a refazer o caminho de volta: criar,
                        abrir e excluir acontecem daqui. */}
                    <div className="entrega-tarefas-bloco">
                      <div className="entrega-tarefas-cabeca">
                        {/* A seção nasce fechada: a entrega aberta responde
                            primeiro sobre ela mesma, e o quadro de tarefas é o
                            segundo passo de quem quiser descer. Aberta, ela
                            fica assim enquanto o painel estiver aberto. */}
                        <button type="button" aria-expanded={tarefasAbertas.includes(e.id)}
                          className={`grupo-cabeca${tarefasAbertas.includes(e.id) ? ' aberto' : ''}`}
                          onClick={() => alternarTarefas(e.id)}>
                          <span className="grupo-seta" aria-hidden="true" />
                          Tarefas
                          <span className="grupo-conta">{daEntrega.length}</span>
                        </button>
                        {onVerTarefasDaEntrega && (
                          <button type="button" className="entrega-tarefas-link"
                            onClick={() => onVerTarefasDaEntrega(e.id)}>
                            Abrir em Tarefas
                            <IconArrowRight size={12} />
                          </button>
                        )}
                      </div>

                      <div className={`revelar${tarefasAbertas.includes(e.id) ? ' aberto' : ''}`}>
                        <div>
                          <KanbanDaEntrega
                            tarefas={daEntrega}
                            etapas={etapasTarefa}
                            podeEditar={!somenteLeitura && podeEditarTarefa}
                            onAbrir={onAbrirTarefa}
                            onCriar={status => onCriarTarefa(e.id, status)}
                            onExcluir={onExcluirTarefa}
                            onMover={onMoverTarefa}
                            onFixarRecolhida={onFixarRecolhida} />
                        </div>
                      </div>
                    </div>
                    </>
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
      });

      // Sem seção, os blocos saem soltos, exatamente como antes. Com seção, eles
      // entram recuados sob o cabeçalho do marcador, que recolhe o conjunto.
      return secao.titulo ? (
        <div key={secao.titulo} className="grupo-arvore" style={{ marginBottom: 14 }}>
          <button type="button" className={`grupo-cabeca secao-cabeca${secaoFechada ? '' : ' aberto'}`}
            aria-expanded={!secaoFechada}
            onClick={() => setRecolhidos(r => {
              const n = new Set(r);
              if (n.has(chaveSecao)) n.delete(chaveSecao); else n.add(chaveSecao);
              return n;
            })}>
            <span className="grupo-seta" aria-hidden="true" />
            {secao.titulo}
            <span className="grupo-conta">
              {secao.blocos.reduce((n, b) => n + b.itens.length, 0)}
            </span>
          </button>
          <div className={`revelar${secaoFechada ? '' : ' aberto'}`}>
            <div className="secao-dentro">{blocosDaSecao}</div>
          </div>
        </div>
      ) : <Fragment key="sem-secao">{blocosDaSecao}</Fragment>;
      })}

      <div className="admin-file-list">
        {pendentes.map((e, i) => (
          editandoPendente === i ? (
            <EditorEntrega key={`pend-${i}`} inicial={e} pessoas={pessoas}
              marcadores={marcadores} submarcadores={submarcadores}
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
/** O agrupamento das entregas: o grupo maior e, dentro dele, o menor. Um
 *  dropdown só, com duas listas - a hierarquia é uma decisão inteira, e partir
 *  em dois botões faria escolher metade dela de cada vez.
 *
 *  Sem grupo maior não há dentro do quê: a segunda lista fica apagada. E a
 *  dimensão já usada no maior sai da segunda - repartir por marcador dentro de
 *  marcador não divide nada. */
function SeletorAgrupamento({ maior, menor, onMudar }: {
  maior: Dimensao;
  menor: Dimensao;
  onMudar: (maior: Dimensao, menor: Dimensao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const nome = (d: Dimensao) => DIMENSOES.find(x => x.valor === d)?.label ?? '';
  const resumo = maior === 'nenhum' ? 'sem agrupamento'
    : menor === 'nenhum' ? nome(maior) : `${nome(maior)} › ${nome(menor)}`;

  function abrir() {
    // Duas listas mais os dois rótulos: a altura conta as linhas das duas.
    setPos(ancorar(triggerRef.current!, DIMENSOES.length * 2 + 2, 230));
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  const linha = (d: { valor: Dimensao; label: string }, atual: Dimensao, escolher: () => void,
    desabilitada = false) => (
    <button key={d.valor} type="button" disabled={desabilitada}
      className={`agrupar-opcao${d.valor === atual && !desabilitada ? ' marcada' : ''}`}
      onClick={escolher}>
      <span>{d.label}</span>
      {d.valor === atual && !desabilitada && (
        <span className="agrupar-marca"><IconCheck size={12} /></span>
      )}
    </button>
  );

  return (
    <>
      <button ref={triggerRef} type="button" className="secao-add" onClick={abrir}
        title={`Agrupar entregas: ${resumo}`} aria-label={`Agrupar entregas. Atual: ${resumo}`}>
        <IconAgrupar size={13} />
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown agrupar-lista"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10050 }}>
          <p className="agrupar-titulo">Grupo maior</p>
          {DIMENSOES.map(d => linha(d, maior, () => {
            // Trocar o maior derruba o menor quando os dois virariam o mesmo, e
            // desligar o maior desliga os dois.
            onMudar(d.valor, d.valor === 'nenhum' || d.valor === menor ? 'nenhum' : menor);
          }))}
          <p className="agrupar-titulo">Dentro dele</p>
          {DIMENSOES.map(d => linha(
            d, menor,
            () => onMudar(maior, d.valor),
            maior === 'nenhum' || (d.valor !== 'nenhum' && d.valor === maior),
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

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
        title={`Etapa: ${status}`} aria-label={`Etapa da entrega: ${status}`}
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
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  return createPortal(
    // Mesmo molde da confirmação de exclusão: caixa centrada, título,
    // descrição e as duas ações no rodapé.
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }}
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
/** O texto do Fireflies vem em markdown, e o que ele usa é o negrito: sem
 *  tratar, a nota aparece com `**` cru no meio da frase. Não é um interpretador
 *  de markdown - é o mínimo que o conteúdo pede, e o resto passa como texto. */
function ComNegrito({ texto }: { texto: string }) {
  const partes = texto.split('**');
  return (
    <>
      {partes.map((p, i) => (
        // Índice ímpar é o que estava entre os dois asteriscos.
        i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>
      ))}
    </>
  );
}

/** O detalhe que o Fireflies mandou junto com a reunião. */
interface DadosReuniao {
  duracao?: number | null;
  participantes?: string[];
  gist?: string | null;
  curto?: string | null;
  topicos?: string | null;
  notas?: string | null;
  palavras?: string[];
  acoes?: string | null;
  organizador?: string | null;
  reuniao_url?: string | null;
}

/** JSON malformado - de uma gravação antiga, por exemplo - não pode derrubar a
 *  aba inteira: vira ausência de detalhe. */
function lerDados(bruto: string | null | undefined): DadosReuniao | null {
  if (!bruto) return null;
  try {
    const d = JSON.parse(bruto);
    return d && typeof d === 'object' ? d as DadosReuniao : null;
  } catch { return null; }
}

/** Um bloco da conversa, com o momento em que ele começa. */
interface TopicoReuniao {
  titulo: string;
  /** Segundos desde o início da gravação. */
  inicio: number;
  rotulo: string;
  linhas: string[];
}

const emSegundos = (mmss: string): number => {
  const p = mmss.split(':').map(n => Number(n));
  if (p.some(n => !Number.isFinite(n))) return 0;
  // "07:21" e "1:02:11" - o Fireflies usa os dois conforme a duração.
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
};

/** Transforma o `shorthand_bullet` do Fireflies na linha do tempo.
 *
 *  O formato de lá é `EMOJI **Título** (01:48 - 02:00)` seguido das linhas de
 *  descrição. O emoji é descartado: dentro do produto ele não entra, e aqui
 *  seria decoração vinda de fora. */
function lerTopicos(texto: string | null | undefined): TopicoReuniao[] {
  if (!texto) return [];
  const topicos: TopicoReuniao[] = [];
  for (const linha of texto.split('\n')) {
    const cabeca = linha.match(/\*\*(.+?)\*\*\s*\((\d{1,2}:\d{2}(?::\d{2})?)(?:\s*-\s*(\d{1,2}:\d{2}(?::\d{2})?))?\)/);
    if (cabeca) {
      topicos.push({
        titulo: cabeca[1].trim(),
        inicio: emSegundos(cabeca[2]),
        rotulo: cabeca[2],
        linhas: [],
      });
      continue;
    }
    const corpo = linha.trim();
    if (corpo && topicos.length > 0) topicos[topicos.length - 1].linhas.push(corpo);
  }
  return topicos;
}

/** Os itens de ação, que vêm agrupados por pessoa em `**Nome**`. */
interface AcaoReuniao { quem: string; itens: { texto: string; rotulo: string | null; inicio: number }[] }

function lerAcoes(texto: string | null | undefined): AcaoReuniao[] {
  if (!texto) return [];
  const grupos: AcaoReuniao[] = [];
  for (const linha of texto.split('\n')) {
    const nome = linha.trim().match(/^\*\*(.+?)\*\*$/);
    if (nome) { grupos.push({ quem: nome[1].trim(), itens: [] }); continue; }
    const corpo = linha.trim();
    if (!corpo || grupos.length === 0) continue;
    const quando = corpo.match(/\((\d{1,2}:\d{2}(?::\d{2})?)\)\s*$/);
    grupos[grupos.length - 1].itens.push({
      texto: quando ? corpo.slice(0, quando.index).trim() : corpo,
      rotulo: quando ? quando[1] : null,
      inicio: quando ? emSegundos(quando[1]) : 0,
    });
  }
  return grupos.filter(g => g.itens.length > 0);
}

/** O que a reunião carrega, aberto: resumo, assuntos com horário, itens de
 *  ação por pessoa, palavras-chave e quem participou.
 *
 *  Os assuntos e as ações são clicáveis quando há gravação: cada um leva ao
 *  minuto em que aquilo foi dito. */
function CorpoReuniao({ reg, pessoas, entregas, somenteLeitura, onAssistir, onVincular, onAbrirEntrega }: {
  reg: Reuniao;
  pessoas: Pessoa[];
  /** As entregas do projeto, para escolher onde a reunião foi tratada. */
  entregas: Entrega[];
  /** Quem só lê continua abrindo a reunião, os tópicos e a gravação. O que
   *  some é o gatilho de vincular e o de soltar o vínculo. */
  somenteLeitura: boolean;
  onAssistir: () => void;
  onVincular: (tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onAbrirEntrega: (entregaId: number) => void;
}) {
  const dados = lerDados(reg.dados);
  const topicos = lerTopicos(dados?.topicos);
  const acoes = lerAcoes(dados?.acoes);
  const daCasa = reg.participantes
    .map(id => pessoas.find(x => x.id === id))
    .filter((p): p is Pessoa => !!p);

  return (
    <div className="reuniao-corpo">
      <div className="reuniao-acoes">
        {reg.fireflies_id && (
          <button type="button" className="modal-acao-primaria" onClick={onAssistir}>
            <IconPlay size={13} /> Assistir a gravação
          </button>
        )}
        {dados?.duracao ? <span className="reuniao-duracao">{dados.duracao} min</span> : null}
        <span style={{ marginLeft: 'auto' }}>
          {!somenteLeitura && (
          <SeletorVinculo
            rotulo="Entregas tratadas nesta reunião"
            acao="Vincular entrega"
            vazio="O projeto ainda não tem entregas."
            opcoes={entregas.map(e => ({ id: e.id, nome: e.titulo, nota: e.status }))}
            escolhidos={reg.entregas ?? []}
            onAlternar={(id, ligar) => onVincular('entrega', id, ligar)}
          />
          )}
        </span>
      </div>

      {(reg.entregas?.length ?? 0) > 0 && (
        <div className="vinculo-chips">
          {reg.entregas!.map(id => {
            const e = entregas.find(x => x.id === id);
            return (
              <ChipVinculo key={id}
                nome={e?.titulo ?? 'Entrega removida'}
                titulo="Ver a entrega"
                onAbrir={() => onAbrirEntrega(id)}
                onSoltar={somenteLeitura ? undefined : () => onVincular('entrega', id, false)}
              />
            );
          })}
        </div>
      )}

      <p className="reuniao-notas"><ComNegrito texto={reg.notas} /></p>

      {topicos.length > 0 && (
        <div className="reuniao-bloco">
          <p className="reuniao-rotulo">Assuntos</p>
          <div className="reuniao-topicos">
            {topicos.map((t, i) => (
              <div key={`${t.inicio}-${i}`} className="reuniao-topico">
                <span className="reuniao-tempo">{t.rotulo}</span>
                <span>
                  <strong>{t.titulo}</strong>
                  {t.linhas.length > 0 && <span> <ComNegrito texto={t.linhas.join(' ')} /></span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {acoes.length > 0 && (
        <div className="reuniao-bloco">
          <p className="reuniao-rotulo">Combinados</p>
          {acoes.map(g => (
            <div key={g.quem} className="reuniao-acao-grupo">
              <p className="reuniao-quem">{g.quem}</p>
              <ul>
                {g.itens.map((it, i) => (
                  <li key={i}>
                    <ComNegrito texto={it.texto} />
                    {it.rotulo && <span className="reuniao-tempo">{it.rotulo}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {(dados?.palavras?.length ?? 0) > 0 && (
        <div className="reuniao-palavras">
          {dados!.palavras!.map(p => <span key={p} className="reuniao-palavra">{p}</span>)}
        </div>
      )}

      {(dados?.participantes?.length ?? 0) > 0 && (
        <p className="reuniao-gente">{dados!.participantes!.join(' · ')}</p>
      )}

      {daCasa.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 7 }}>
          {daCasa.map(p => (
            <span key={p.id} title={p.nome}>
              <Avatar nome={p.nome} foto={p.foto_url} size={20} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** A gravação da reunião, com a linha do tempo ao lado.
 *
 *  O endereço do vídeo é buscado quando o modal abre, e não guardado: a URL da
 *  CDN do Fireflies vem assinada e expira em poucos dias. Clicar num tópico
 *  move o vídeo para aquele instante - é o mesmo `currentTime` que a barra do
 *  próprio player usa. */
function GravacaoReuniao({ reuniao, topicos, onBuscar, onFechar }: {
  reuniao: Reuniao;
  topicos: TopicoReuniao[];
  onBuscar: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onFechar: () => void;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);
  const player = useRef<HTMLVideoElement>(null);
  const [midia, setMidia] = useState<{ video: string | null; audio: string | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(0);

  useEffect(() => {
    let vivo = true;
    onBuscar(reuniao.fireflies_id ?? '')
      .then(d => {
        if (!vivo) return;
        if (d?.error) setErro(d.error);
        else setMidia({ video: d.video ?? null, audio: d.audio ?? null });
      })
      .catch(() => { if (vivo) setErro('Não foi possível buscar a gravação.'); });
    return () => { vivo = false; };
  }, [reuniao.fireflies_id]);

  const irPara = (segundos: number) => {
    const el = player.current;
    if (!el) return;
    el.currentTime = segundos;
    void el.play().catch(() => { /* o navegador pode exigir gesto; a barra move igual */ });
  };

  // O tópico em curso é o último que já começou.
  const emCurso = topicos.reduce((atual, t, i) => (t.inicio <= agora ? i : atual), -1);

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10002 }} {...fundo}>
      <div className="gravacao-modal" onClick={e => e.stopPropagation()}>
        {/* Título, data e atalho na mesma linha: o vídeo é o conteúdo, e o
            cabeçalho não pode comer altura de tela por causa de duas linhas. */}
        <div className="gravacao-topo">
          <p className="gravacao-titulo">
            <span className="gravacao-nome" title={reuniao.assunto}>{reuniao.assunto}</span>
            <span className="gravacao-meta">
              {fmtData(reuniao.data)}
              {reuniao.link ? ' · ' : ''}
              {reuniao.link && (
                <a href={reuniao.link} target="_blank" rel="noopener noreferrer">
                  ver no Fireflies
                </a>
              )}
            </span>
          </p>
          <button type="button" className="admin-modal-close" onClick={fechar}
            aria-label="Fechar a gravação">
            <IconX size={16} />
          </button>
        </div>

        <div className="gravacao-corpo">
          {erro ? (
            <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
          ) : !midia ? (
            <div className="dux-spinner-row" style={{ padding: '48px' }}>
              <span className="dux-spinner" />
            </div>
          ) : midia.video ? (
            <video ref={player} className="gravacao-video" src={midia.video} controls
              onTimeUpdate={e => setAgora((e.target as HTMLVideoElement).currentTime)} />
          ) : (
            <div className="gravacao-so-audio">
              <p>Esta reunião só tem áudio.</p>
              {/* O `video` toca áudio também; assim a linha do tempo continua
                  valendo, com o mesmo `currentTime`. */}
              <video ref={player} className="gravacao-audio" src={midia.audio ?? undefined} controls
                onTimeUpdate={e => setAgora((e.target as HTMLVideoElement).currentTime)} />
            </div>
          )}

          {topicos.length > 0 && (
            <div className="gravacao-linha-tempo">
              <p className="gravacao-secao">Assuntos</p>
              {topicos.map((t, i) => (
                <button key={`${t.inicio}-${i}`} type="button"
                  className={`gravacao-topico${i === emCurso ? ' agora' : ''}`}
                  onClick={() => irPara(t.inicio)}>
                  <span className="gravacao-tempo">{t.rotulo}</span>
                  <span className="gravacao-topico-texto">
                    <strong>{t.titulo}</strong>
                    {t.linhas.length > 0 && <span><ComNegrito texto={t.linhas.join(' ')} /></span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Uma reunião da conta do Fireflies, como ela chega da rota. */
interface ReuniaoFF {
  id: string;
  titulo: string;
  data: string | null;
  duracao: number | null;
  participantes: string[];
  url: string | null;
}

/** Busca no Fireflies e anexa ao projeto.
 *
 *  A lista vem das reuniões mais recentes da conta e é filtrada por título ou
 *  participante. A busca é do servidor para cá porque a chave da API não sai do
 *  cofre - a tela nunca fala com o Fireflies direto. */
function BuscaFireflies({ jaAnexadas, salvando, onBuscar, onAnexar, onFechar }: {
  /** Ids do Fireflies que este projeto já tem: essas saem da lista. */
  jaAnexadas: string[];
  salvando: boolean;
  onBuscar: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onAnexar: (ids: string[]) => Promise<void>;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const [reunioes, setReunioes] = useState<ReuniaoFF[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  /** O que vai ser anexado quando a pessoa confirmar. */
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  /** Anexo em curso. O botão desliga enquanto isso: puxar dez reuniões leva
   *  segundos, e sem o aviso a pessoa clica de novo - foi assim que nasceram as
   *  cópias. */
  const [anexando, setAnexando] = useState(false);

  // A consulta espera a digitação parar: cada tecla seria uma ida ao Fireflies.
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      setCarregando(true);
      onBuscar(busca.trim())
        .then(d => {
          if (!vivo) return;
          if (d?.error) { setErro(d.error); setReunioes([]); }
          else { setErro(null); setReunioes(d.reunioes ?? []); }
          setCarregando(false);
        })
        .catch(() => { if (vivo) { setErro('Não foi possível falar com o Fireflies.'); setCarregando(false); } });
    }, busca ? 350 : 0);
    return () => { vivo = false; clearTimeout(t); };
  }, [busca]);

  /** O que já está no projeto sai da lista: oferecer de novo o que a pessoa
   *  acabou de anexar só dá trabalho de reconhecer. */
  const disponiveis = reunioes.filter(m => !jaAnexadas.includes(m.id));

  const alternar = (id: string) =>
    setEscolhidas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id]));

  async function anexar() {
    if (anexando) return;
    setAnexando(true);
    try {
      await onAnexar(escolhidas);
      setEscolhidas([]);
    } finally {
      setAnexando(false);
    }
  }

  return (
    <div className="ff-busca">
      <div className="secao-busca" style={{ marginBottom: 12 }}>
        <span className="secao-busca-campo">
          <IconSearch size={13} />
          <input autoFocus value={busca} aria-label="Buscar reunião no Fireflies"
            placeholder="Buscar por título ou participante"
            onChange={e => setBusca(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onFechar(); }} />
          {busca && (
            <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
              <IconX size={12} />
            </button>
          )}
        </span>
        <button type="button" className="modal-acao" onClick={onFechar}>Fechar</button>
      </div>

      {erro ? (
        <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
      ) : carregando ? (
        <div className="dux-spinner-row" style={{ padding: '14px' }}>
          <span className="dux-spinner sm" />
        </div>
      ) : disponiveis.length === 0 ? (
        <p className="ff-vazio">
          {busca.trim()
            ? `Nenhuma reunião com "${busca.trim()}".`
            : jaAnexadas.length > 0
              ? 'Todas as reuniões da conta já estão anexadas.'
              : 'Nenhuma reunião na conta.'}
        </p>
      ) : (
        <>
          {/* A `key` é a assinatura do resultado: quando ele muda, os itens
              remontam e a entrada toca. */}
          <div className="admin-file-list lista-anima"
            key={disponiveis.map(m => m.id).join(',')}>
            {disponiveis.map(m => {
              const marcada = escolhidas.includes(m.id);
              return (
                <label key={m.id} className={`admin-file-item ff-item${marcada ? ' marcada' : ''}`}>
                  <input type="checkbox" className="form-checkbox" checked={marcada}
                    onChange={() => alternar(m.id)} />
                  <div className="ff-item-texto">
                    <p className="ff-item-titulo">{m.titulo}</p>
                    <p className="ff-item-meta">
                      {fmtData(m.data ? m.data.slice(0, 10) : null)}
                      {m.duracao ? ` · ${m.duracao} min` : ''}
                      {m.participantes.length ? ` · ${m.participantes.slice(0, 3).join(', ')}` : ''}
                      {m.participantes.length > 3 ? ` +${m.participantes.length - 3}` : ''}
                    </p>
                  </div>
                  {m.url && (
                    <a className="admin-file-download" href={m.url} target="_blank" rel="noopener noreferrer"
                      title="Abrir a transcrição no Fireflies"
                      onClick={e => { e.stopPropagation(); e.preventDefault(); window.open(m.url!, '_blank', 'noopener'); }}>
                      <IconExternal size={13} />
                    </a>
                  )}
                </label>
              );
            })}
          </div>

          {/* A barra só aparece com algo escolhido: sem seleção ela seria um
              botão apagado ocupando espaço. */}
          {escolhidas.length > 0 && (
            <div className="ff-barra surge">
              <span>{escolhidas.length} selecionada{escolhidas.length > 1 ? 's' : ''}</span>
              <button type="button" className="modal-acao" disabled={anexando}
                onClick={() => setEscolhidas([])}>
                Limpar
              </button>
              <button type="button" className="modal-acao-primaria" disabled={anexando || salvando}
                onClick={() => void anexar()}>
                {anexando
                  ? <><span className="dux-spinner sm na-cor" /> Anexando…</>
                  : `Anexar ${escolhidas.length}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SecaoReunioes({ registros, pessoas, equipe, entregas, focada, salvando, somenteLeitura,
  onRegistrar, onVincular, onAbrirEntrega, onBuscarFireflies, onBuscarGravacao,
  onAnexarFireflies, onExcluir }: {
  registros: Reuniao[];
  pessoas: Pessoa[];
  /** Quem está no projeto aparece primeiro na escolha de participantes. */
  equipe: Membro[];
  salvando: boolean;
  somenteLeitura: boolean;
  onRegistrar: (r: { data: string; assunto: string; notas: string; participantes: string[] }) => Promise<void>;
  /** As entregas do projeto, para vincular a reunião a elas. */
  entregas: Entrega[];
  onVincular: (reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onAbrirEntrega: (entregaId: number) => void;
  /** Reunião que a tela deve abrir e destacar, vinda do chip de uma entrega. */
  focada?: number | null;
  onBuscarFireflies: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onBuscarGravacao: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onAnexarFireflies: (firefliesIds: string[]) => Promise<void>;
  onExcluir: (r: Reuniao) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [buscandoFF, setBuscandoFF] = useState(false);
  /** Os dois painéis desta seção nascem montados na primeira abertura e ficam:
   *  é o que faz fechar ser suave, e de quebra a busca do Fireflies guarda o
   *  que já tinha achado. */
  const [jaAbriuForm, setJaAbriuForm] = useState(false);
  const [jaAbriuFF, setJaAbriuFF] = useState(false);
  /** Reuniões com o corpo aberto. Nasce vazio: o resumo de uma reunião do
   *  Fireflies tem parágrafos, e três delas seguidas enterravam a lista. */
  const [abertas, setAbertas] = useState<number[]>([]);
  /** A reunião esperando confirmação. Excluir é definitivo, e a nota some com
   *  ela - o link para a transcrição inclusive. */
  const [excluindo, setExcluindo] = useState<Reuniao | null>(null);
  /** A reunião com a gravação aberta. */
  const [assistindo, setAssistindo] = useState<Reuniao | null>(null);
  /** A que acabou de ser aberta pelo chip de uma entrega. */
  const [realcada, setRealcada] = useState<number | null>(null);

  // Vindo do chip de uma entrega: abre a reunião pedida e pisca.
  useEffect(() => {
    if (focada == null) return;
    setJaAbertas(j => (j.includes(focada) ? j : [...j, focada]));
    setAbertas(a => (a.includes(focada) ? a : [...a, focada]));
    setRealcada(focada);
    const t = setTimeout(() => setRealcada(r => (r === focada ? null : r)), 2200);
    return () => clearTimeout(t);
  }, [focada]);
  /** As que já foram abertas alguma vez: o conteúdo delas fica montado, e é
   *  isso que faz o recolher ser suave. */
  const [jaAbertas, setJaAbertas] = useState<number[]>([]);
  const alternarReuniao = (id: number) => {
    setJaAbertas(j => (j.includes(id) ? j : [...j, id]));
    setAbertas(a => (a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  };
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Puxar do Fireflies e registrar à mão são o mesmo gesto - guardar
                o que foi conversado -, então ficam lado a lado. */}
            <button type="button" className="secao-add"
              onClick={() => { setJaAbriuFF(true); setBuscandoFF(v => !v); setAbrindo(false); }}
              title="Buscar reunião no Fireflies" aria-label="Buscar reunião no Fireflies">
              <img src="/marcas/fireflies.webp" alt="" width={14} height={14}
                style={{ display: 'block', objectFit: 'contain' }} />
            </button>
            <button type="button" className="secao-add"
              onClick={() => { setJaAbriuForm(true); setAbrindo(a => !a); setBuscandoFF(false); }}
              title="Registrar reunião" aria-label="Registrar reunião">
              <IconPlus size={14} />
            </button>
          </span>
        )}
      </div>

      {jaAbriuFF && (
        <div className={`revelar${buscandoFF ? ' aberto' : ''}`}>
          <div>
            <BuscaFireflies
              jaAnexadas={registros.map(r => r.fireflies_id).filter((x): x is string => !!x)}
              salvando={salvando}
              onBuscar={onBuscarFireflies}
              onAnexar={async ids => { await onAnexarFireflies(ids); }}
              onFechar={() => setBuscandoFF(false)}
            />
          </div>
        </div>
      )}

      {/* Montado na primeira abertura e mantido, como manda o `.revelar`: com
          o formulário nascendo e morrendo, fechar era um corte seco. */}
      {jaAbriuForm && (
        <div className={`revelar${abrindo ? ' aberto' : ''}`}>
          <div>
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
          </div>
        </div>
      )}

      {assistindo && (
        <GravacaoReuniao
          reuniao={assistindo}
          topicos={lerTopicos(lerDados(assistindo.dados)?.topicos)}
          onBuscar={onBuscarGravacao}
          onFechar={() => setAssistindo(null)}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao
          titulo={excluindo.assunto}
          oQue="reunião"
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => { onExcluir(excluindo); setExcluindo(null); }}
        />
      )}

      {registros.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0 }}>Nenhuma reunião registrada.</p>
      ) : (
        <div className="admin-file-list">
          {registros.map(reg => {
            const aberta = abertas.includes(reg.id);
            return (
            <div key={reg.id}
              className={`admin-file-item${realcada === reg.id ? ' realcada' : ''}`}
              ref={el => { if (realcada === reg.id && el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="reuniao-cabeca" aria-expanded={aberta}
                  onClick={() => alternarReuniao(reg.id)}>
                  {reg.fireflies_id && (
                    <img src="/marcas/fireflies.webp" alt="" width={13} height={13}
                      title="Puxada do Fireflies"
                      style={{ display: 'block', objectFit: 'contain', flexShrink: 0 }} />
                  )}
                  <strong>{reg.assunto}</strong>
                  <span>
                    {fmtData(reg.data)}
                    {reg.criado_por_nome ? ` · ${reg.criado_por_nome}` : ''}
                  </span>
                  <span className={`entrega-seta${aberta ? ' aberta' : ''}`}>
                    <IconChevronRight size={12} />
                  </span>
                </button>
                {reg.link && (
                  <a href={reg.link} target="_blank" rel="noopener noreferrer"
                    className="admin-file-download" title="Abrir a transcrição no Fireflies">
                    <IconExternal size={13} />
                  </a>
                )}
                {!somenteLeitura && (
                  <button type="button" className="file-delete-btn" title="Excluir reunião"
                    aria-label={`Excluir reunião ${reg.assunto}`} onClick={() => setExcluindo(reg)}>
                    <IconX size={13} />
                  </button>
                )}
              </div>

              <div className={`revelar${aberta ? ' aberto' : ''}`}>
                <div>
                  {/* Montado na primeira abertura e mantido: é o que faz o
                      recolher ser suave. Uma aba com dez reuniões não constrói
                      dez destes de saída, só os que forem abertos. */}
                  {jaAbertas.includes(reg.id) && (
                    <CorpoReuniao reg={reg} pessoas={pessoas} entregas={entregas}
                      somenteLeitura={somenteLeitura}
                      onAssistir={() => setAssistindo(reg)}
                      onVincular={(tipo, alvo, ligar) => onVincular(reg.id, tipo, alvo, ligar)}
                      onAbrirEntrega={onAbrirEntrega} />
                  )}
                </div>
              </div>
            </div>
            );
          })}
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
    setAberto(a => !a);
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
          <tr><th>Entrega</th><th>Etapa</th><th>Prazo</th><th>Tarefas</th></tr>
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
  editando, base, pessoas, clientes, salvando, onFechar, onSalvar,
  onCriarTarefaNaEntrega, onAbrirTarefa, onExcluirTarefa, onMoverTarefa,
  onFixarRecolhida, podeEditarTarefa, etapasTarefa, onBaixarAnexo, onVerAnexo, onEtiquetar,
  marcadores, submarcadores, onExcluir, somenteLeitura, onVerTarefasDaEntrega,
  onRegistrarSaude, onExcluirSaude, onRegistrarReuniao, onVincularReuniao,
  onBuscarReunioesFireflies, onBuscarGravacaoFireflies, onAnexarReuniaoFireflies,
  onExcluirReuniao,
  onPublicar, onSalvarEntrega, onExcluirEntrega, onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
}: {
  editando: Projeto | null;
  /** Com que rascunho o painel abre enquanto o projeto ainda não voltou do
   *  servidor. É o mesmo objeto que foi gravado no clique. */
  base?: Rascunho;
  pessoas: Pessoa[];
  clientes: Cliente[];
  salvando: boolean;
  /** Sai para a tela de Tarefas, estreitada numa entrega deste projeto. */
  onVerTarefasDaEntrega?: (entregaId: number) => void;
  /** Cria uma tarefa dentro da entrega, do próprio painel do projeto. */
  onCriarTarefaNaEntrega: (p: Projeto, entregaId: number, status?: string) => void;
  onAbrirTarefa: (t: Tarefa) => void;
  onExcluirTarefa: (t: Tarefa) => void;
  onMoverTarefa: (t: Tarefa, status: string) => void;
  onFixarRecolhida?: (etapaId: number) => void;
  podeEditarTarefa: boolean;
  etapasTarefa: EtapaTarefa[];
  /** `intacto` diz que ninguém mexeu no projeto desde que ele nasceu: abrir e
   *  desistir não deveria deixar "Projeto sem nome" no quadro da casa. */
  onFechar: (intacto: boolean) => void;
  onSalvar: (r: Rascunho, anexos: AnexoPendente[], removidos: number[]) => Promise<void>;
  onBaixarAnexo: (a: Arquivo) => void;
  onVerAnexo: (a: Arquivo) => void;
  onEtiquetar: (a: Arquivo, etiqueta: string) => Promise<void>;
  onRegistrarSaude: (p: Projeto, estado: string, descricao: string) => Promise<void>;
  onExcluirSaude: (r: RegistroSaude) => void;
  onRegistrarReuniao: (
    p: Projeto,
    r: { data: string; assunto: string; notas: string; participantes: string[] },
  ) => Promise<void>;
  onVincularReuniao: (reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onBuscarReunioesFireflies: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onBuscarGravacaoFireflies: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onAnexarReuniaoFireflies: (p: Projeto, firefliesIds: string[]) => Promise<void>;
  onExcluirReuniao: (r: Reuniao) => void;
  /** Categorias de entrega já usadas, para sugerir no cadastro. */
  marcadores: string[];
  submarcadores: string[];
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
  } : (base ?? { ...VAZIO, entregas: entregasDePartida() }));
  const [novos, setNovos] = useState<AnexoPendente[]>([]);
  const [removidos, setRemovidos] = useState<number[]>([]);
  const [erroAnexo, setErroAnexo] = useState('');
  const inputArquivo = useRef<HTMLInputElement>(null);

  // O que ainda falta preencher. Vive junto com o rascunho, e não num "tentar
  // salvar" que não existe mais: sem botão de gravar não há o instante em que
  // conferir tudo faria sentido. E nada disto impede a gravação - o projeto
  // existe desde o clique, e travá-lo por um campo vazio perderia o que já foi
  // escrito.
  const faltando: Record<string, string> = {};
  if (!r.nome.trim()) faltando.nome = 'Informe o nome do projeto.';
  if (!r.cliente_id) faltando.cliente_id = 'Escolha o cliente.';
  if (!r.tipo) faltando.tipo = 'Escolha o tipo do projeto.';
  if (!r.prioridade) faltando.prioridade = 'Escolha a prioridade.';
  if (!r.data_inicio) faltando.data_inicio = 'Informe a data de início.';
  if (!r.previsao_entrega) faltando.previsao_entrega = 'Informe o fim previsto.';
  if (r.equipe.length === 0) faltando.equipe = 'Adicione ao menos uma pessoa à equipe.';

  // O vermelho só aparece no campo em que a pessoa mexeu. O projeto novo abre
  // com metade dos campos em branco de propósito, e pintar todos de vermelho na
  // abertura seria acusar quem acabou de chegar. O que falta continua dito, uma
  // vez só e sem alarde, no rodapé.
  // O mesmo que falta, dito em uma linha no rodapé. Nome curto: o rodapé é
  // estreito, e "Informe a data de início" repetido sete vezes não cabe.
  const CURTO: Record<string, string> = {
    nome: 'nome', cliente_id: 'cliente', tipo: 'tipo', prioridade: 'prioridade',
    data_inicio: 'início', previsao_entrega: 'fim previsto', equipe: 'equipe',
  };
  const pendencias = Object.keys(faltando).map(k => CURTO[k]).filter(Boolean);

  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const erros: Record<string, string> = {};
  for (const [k, v] of Object.entries(faltando)) if (tocados[k]) erros[k] = v;

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => {
    setR(p => ({ ...p, [k]: v }));
    setTocados(x => (x[k as string] ? x : { ...x, [k as string]: true }));
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
  const { saindo, fechar } = useSaidaSuave(() => onFechar(intactoRef.current));
  const fundo = useFecharNoFundo(fechar);

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
  /** Entrega para onde a tela deve ir, vinda do chip de uma reunião. */
  const [entregaFocada, setEntregaFocada] = useState<number | null>(null);
  /** E o caminho inverso: a reunião que o chip da entrega quer mostrar. */
  const [reuniaoFocada, setReuniaoFocada] = useState<number | null>(null);
  const [reetiquetados, setReetiquetados] = useState<Record<number, string>>({});
  const jaAnexados = (editando?.arquivos ?? [])
    .filter(a => !removidos.includes(a.id))
    .map(a => (reetiquetados[a.id] ? { ...a, etiqueta: reetiquetados[a.id] } : a));

  /** Grava sozinho, um tempo depois da última tecla. Não existe mais botão de
   *  salvar: o projeto já está no banco desde o clique, e cada alteração é uma
   *  atualização dele.
   *
   *  Os anexos vão na mesma viagem e saem da fila quando chegam - mandar a lista
   *  inteira a cada gravação subiria o mesmo arquivo de novo a cada tecla. */
  const assinatura = JSON.stringify([r, novos.map(a => `${a.nome}:${a.tamanho}`), removidos]);
  const ultimoGravado = useRef(assinatura);
  const removidosEnviados = useRef<number[]>([]);
  const podeGravar = !somenteLeitura && !!r.nome.trim();

  async function gravar() {
    const anexos = novos;
    const fora = removidos.filter(id => !removidosEnviados.current.includes(id));
    removidosEnviados.current = [...removidosEnviados.current, ...fora];
    await onSalvar(r, anexos, fora);
    // Só os que subiram nesta viagem: quem escolheu outro arquivo enquanto ela
    // corria continua na fila.
    setNovos(p => p.filter(a => !anexos.includes(a)));
  }

  // As entregas de partida viraram linhas do projeto no instante em que ele
  // nasceu. Deixá-las também no rascunho as mostraria duas vezes: uma vinda do
  // servidor e outra ainda pendente.
  const idGravado = editando?.id ?? null;
  useEffect(() => {
    if (!idGravado) return;
    setR(x => {
      if (x.entregas.length === 0) return x;
      const limpo = { ...x, entregas: [] };
      // Tirar da lista o que já é do servidor não é alteração de ninguém: marcar
      // aqui evita uma gravação que só devolveria ao banco o que ele mandou.
      if (novos.length === 0) {
        ultimoGravado.current = JSON.stringify([limpo, [], removidos]);
      }
      return limpo;
    });
  }, [idGravado]);

  useEffect(() => {
    if (!podeGravar || assinatura === ultimoGravado.current) return;
    const t = window.setTimeout(() => { ultimoGravado.current = assinatura; void gravar(); }, 700);
    return () => window.clearTimeout(t);
  }, [assinatura, podeGravar]);

  /** Ninguém mexeu desde que o projeto nasceu. O painel usa isto para decidir se
   *  fecha deixando ou apagando o que foi criado no clique. As entregas saem da
   *  conta depois que o servidor as devolve: elas continuam lá, só não no
   *  rascunho. */
  const molde = base ? { ...base, entregas: idGravado ? [] : base.entregas } : null;
  const intacto = !!molde && novos.length === 0
    && JSON.stringify(r) === JSON.stringify(molde);
  const intactoRef = useRef(intacto);
  intactoRef.current = intacto;

  /** Fecha gravando o que ainda não foi: a pausa de 700ms pode não ter vencido,
   *  e sair de um painel sem botão de salvar não pode custar a última frase. */
  function fecharGravando() {
    if (podeGravar && assinatura !== ultimoGravado.current) {
      ultimoGravado.current = assinatura;
      void gravar();
    }
    fechar();
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
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} {...fundo}>
      <PuxadorDoPainel largura={largura} arrastando={arrastando}
        setArrastando={setArrastando} porTecla={porTecla} />
      <div className="admin-modal"
        style={{ width: `min(${largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>


        {/* `com-abas` só quando há abas: a linha que separa cabeçalho e corpo
            passa a ser a linha delas, em vez de haver uma logo abaixo da
            outra. Em projeto novo não há abas, e sem o recuo de baixo a pílula
            de situação encostava na borda. */}
        <div className={`admin-modal-header${editando ? ' com-abas' : ''}`}
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
                    autoFocus={r.nome === NOME_PADRAO}
                    onFocus={e => { if (e.target.value === NOME_PADRAO) e.target.select(); }}
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
                    // Um chip só: o estado da publicação e os dois gestos que
                    // vêm com ela - abrir para conferir, copiar para mandar.
                    // Eram três peças soltas na barra, e as três dizem respeito
                    // ao mesmo endereço. A caixa é um `span` porque botão dentro
                    // de botão não existe: quem carrega a borda é ela, e cada
                    // parte é um alvo próprio.
                    <span className={`ao-vivo-caixa${publicando ? ' publicando' : ''}`}>
                      <button type="button" className="ao-vivo"
                        disabled={publicando || somenteLeitura}
                        title="A página do cliente está no ar. Clique para tirar."
                        aria-label="Tirar a página do cliente do ar"
                        aria-pressed
                        onClick={() => void alternarPublicacao()}>
                        {publicando ? (
                          <span className="dux-spinner sm na-cor" aria-hidden="true" />
                        ) : (
                          <span className="ao-vivo-ponto" aria-hidden="true" />
                        )}
                        <span className="ao-vivo-texto" aria-hidden="true">
                          {publicando ? 'Tirando do ar' : 'Ao vivo'}
                        </span>
                        {!publicando && (
                          <span className="ao-vivo-acao" aria-hidden="true">Tirar do ar</span>
                        )}
                      </button>
                      {/* Abrir e copiar continuam valendo para quem só lê: são
                          leitura do que já está publicado. */}
                      {linkPublico && !publicando && (
                        <>
                          <span className="ao-vivo-fio" aria-hidden="true" />
                          <a className="ao-vivo-icone" href={linkPublico}
                            target="_blank" rel="noopener noreferrer"
                            title="Abrir a página do cliente numa aba nova"
                            aria-label="Abrir a página do cliente numa aba nova">
                            <IconExternal size={13} />
                          </a>
                          <button type="button" className="ao-vivo-icone"
                            title={copiadoPublico ? 'Link copiado' : 'Copiar o link do cliente'}
                            aria-label="Copiar o link de acompanhamento do cliente"
                            onClick={() => void copiar(linkPublico, setCopiadoPublico,
                              'Copie o link de acompanhamento:')}>
                            {copiadoPublico ? <IconCheck size={13} /> : <IconLink size={13} />}
                          </button>
                        </>
                      )}
                    </span>
                  ) : (
                    // Publicando, o botão deixa de ser um ícone e diz o que está
                    // acontecendo: pôr uma página no ar leva alguns segundos, e
                    // um ícone apagado nesse tempo parece travamento.
                    <button type="button"
                      className={`secao-add${publicando ? ' publicando' : ''}`}
                      style={publicando ? undefined : { width: 30, height: 30 }}
                      disabled={publicando || somenteLeitura}
                      title="Publicar uma página de acompanhamento para o cliente"
                      aria-label="Publicar a página do cliente"
                      onClick={() => void alternarPublicacao()}>
                      {publicando ? (
                        <>
                          <span className="dux-spinner sm na-cor" aria-hidden="true" />
                          <span aria-hidden="true">Publicando</span>
                        </>
                      ) : <IconGlobo size={15} />}
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
              <button className="admin-modal-close" aria-label="Fechar" onClick={fecharGravando}><IconX size={16} /></button>
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
        {/* O corpo não é mais um `fieldset` travado inteiro. Ele desligava tudo
            o que estivesse dentro, inclusive o que é leitura: quem só podia ver
            não conseguia abrir um chip de entrega, buscar, agrupar, ordenar nem
            trocar de visão. Ver um projeto é navegar por ele.
            Quem trava agora são os `fieldset` de campo, logo abaixo, e cada
            seção esconde os próprios botões de editar pelo `somenteLeitura`. */}
        <div className="admin-modal-body aba-painel" key={abaModal}>

          {editando && abaModal === 'reunioes' && (
            <SecaoReunioes
              somenteLeitura={somenteLeitura}
              registros={editando.reunioes ?? []}
              pessoas={pessoas}
              equipe={editando.equipe}
              entregas={editando.entregas ?? []}
              focada={reuniaoFocada}
              onVincular={(reuniaoId, tipo, alvo, ligar) =>
                onVincularReuniao(reuniaoId, tipo, alvo, ligar)}
              // Clicar no chip volta para a aba Geral e abre a entrega: é lá
              // que a entrega mora, e o vínculo só vale se levar a ela.
              onAbrirEntrega={id => { setAbaModal('geral'); setEntregaFocada(id); }}
              salvando={salvando}
              onRegistrar={reg => onRegistrarReuniao(editando, reg)}
              onBuscarFireflies={onBuscarReunioesFireflies}
              onBuscarGravacao={onBuscarGravacaoFireflies}
              onAnexarFireflies={ids => onAnexarReuniaoFireflies(editando, ids)}
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

          {/* `fieldset` desabilitado, e não uma coleção de `disabled`
              espalhados: ele desliga todo controle de formulário que estiver
              dentro, inclusive os que forem acrescentados depois, e tira todos
              da ordem de tabulação de uma vez. */}
          <fieldset className="painel-leitura campos-travaveis" disabled={somenteLeitura}>

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
                <DatePicker compact allowPast disabled={somenteLeitura} value={r.data_inicio}
                  onChange={v => set('data_inicio', v)} error={erros.data_inicio} />
              </div>
              <div className="form-group">
                <label className="form-label">Fim previsto *</label>
                <DatePicker compact allowPast disabled={somenteLeitura} value={r.previsao_entrega}
                  onChange={v => set('previsao_entrega', v)} error={erros.previsao_entrega} />
              </div>
            </div>
          </section>

          <section>
            <SecaoEquipe titulo="Equipe *" pessoas={pessoas} valor={r.equipe}
              somenteLeitura={somenteLeitura} onChange={v => set('equipe', v)} />
            {erros.equipe && <p className="form-error" style={{ marginTop: 6 }}>{erros.equipe}</p>}
          </section>

          </fieldset>

          {/* Fora do `fieldset`: abrir uma entrega, ver a prova anexada, buscar,
              agrupar e trocar de visão é leitura, e continua valendo para quem
              só olha. O que edita, a seção esconde sozinha. */}
          <SecaoEntregas
            somenteLeitura={somenteLeitura}
            entregas={editando?.entregas ?? []}
            reunioes={editando?.reunioes ?? []}
            focada={entregaFocada}
            onVincular={onVincularReuniao}
            // O caminho de volta: do chip da entrega para a aba de reuniões.
            onAbrirReuniao={id => { setAbaModal('reunioes'); setReuniaoFocada(id); }}
            pendentes={r.entregas}
            tarefas={editando?.tarefas ?? []}
            onVerTarefasDaEntrega={onVerTarefasDaEntrega}
            // Sem projeto gravado não há entrega gravada, e a lista nem aparece.
            onCriarTarefa={(entregaId, status) =>
              editando && onCriarTarefaNaEntrega(editando, entregaId, status)}
            onAbrirTarefa={onAbrirTarefa}
            onExcluirTarefa={onExcluirTarefa}
            onMoverTarefa={onMoverTarefa}
            onFixarRecolhida={onFixarRecolhida}
            podeEditarTarefa={podeEditarTarefa}
            etapasTarefa={etapasTarefa}
            pessoas={pessoas}
            marcadores={marcadores}
            submarcadores={submarcadores}
            salvando={salvando}
            onSalvarEntrega={(dados, id) => onSalvarEntrega(editando!, dados, id)}
            onExcluirEntrega={onExcluirEntrega}
            onAlterarPendentes={v => set('entregas', v)}
            onSubirEvidencia={onSubirEvidencia}
            onBaixarEvidencia={onBaixarEvidencia}
            onVerEvidencia={onVerEvidencia}
          />

          <fieldset className="painel-leitura campos-travaveis" disabled={somenteLeitura}>

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

          </fieldset>

          </div>

        </div>

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
          {/* Sem Salvar: o projeto já está gravado. Fica o aviso do que está
              acontecendo e, em repouso, o que ainda falta preencher - dito uma
              vez, no lugar de sete campos vermelhos. */}
          {!somenteLeitura && (
            <span className="painel-estado" aria-live="polite">
              {!r.nome.trim() ? 'O projeto precisa de um nome'
                : salvando ? 'Gravando…'
                  : assinatura !== ultimoGravado.current ? 'Alterações não gravadas'
                    : pendencias.length > 0 ? `Falta preencher: ${pendencias.join(', ')}`
                      : ''}
            </span>
          )}
          <button type="button" className="delete-confirm-cancel" onClick={fecharGravando}>
            Fechar
          </button>
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
  const [form, setForm] = useState<{ editando: Projeto | null; base?: Rascunho } | null>(null);
  /** O projeto que acabou de nascer do clique em "Novo projeto", enquanto o
   *  painel dele está aberto. A promessa existe porque a primeira gravação
   *  automática pode sair antes de o servidor dizer que id ele deu. */
  const nascendo = useRef<{ promessa: Promise<string | null>; id: string | null } | null>(null);
  /** Id recém-nascido esperando aparecer na listagem para o painel trocar de
   *  "novo" para "editando" - sem remontar, que o que já foi digitado fica. */
  const [idNascido, setIdNascido] = useState<string | null>(null);
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
  /** A busca da lista. Sempre à vista, como na tela de Tarefas e na página do
   *  cliente: com a casa inteira cadastrada, procurar um projeto é o primeiro
   *  gesto de quem abre a tela. */
  const [busca, setBusca] = useState('');

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

  /** O resumo do Fireflies de cada reunião já lido, por id de reunião.
   *
   *  Ele não vem mais na listagem: é o item mais pesado que existe por lá - um
   *  terço de tudo - e só quem abre o projeto o lê. Como a listagem volta a
   *  cada reconciliação sem ele, o que já foi lido é reaplicado aqui, senão o
   *  resumo sumiria da tela na primeira ação seguinte. */
  const dadosRef = useRef(new Map<number, string>());
  const comOsResumos = useCallback((lista: Projeto[]) => (dadosRef.current.size === 0 ? lista
    : lista.map(p => ({
      ...p,
      reunioes: (p.reunioes ?? []).map(r => {
        const d = dadosRef.current.get(r.id);
        return d ? { ...r, dados: d } : r;
      }),
    }))), []);

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
      setProjetos(comOsResumos(p?.projetos ?? []));
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

  // Abriu um projeto, chegam os resumos das reuniões dele - uma vez por
  // projeto, e não a cada recarregamento da listagem.
  const projetoAberto = form?.editando?.id ?? null;
  const pedidosRef = useRef(new Set<string>());
  useEffect(() => {
    if (!projetoAberto || pedidosRef.current.has(projetoAberto)) return;
    pedidosRef.current.add(projetoAberto);
    void (async () => {
      const r = await api(`?action=reunioes_dados&projeto_id=${encodeURIComponent(projetoAberto)}`);
      const vindos: { id: number; dados: string }[] = r?.dados ?? [];
      if (vindos.length === 0) return;
      for (const d of vindos) dadosRef.current.set(Number(d.id), String(d.dados));
      setProjetos(ps => comOsResumos(ps));
    })();
  }, [api, comOsResumos, projetoAberto]);

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
    if (p?.projetos) { setProjetos(comOsResumos(p.projetos)); setClientes(p.clientes ?? []); }
  }, [api, comOsResumos]);

  // A aba fica aberta o dia inteiro, e o projeto muda pelas mãos de outras
  // pessoas. Sem isto o painel mostra o estado do momento em que foi aberto e
  // só se atualiza depois de uma ação sua. Volta a olhar a aba e ele se
  // reconcilia - sem esqueleto, que a tela já tem conteúdo.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') void recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [recarregar]);

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

  /** Põe na tela a tarefa que acabou de nascer. O servidor devolve o id e a
   *  posição; o resto é o que a pessoa acabou de escrever. */
  const inserirTarefa = useCallback((nova: Tarefa) => {
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => (p.id !== nova.projeto_id
      ? p : { ...p, tarefas: [...(p.tarefas ?? []), nova] })));
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
    // A cópia entra na lista com o id que o servidor acabou de devolver.
    if (r?.id) {
      inserirTarefa({
        ...t, id: Number(r.id), titulo: `${t.titulo} (cópia)`,
        ordem: Number(r.ordem ?? t.ordem),
        criado_em: String(r.criado_em ?? new Date().toISOString()),
        comentarios: 0, anexos: 0,
      });
    }
    toast('success', 'Tarefa duplicada');
    reconciliar();
  }, [api, inserirTarefa, reconciliar, toast]);

  /** A tarefa que acabou de nascer do "+" de uma entrega, enquanto o id não
   *  volta. A gravação automática do painel pode sair antes dele, e sem esta
   *  espera ela criaria uma segunda tarefa com o mesmo conteúdo. */
  const criandoTarefa = useRef<Promise<number | null> | null>(null);

  /** Cria a tarefa dentro da entrega e abre o painel dela na mesma batida. Ela
   *  nasce como na tela de Tarefas: título de partida, etapa de entrada e quem
   *  clicou como responsável. */
  const criarTarefaNaEntrega = useCallback((p: Projeto, entregaId: number, status?: string) => {
    const base: RascunhoTarefa = {
      projeto_id: p.id, entrega_id: String(entregaId), titulo: TITULO_PADRAO,
      descricao: '', status: status || etapaDeEntrada, prioridade: PRIORIDADE_PADRAO,
      responsavel_id: usuario?.id ?? '', prazo: '', etiquetas: [],
    };
    setRascunhoTarefa(base);
    criandoTarefa.current = api('', 'POST', {
      action: 'salvar_tarefa', ...base, entrega_id: entregaId,
    }).then(r => {
      if (r?.error) { toast('error', 'Não foi possível criar', r.error); return null; }
      const id = Number(r.id);
      inserirTarefa(tarefaGravada(base, r, pessoas));
      // O id chega depois da abertura: sem ele no rascunho, a gravação seguinte
      // criaria outra tarefa.
      setRascunhoTarefa(f => (f && !f.id ? { ...f, id } : f));
      reconciliar();
      return id;
    });
  }, [api, etapaDeEntrada, inserirTarefa, pessoas, reconciliar, toast, usuario]);

  const abrirTarefa = useCallback((t: Tarefa) => setRascunhoTarefa({
    id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id ? String(t.entrega_id) : '',
    titulo: t.titulo, descricao: t.descricao ?? '', status: t.status,
    prioridade: t.prioridade ?? PRIORIDADE_PADRAO, responsavel_id: t.responsavel_id ?? '',
    prazo: t.prazo ?? '', etiquetas: t.etiquetas,
  }), []);

  /** Grava o rascunho inteiro, como faz a tela de Tarefas. Diferente do arraste
   *  no quadro, aqui a pessoa apertou "Salvar": vale o formulário todo. */
  /** Devolve `false` quando não gravou - o painel precisa saber para não dar a
   *  alteração por gravada. */
  const salvarRascunho = useCallback(async (rascunho: RascunhoTarefa): Promise<boolean> => {
    if (!rascunho.titulo.trim()) { toast('error', 'Falta o título', 'A tarefa precisa de um título.'); return false; }
    // Rascunho sem id com uma criação em curso: espera o id e grava por cima,
    // em vez de criar uma segunda tarefa com o mesmo conteúdo.
    const jaCriada = !rascunho.id && criandoTarefa.current ? await criandoTarefa.current : null;
    const r = jaCriada ? { ...rascunho, id: jaCriada } : rascunho;
    // O painel não fecha ao gravar: quem está escrevendo continua escrevendo, e
    // a gravação acontece por baixo. A mudança já aparece na lista; se o
    // servidor recusar, ela volta ao que era.
    const antes = projetos;
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
    setSalvando(true);
    const resposta = await api('', 'POST', {
      action: 'salvar_tarefa', ...r,
      entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
    }).finally(() => setSalvando(false));
    if (resposta?.error) {
      setProjetos(antes);
      toast('error', 'Não foi possível salvar', resposta.error);
      return false;
    }
    // A regra de uma etiqueta pode ter mudado a etapa e o responsável na
    // gravação. O servidor devolve os dois, e a tela repinta com o que de fato
    // ficou - senão o card mostraria o que foi pedido, e não o que valeu.
    if (r.id) {
      const dono = pessoas.find(x => x.id === resposta?.responsavel_id);
      pintarTarefa(r.id, {
        status: String(resposta?.status ?? r.status),
        responsavel_id: resposta?.responsavel_id ?? null,
        responsavel_nome: dono?.nome ?? null,
        responsavel_foto: dono?.foto_url ?? null,
      });
    }
    // Tarefa nova: o id nasce lá, então ela só entra na lista agora - mas com o
    // que a tela já tem em mãos, e não com a listagem inteira de volta.
    if (!r.id && resposta?.id) {
      inserirTarefa(tarefaGravada(r, resposta, pessoas));
      // O painel continua aberto e passa a editar a tarefa que acabou de
      // nascer: sem o id, a gravação seguinte criaria outra.
      setRascunhoTarefa(f => (f && !f.id ? { ...f, id: Number(resposta.id) } : f));
      toast('success', 'Tarefa criada');
    }
    if (r.comentario_etiqueta) setRascunhoTarefa(f => (f ? { ...f, comentario_etiqueta: '' } : f));
    reconciliar();
    return true;
  }, [api, inserirTarefa, pessoas, pintarTarefa, projetos, reconciliar, toast]);
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

  /** Marca ou desmarca a etapa como recolhida por padrão, direto do quadro da
   *  entrega. É a mesma marca da tela de Tarefas - a etapa vale para o quadro
   *  todo, e não para esta entrega. Pinta na hora e grava: esperar a resposta
   *  para a coluna reagir faria o botão parecer travado. */
  const fixarEtapaRecolhida = useCallback(async (etapaId: number) => {
    const virar = (es: EtapaTarefa[]) => es.map(e => (e.id === etapaId
      ? { ...e, always_collapsed: e.always_collapsed ? 0 : 1 } : e));
    setEtapasTarefa(virar);
    const r = await api('', 'POST', { action: 'toggle_collapsed_tarefa_status', id: etapaId });
    if (r?.error) {
      setEtapasTarefa(virar);
      toast('error', 'Não foi possível mudar a etapa', r.error);
    }
  }, [api, toast]);

  /** Arrastou o card de uma coluna para outra dentro da entrega. Cair na etapa
   *  de conversão conclui a tarefa, e sair dela reabre: é a mesma regra do
   *  quadro grande, e um card em "Concluída" que não contasse como concluída
   *  faria a entrega mentir sobre o próprio progresso. */
  const moverTarefaDeEtapa = useCallback((t: Tarefa, status: string) => {
    const mudancas: Record<string, unknown> = { status };
    if (etapaDeConclusao && status === etapaDeConclusao && !t.concluida_em) {
      mudancas.concluida_em = new Date().toISOString();
    }
    if (etapaDeConclusao && status !== etapaDeConclusao && t.concluida_em) {
      mudancas.concluida_em = null;
    }
    salvarTarefa(t, mudancas);
  }, [etapaDeConclusao, salvarTarefa]);

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

  /** Abre o painel na mesma batida do clique e cria o projeto atrás dele. Não
   *  há mais "Criar projeto": esperar a ida ao servidor para só então mostrar o
   *  formulário é o que fazia a criação parecer lenta. */
  function novoProjeto() {
    const base = rascunhoDePartida(usuario?.id);
    setForm({ editando: null, base });
    const promessa = api('', 'POST', { action: 'create_projeto', ...base }).then(r => {
      if (r?.error) { toast('error', 'Não foi possível criar', r.error); return null; }
      const id = String(r.id);
      if (nascendo.current) nascendo.current.id = id;
      setIdNascido(id);
      void recarregar();
      return id;
    });
    nascendo.current = { promessa, id: null };
  }

  // O id chega depois da abertura. Quando o projeto aparece na listagem, o
  // painel troca de "novo" para "editando" no lugar, sem remontar: o que já foi
  // digitado continua lá, e as entregas, a saúde, as reuniões e a publicação
  // passam a existir.
  useEffect(() => {
    if (!idNascido) return;
    const p = projetos.find(x => x.id === idNascido);
    if (!p) return;
    setIdNascido(null);
    setForm(f => (f && !f.editando ? { ...f, editando: p } : f));
  }, [idNascido, projetos]);

  /** Fecha o painel. O projeto que ninguém tocou não fica: abrir e desistir não
   *  deveria deixar "Projeto sem nome" no quadro da casa. Qualquer alteração,
   *  por menor que seja, já o torna trabalho de alguém - e aí ele permanece. */
  async function fecharProjeto(intacto: boolean) {
    setForm(null);
    const novo = nascendo.current;
    nascendo.current = null;
    if (!novo || !intacto) return;
    // Fechou antes de o id chegar: espera, senão o projeto nasceria logo depois
    // e ficaria no quadro justamente por ter sido abandonado.
    const id = novo.id ?? await novo.promessa;
    if (!id) return;
    mudancasRef.current++;
    setProjetos(ps => ps.filter(p => p.id !== id));
    await api('', 'POST', { action: 'delete_projeto', id });
  }

  /** Grava o projeto aberto. Chamada pelo próprio painel a cada pausa na
   *  digitação: não fecha nada, não comemora nada e não prende ninguém - o
   *  gesto já foi pintado, e o que sai daqui é só o banco acompanhando.
   *
   *  `progresso` e `entregas` não vão junto de propósito: o progresso é deduzido
   *  no servidor, e mandar o número do rascunho o devolveria velho; as entregas
   *  já viraram linhas do projeto no instante em que ele nasceu. */
  async function salvar(r: Rascunho, anexos: AnexoPendente[], removidos: number[]) {
    const novo = nascendo.current;
    let alvo = form?.editando?.id ?? novo?.id ?? (novo ? await novo.promessa : null);
    if (!alvo) {
      // A criação do clique não vingou - a rede caiu, o servidor recusou. Perder
      // o que está sendo escrito seria o pior desfecho de um painel que grava
      // sozinho, então a criação acontece agora, com o que já está na tela.
      const resp = await api('', 'POST', {
        action: 'create_projeto', ...r,
        entregas: r.entregas.length > 0 ? r.entregas : entregasDePartida(),
      });
      if (resp?.error || !resp?.id) {
        toast('error', 'Não foi possível salvar', resp?.error ?? 'Tente de novo em instantes.');
        return;
      }
      alvo = String(resp.id);
      nascendo.current = { promessa: Promise.resolve(alvo), id: alvo };
      setIdNascido(alvo);
      // O que acabou de ser criado já leva tudo o que estava na tela: seguir
      // para o update logo em seguida seria gravar duas vezes a mesma coisa.
      await recarregar();
      return;
    }
    const { entregas: _entregas, progresso: _progresso, ...campos } = r;
    setSalvando(true);
    try {
      const resposta = await api('', 'POST', { action: 'update_projeto', id: alvo, ...campos });
      if (resposta?.error) { toast('error', 'Não foi possível salvar', resposta.error); return; }
      // Os anexos vão juntos. Um de cada vez, três arquivos custavam três idas
      // e voltas em fila, com o formulário parado na tela o tempo todo.
      if (anexos.length > 0 || removidos.length > 0) {
        await Promise.all([
          ...removidos.map(id => api('', 'POST', { action: 'delete_projeto_arquivo', id })),
          ...anexos.map(a => api('', 'POST', { action: 'add_projeto_arquivo', projeto_id: alvo, ...a })),
        ]);
      }
      mudancasRef.current++;
      // A lista atrás do painel acompanha na hora: ver o nome antigo no cartão
      // de trás é justamente o atraso que esta mudança veio tirar.
      const cliente = clientes.find(c => c.id === campos.cliente_id);
      setProjetos(ps => ps.map(p => (p.id === alvo ? {
        ...p,
        nome: campos.nome, descricao: campos.descricao,
        cliente_id: campos.cliente_id || null, cliente_nome: cliente?.nome ?? null,
        tipo: campos.tipo || null, status: campos.status, prioridade: campos.prioridade,
        data_inicio: campos.data_inicio || null,
        previsao_entrega: campos.previsao_entrega || null,
        observacoes: campos.observacoes, repositorio: campos.repositorio,
        drive: campos.drive, link_portal: campos.link_portal,
      } : p)));
      reconciliar();
    } finally {
      setSalvando(false);
    }
  }


  /** Grava a leitura e a mostra na hora. O id, a data e o autor continuam
   *  nascendo no servidor - por isso ele os devolve na resposta: a linha entra
   *  na tela com exatamente o que ficou gravado, sem inventar nada aqui e sem
   *  esperar a listagem inteira. */
  async function registrarSaude(p: Projeto, estado: string, descricao: string) {
    const r = await api('', 'POST', {
      action: 'registrar_saude_projeto', projeto_id: p.id, estado, descricao,
    });
    if (r?.error) { toast('error', 'Não foi possível registrar', r.error); return; }
    if (r?.id) {
      mudancasRef.current++;
      const nova: RegistroSaude = {
        id: Number(r.id), projeto_id: p.id, estado, descricao,
        criado_em: String(r.criado_em), criado_por_id: r.criado_por_id ?? null,
        criado_por_nome: r.criado_por_nome ?? null,
      };
      // A mais recente na frente, como a listagem devolve: a saúde atual do
      // projeto é a primeira da série.
      setProjetos(ps => ps.map(x => (x.id === p.id ? { ...x, saude: [nova, ...x.saude] } : x)));
    }
    toast('success', 'Leitura registrada');
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
    // Entrega nova entra na lista com o id que acabou de voltar. O que ela
    // ainda não tem - contagem de tarefas e progresso - nasce zerado, que é o
    // que uma entrega recém-criada de fato tem.
    if (!id && r?.id) {
      mudancasRef.current++;
      const nova: Entrega = {
        ...dados, id: Number(r.id), projeto_id: p.id,
        descricao: dados.descricao || null,
        marcador: dados.marcador || null,
        submarcador: dados.submarcador || null,
        prazo: dados.prazo || null,
        status: String(r.status ?? 'Planejada'),
        ordem: Number(r.ordem ?? 0),
        evidencias: [], tarefas_total: 0, tarefas_feitas: 0, progresso: 0,
      };
      setProjetos(ps => ps.map(x => (x.id === p.id ? { ...x, entregas: [...x.entregas, nova] } : x)));
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
    const envios: Promise<unknown>[] = [];
    for (const f of Array.from(arquivos ?? [])) {
      if (f.size > LIMITE_ANEXO) {
        toast('error', 'Arquivo grande demais',
          `"${f.name}" tem ${fmtTamanho(f.size)} e o limite é ${fmtTamanho(LIMITE_ANEXO)}.`);
        continue;
      }
      // A leitura do arquivo é sequencial de propósito - `substituir` só vale
      // para o primeiro, e o primeiro tem de chegar antes dos outros. O envio,
      // esse vai em paralelo: três provas custavam três voltas em fila.
      const corpo = {
        action: 'add_entrega_evidencia', entrega_id: e.id, nome: f.name,
        tipo: f.type || 'application/octet-stream', tamanho: f.size,
        base64: await lerBase64(f), comentario, etapa, substituir: primeiro,
      };
      if (primeiro) await api('', 'POST', corpo);
      else envios.push(api('', 'POST', corpo));
      primeiro = false;
    }
    await Promise.all(envios);
    // A prova vira id e carimbo no servidor, então quem a traz é a listagem -
    // mas sem prender a tela: ela chega em seguida, com o painel já aberto.
    void recarregar();
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
    const r = await api('', 'POST', { action: 'registrar_reuniao_projeto', projeto_id: p.id, ...reg });
    if (r?.error) { toast('error', 'Não foi possível registrar', r.error); return; }
    if (r?.id) {
      mudancasRef.current++;
      // A mais recente na frente: a lista vem por data, da última para a
      // primeira, e a que acabou de ser registrada é a última que houve.
      const nova: Reuniao = {
        ...reg, id: Number(r.id), projeto_id: p.id,
        criado_por_nome: r.criado_por_nome ?? null, entregas: [],
      };
      setProjetos(ps => ps.map(x => (
        x.id === p.id ? { ...x, reunioes: [nova, ...(x.reunioes ?? [])] } : x)));
    }
    toast('success', 'Reunião registrada');
  }

  /** A lista de reuniões da conta do Fireflies, filtrada por texto. A chave da
   *  API não sai do cofre: quem fala com eles é o servidor. */
  async function buscarReunioesFireflies(busca: string) {
    const r = await api(`?action=fireflies_reunioes&busca=${encodeURIComponent(busca)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

  /** Liga ou desliga uma reunião de uma entrega. A tela muda na hora e volta
   *  se o servidor recusar: o vínculo é uma marca, e esperar a ida e a volta
   *  para vê-la faria a caixa parecer travada. */
  async function vincularReuniao(
    reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean,
  ) {
    const antes = projetos;
    mudancasRef.current++;
    const campo = 'entregas';
    setProjetos(ps => ps.map(p => ({
      ...p,
      reunioes: (p.reunioes ?? []).map(r => {
        if (r.id !== reuniaoId) return r;
        const atual = (r[campo] as number[] | undefined) ?? [];
        return {
          ...r,
          [campo]: ligar ? [...atual, alvoId] : atual.filter(x => x !== alvoId),
        };
      }),
    })));
    const resp = await api('', 'POST', {
      action: 'vincular_reuniao', reuniao_id: reuniaoId, tipo, alvo_id: alvoId, ligar,
    });
    if (resp?.error) {
      setProjetos(antes);
      toast('error', 'Não foi possível vincular', resp.error);
      return;
    }
    reconciliar();
  }

  /** O endereço da gravação, buscado só quando alguém vai assistir: a URL vem
   *  assinada pela CDN do Fireflies e expira em poucos dias. */
  async function buscarGravacaoFireflies(firefliesId: string) {
    const r = await api(`?action=fireflies_gravacao&id=${encodeURIComponent(firefliesId)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

  /** Puxa a reunião do Fireflies para dentro do projeto. O resumo vira a nota e
   *  o link fica guardado; a transcrição inteira continua morando lá. */
  async function anexarReuniaoFireflies(p: Projeto, firefliesIds: string[]) {
    const r = await api('', 'POST', {
      action: 'anexar_reuniao_fireflies', projeto_id: p.id, fireflies_ids: firefliesIds,
    });
    if (r?.error) { toast('error', 'Não foi possível anexar', r.error); return; }
    const n = Number(r?.anexadas ?? firefliesIds.length);
    toast('success', n > 1 ? `${n} reuniões anexadas` : 'Reunião anexada',
      r?.falhas ? `${r.falhas} não vieram: o Fireflies recusou.`
        : 'Puxadas do Fireflies, com o resumo e o link.');
    // O conteúdo da reunião é montado no servidor a partir do Fireflies, então
    // quem o traz é a listagem. Sem `await`: a caixa de busca já pode fechar.
    void recarregar();
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
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.filter(x => x.id !== p.id));
    const r = await api('', 'POST', { action: 'delete_projeto', id: p.id });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível excluir', r.error); return; }
    toast('success', 'Projeto excluído');
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

  /** Marcadores e submarcadores já escritos, de todos os projetos. Sugerir só
   *  os do projeto aberto faria a mesma área nascer com grafia diferente em
   *  cada projeto novo. */
  const usados = useCallback((campo: 'marcador' | 'submarcador') => [...new Set(
    projetos.flatMap(p => p.entregas ?? [])
      .map(e => (e[campo] ?? '').trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'pt-BR')), [projetos]);
  const marcadoresDeEntrega = useMemo(() => usados('marcador'), [usados]);
  const submarcadoresDeEntrega = useMemo(() => usados('submarcador'), [usados]);

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

  const filtrados = useMemo(() => {
    // O que se digita procura em nome, código, cliente e descrição: é por um
    // desses quatro que alguém se lembra de um projeto.
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    return projetos.filter(p =>
      (fStatus.length === 0 || fStatus.includes(p.status)) &&
      (fCliente.length === 0 || (p.cliente_nome && fCliente.includes(p.cliente_nome))) &&
      (fGestor.length === 0 || fGestor.includes(gestorDe(p)?.nome ?? '')) &&
      (fTipo.length === 0 || (p.tipo && fTipo.includes(p.tipo))) &&
      (!q || [p.nome, p.codigo, p.cliente_nome, p.descricao].some(v =>
        (v ?? '').toLocaleLowerCase('pt-BR').includes(q)))
    );
  }, [projetos, fStatus, fCliente, fGestor, fTipo, busca]);

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

  const temFiltro = fStatus.length + fCliente.length + fGestor.length + fTipo.length > 0
    || busca.trim().length > 0;
  const limparFiltros = () => {
    setFStatus([]); setFCliente([]); setFGestor([]); setFTipo([]); setBusca('');
  };

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
    <div className="admin-content-wrap pagina-cristal pagina-projetos">
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
            onClick={novoProjeto}>
            + Novo projeto
          </button>
        )}
      </div>

      {/* O cabeçalho fica de fora: o título é o mesmo nas duas abas, e vê-lo
          reanimar a cada troca daria a impressão de que a página inteira
          recarregou. */}
      <AbaPainel key={aba} // O mesmo vao da pagina: aqui dentro os blocos sao os mesmos - cartoes,
        // filtros, busca e lista -, e um vao proprio deixava esta tela mais
        // solta que as outras.
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      {/* A busca fica à vista, e não atrás de um botão: é a mesma faixa da tela
          de Tarefas e da página do cliente. Os filtros ficam acima porque
          estreitam o conjunto; a busca varre o que sobrou. */}
      {aba === 'geral' && !carregando && projetos.length > 0 && (
        <div className="secao-busca">
          <span className="secao-busca-campo">
            <IconSearch size={13} />
            <input value={busca} aria-label="Buscar projeto"
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, código, cliente ou descrição"
              onKeyDown={e => { if (e.key === 'Escape') setBusca(''); }} />
            {busca && (
              <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
                <IconX size={12} />
              </button>
            )}
          </span>
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
          <p>{temFiltro ? 'Nenhum projeto para essa busca' : 'Nenhum projeto encontrado'}</p>
          {temFiltro && (
            <button
              style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--gray2)',
                background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={limparFiltros}>
              Limpar busca e filtros
            </button>
          )}
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
                  <span className="kanban-conta-bolha">{daColuna.length}</span>
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
          base={form.base}
          onVerTarefasDaEntrega={form.editando && onVerTarefasDaEntrega
            ? entregaId => onVerTarefasDaEntrega(form.editando!.id, entregaId)
            : undefined}
          onCriarTarefaNaEntrega={criarTarefaNaEntrega}
          onAbrirTarefa={abrirTarefa}
          onExcluirTarefa={setExcluindoTarefa}
          onMoverTarefa={moverTarefaDeEtapa}
          onFixarRecolhida={pode('configuracoes:etapas') ? fixarEtapaRecolhida : undefined}
          podeEditarTarefa={pode('tarefas:editar')}
          etapasTarefa={etapasTarefa}
          pessoas={pessoas}
          clientes={clientes}
          salvando={salvando}
          onFechar={intacto => void fecharProjeto(intacto)}
          onSalvar={salvar}
          onBaixarAnexo={a => void baixarAnexo(a)}
          marcadores={marcadoresDeEntrega}
          submarcadores={submarcadoresDeEntrega}
          somenteLeitura={!podeEditar}
          onExcluir={setExcluindo}
          onEtiquetar={etiquetarAnexo}
          onRegistrarSaude={registrarSaude}
          onExcluirSaude={excluirSaude}
          onRegistrarReuniao={registrarReuniao}
          onVincularReuniao={vincularReuniao}
          onBuscarReunioesFireflies={buscarReunioesFireflies}
          onBuscarGravacaoFireflies={buscarGravacaoFireflies}
          onAnexarReuniaoFireflies={anexarReuniaoFireflies}
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
          onSalvar={() => salvarRascunho(rascunhoTarefa)}
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
          titulo={excluindoTarefa.titulo}
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
