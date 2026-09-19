import { Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import {
  IconAlert, IconArrowLeft, IconArrowRight, IconBuilding, IconClip, IconClipboard, IconDoc, IconDownload,
  IconFunil,
  IconImage, IconInbox,
  IconChevronDown, IconChevronRight, IconChevronUp, IconChevronUpDown,
  IconDrive, IconEdit, IconEye, IconEyeOff, IconGitHub, IconGlobo, IconLink, IconMarcoAndamento,
  IconMarcoBloqueado, IconSpinner,
  IconAgrupar, IconArrastar, IconCalendario, IconCheck, IconExternal, IconOrdenar, IconSearch,
  IconMarcoCancelado, IconMarcoConcluido, IconMarcoPlanejado, IconMarcoValidado,
  IconPlay, IconPlus, IconPrioridadeAlta, IconPrioridadeBaixa, IconPrioridadeMaxima,
  IconRecolher,
  IconPrioridadeMedia, IconTrash,
  IconTriangulo, IconVisaoLista, IconVisaoQuadro,
  IconX, IconZip, IconRamificar
} from '../components/icons';
import FilterDropdown from '../components/FilterDropdown';
import { SegSwitch } from '../components/SegSwitch';
import { PLANNING_FUNIL, PROJETO_GERAL } from '../lib/projetoGeral';
import { logoDoCliente } from '../lib/marcas';
import { LogoDoCliente } from '../components/LogoDoCliente';
import { AlternarDesejavel, ChipDesejavel } from '../components/ChipDesejavel';
import { AcaoDoObjetivo, ICONE_DA_ACAO } from '../components/AcaoDoObjetivo';
import { MarcoDeStatus } from '../components/MarcoDeStatus';
import {
  SemanaDaPlanningCtx, diaEMes, segundaDaData, sextaDaSemana, type ObjetivoLevado,
} from '../lib/semanaDoObjetivo';
import {
  COR_OBJETIVO, ICONE_OBJETIVO, OPCOES_DO_OBJETIVO, marcasDoStatus, statusDoObjetivo,
  type StatusDoObjetivo,
} from '../lib/statusDoObjetivo';
import { DESCRICAO_PAPEL, PAPEIS_EQUIPE, porNivelDeContato } from '../lib/papeisDeEquipe';
import { SkeletonCards, SkeletonTabela } from '../components/Skeleton';
import { CartaoKpi, CartoesKpiEsqueleto } from '../components/CartaoKpi';
import { Abas, AbaPainel } from '../components/Abas';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { SeletorVinculo, Chip, ChipReuniao } from '../components/VinculoReuniao';
import {
  ComNegrito, ReuniaoModal, lerAcoes, lerDados, lerTopicos, type TopicoReuniao,
} from '../components/ReuniaoModal';
import { EntregaModal } from '../components/EntregaModal';
import type { Transcricao } from '../components/BotaoTranscricao';
import { Dialogo } from '../components/Dialogo';
import { dia as fmtData, diaCurto as fmtDataCurta, tamanho as fmtTamanho } from '../lib/datas';
import { ancorar } from '../lib/ancorar';
import { contemTermo } from '../lib/texto';
import { arquivosColados } from '../lib/colarArquivos';
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
export type { Reuniao } from '../components/SecaoReunioes';
import {
  COR_PRIORIDADE, DESCRICAO_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES, PRIORIDADE_PADRAO, porUrgencia,
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
import { CampoBusca } from '../components/CampoBusca';
import { DatePicker } from '../components/DatePicker';
import { COR_ENTREGA, ICONE_ENTREGA } from '../lib/etapasEntrega';
import { DonosDaTarefa } from '../components/DonosDaTarefa';
import { SeletorPessoas } from '../components/SeletorPessoas';
import {
  SecaoReunioes, type Reuniao, type ReuniaoFF,
} from '../components/SecaoReunioes';

// ─────────────────────────────────────────────────────────────────────────────
//  Projetos - o cadastro dos projetos da casa e o acompanhamento de cada um.
//
//  Duas abas sobre a mesma lista, porque são duas perguntas diferentes:
//    Geral    → "quais projetos existem?"   cadastro, edição e exclusão.
//    Planning → "o que cada um faz esta semana?"  a reunião de planejamento.
//
//  A segunda não é leitura: é a tela em que a semana é montada com o time, e o
//  que se combina ali fica gravado por projeto e por semana.
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
  { valor: 'prioridade', label: 'Prioridade' },
  { valor: 'titulo', label: 'Título (A a Z)' },
  { valor: 'prazo', label: 'Prazo mais próximo' },
  { valor: 'status', label: 'Etapa' },
] as const;

/** Estados possíveis de uma entrega, para exibição. Só dois são escolhidos por
 *  alguém: ver `RESOLUCAO_ENTREGA`. */
export const STATUS_ENTREGA = [
  'Triagem', 'Planejada', 'Em andamento', 'Bloqueada', 'Entregue', 'Validada', 'Cancelada',
] as const;
/** Antes de virar plano: a entrega chegou e alguém ainda vai decidir o que
 *  fazer com ela. É escolhida à mão, como as resoluções, e por isso não se
 *  desfaz sozinha quando uma tarefa começa a andar. */
export const ENTREGA_TRIAGEM = 'Triagem';
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
/** O que uma pessoa consegue escolher no marco: a triagem, que vem antes do
 *  plano, e as três resoluções. */
export const ESCOLHAS_DO_MARCO = [ENTREGA_TRIAGEM, ...RESOLUCAO_ENTREGA] as const;

/** Com que etiqueta o arquivo entra. A classificação fina é feita na linha
 *  do anexo, depois de ver o que subiu. */
const ETIQUETA_PADRAO = 'Documento';

const ETIQUETAS = ['Proposta', 'Contrato', 'Documento', 'Slide', 'Planilha', 'Outro'] as const;

/** Papéis da equipe. Gestor vem primeiro porque é o que a aba de gestão destaca. */
export { PAPEIS_EQUIPE } from '../lib/papeisDeEquipe';

/** Tipos de projeto da casa. Lista fechada de propósito: campo livre viraria
 *  "BI", "bi" e "Business Intelligence" na mesma base, e o filtro não fecharia. */
export const TIPOS_PROJETO = ['BI', 'IA', 'SaaS', 'Automação', 'Integração', 'App', 'Site', 'Consultoria', 'Outro'] as const;


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

/** Um anexo da entrega: o que ela carrega de material, sem ser prova de nada.
 *  O conteúdo não vem na listagem - ele desce quando alguém pede o arquivo. */
export interface ArquivoDaEntrega {
  id: number;
  entrega_id: number;
  nome: string;
  tipo: string;
  tamanho: number;
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
  /** A fila da area do cliente: 1 e o que vem primeiro. Nao e unica - cada area
   *  monta a sua, entao duas entregas de areas diferentes podem ser 1 ao mesmo
   *  tempo. Nulo e "ainda nao priorizada". */
  prioridade: number | null;
  responsaveis: string[];
  /** Saíram da tela em favor dos anexos, mas continuam na coluna: uma tela que
   *  não conhece mais o campo não pode apagar o que foi guardado antes dela. */
  links: { label: string; url: string }[];
  ordem: number;
  evidencias: Evidencia[];
  /** O documento, a imagem, a planilha que a entrega carrega. Sem o conteúdo:
   *  ele desce quando alguém pede aquele arquivo. */
  arquivos: ArquivoDaEntrega[];
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
  /** Quem cuida da tarefa. Lista, porque trabalho a quatro mãos é o normal e
   *  não a exceção - e é o mesmo formato que a entrega já usa. */
  responsaveis: string[];
  /** O primeiro da lista, espelhado pelo servidor na coluna antiga. Fica de pé
   *  para uma volta atrás do código não perder o dono; a lista é quem manda. */
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
  /** Ver `Entrega.prioridade`. Vazio no formulário vira nulo. */
  prioridade: number | null;
  responsaveis: string[];
}

/** Um acesso do projeto: o login do portal entregue, do painel do cliente, do
 *  ambiente de homologação.
 *
 *  A senha não vem junto: a listagem diz apenas se existe uma, e o conteúdo
 *  desce por ação própria quando alguém pede para ver ou copiar. Ela também
 *  não sai na página do cliente - é acesso da equipe, não do cliente. */
export interface AcessoDoProjeto {
  id: number;
  rotulo: string;
  usuario: string | null;
  url: string | null;
  tem_senha: boolean;
}

export interface Projeto {
  id: string;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  tipo: string | null;
  /** Os endereços do projeto, com nome e URL. Vêm prontos do servidor, que
   *  resolve os formatos antigos - a lista de strings e o campo único. */
  repositorios: LinkDoProjeto[];
  drives: LinkDoProjeto[];
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
  /** Da reunião mais recente para a mais antiga. */
  reunioes: Reuniao[];
  /** Na ordem em que foram criadas. */
  entregas: Entrega[];
  /** Todas as do projeto, presas a uma entrega ou soltas. */
  tarefas: Tarefa[];
  /** Os logins que a equipe usa neste projeto. Sem as senhas. */
  acessos: AcessoDoProjeto[];
  criado_em: string;
  /** Chave da página de acompanhamento do cliente. Nulo é não publicado. */
  publico_token: string | null;
  publicado_em: string | null;
  /** Posição do projeto na reunião de planning, arrumada arrastando as
   *  divisórias. Nula é "ainda não ordenado". */
  planning_ordem?: number | null;
}

interface Cliente { id: string; nome: string }

/** Anexo ainda não enviado. Projeto novo só ganha id depois de salvo, então os
 *  arquivos ficam aqui até existir a que anexá-los. */
interface AnexoPendente {
  etiqueta: string; nome: string; tipo: string; tamanho: number; base64: string;
}

const VAZIO = {
  nome: '', descricao: '', cliente_id: '', tipo: '',
  repositorios: [] as LinkDoProjeto[],
  drives: [] as LinkDoProjeto[],
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
    prazo: '', prioridade: null, responsaveis: [], links: [],
  }));
}

/** O nome com que o projeto nasce. Ele é criado no clique, e nome vazio não
 *  passa pela gravação - este fica no campo, já selecionado, para a primeira
 *  tecla o trocar. */
/** O mesmo texto da tarefa, e de propósito: as duas gavetas nascem iguais, com
 *  o nome de partida marcado, e a primeira tecla substitui em vez de escrever
 *  depois dele. Dois textos diferentes para o mesmo gesto fariam a segunda
 *  gaveta parecer outra coisa. */
export const NOME_PADRAO = 'Sem título';

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
/** O teto de uma prova de objetivo, igual ao do anexo de comentário. O mesmo
 *  número está no servidor, que é quem recusa de verdade. */
const LIMITE_DE_PROVA = 8 * 1024 * 1024;

/** Conteúdo do arquivo em base64, sem o prefixo `data:`. Serve tanto ao anexo
 *  do projeto quanto à evidência de entrega. */
function lerBase64(f: File): Promise<string> {
  return new Promise(resolve => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '');
    fr.readAsDataURL(f);
  });
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
function SeletorCompacto({ valor, opcoes, titulo, icones, descricoes, onChange }: {
  valor: string;
  opcoes: readonly string[];
  titulo: string;
  /** Desenho por opção. Sem isto o seletor mostra só o texto. */
  icones?: Record<string, (p: { size?: number }) => JSX.Element>;
  /** O que a opção quer dizer, como na régua de urgência: o nome sozinho deixa
   *  a escolha no gosto de cada um. */
  descricoes?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function abrir() {
    // Com descrição cada linha ocupa duas: sem contar isso, a lista abria
    // medindo metade da altura que ia ter.
    // Com descrição, cada linha ocupa duas e a caixa precisa de largura para a
    // frase caber: sem isso ela nasce do tamanho do gatilho, que é um chip.
    setPos(ancorar(triggerRef.current!, opcoes.length * (descricoes ? 2 : 1),
      descricoes ? 250 : undefined));
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
              <span style={{ minWidth: 0 }}>
                {o}
                {descricoes?.[o] && (
                  <span className="select-opcao-descricao">{descricoes[o]}</span>
                )}
              </span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * Os anexos de uma entrega.
 *
 * Substituiu o campo de referências, que era uma lista de links: link some,
 * muda de dono e depende de quem tem acesso à pasta do outro lado. O arquivo
 * que importa fica aqui, junto do marco a que ele pertence.
 *
 * A seção só aparece quando há o que mostrar ou quem possa anexar: entrega
 * vazia lida por quem não edita não ganha um cabeçalho anunciando o nada.
 */
function AnexosDaEntrega({ entregaId, arquivos, somenteLeitura, onAnexar, onRemover, onVer, onBaixar }: {
  entregaId: number;
  arquivos: ArquivoDaEntrega[];
  somenteLeitura: boolean;
  onAnexar: (entregaId: number, arquivos: FileList) => void;
  onRemover: (a: ArquivoDaEntrega) => void;
  onVer: (a: ArquivoDaEntrega) => void;
  onBaixar: (a: ArquivoDaEntrega) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  if (arquivos.length === 0 && somenteLeitura) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
        textTransform: 'uppercase', color: 'var(--gray2)', margin: '0 0 5px' }}>
        Anexos
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {arquivos.map(a => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5 }}>
            <span style={{ color: 'var(--gray2)' }}><IconClip size={12} /></span>
            <span style={{ flex: 1, minWidth: 0, color: 'var(--black)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.nome}>
              {a.nome}
            </span>
            <span style={{ color: 'var(--gray2)', fontSize: 10.5 }}>{fmtTamanho(a.tamanho)}</span>
            <button type="button" className="file-eye-btn" title="Visualizar"
              aria-label={`Visualizar ${a.nome}`} onClick={() => onVer(a)}>
              <IconEye size={13} />
            </button>
            <button type="button" className="admin-file-download" title="Baixar"
              aria-label={`Baixar ${a.nome}`} onClick={() => onBaixar(a)}>
              <IconDownload size={12} />
            </button>
            {!somenteLeitura && (
              <button type="button" className="file-delete-btn" title="Remover anexo"
                aria-label={`Remover ${a.nome}`} onClick={() => onRemover(a)}>
                <IconTrash size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
      {!somenteLeitura && (
        <>
          <button type="button" className="entrega-anexar" style={{ marginTop: 6 }}
            onClick={() => entrada.current?.click()}
            title={`Anexar arquivo · máx. ${fmtTamanho(LIMITE_ANEXO)}`}>
            <IconPlus size={12} /> Anexar arquivo
          </button>
          <input ref={entrada} type="file" multiple hidden
            onChange={ev => {
              if (ev.target.files?.length) onAnexar(entregaId, ev.target.files);
              ev.target.value = '';
            }} />
        </>
      )}
    </div>
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
          // Em leitura o endereço é o próprio link: quem vê uma URL na tela
          // tenta clicar nela, e não no botão ao lado.
          limpo ? (
            <a className="campo-endereco-link" href={limpo}
              target="_blank" rel="noopener noreferrer" title={limpo}>
              {limpo}
            </a>
          ) : (
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--gray2)' }}>
              Não informado
            </span>
          )
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

/** Quantos repositórios cabem num projeto. O mesmo número está no servidor, que
 *  é quem recusa o terceiro: aqui ele só decide quando o botão de somar some.
 *
 *  Pasta do Drive não tem teto: um projeto tem quantas o cliente tiver. */
const MAX_REPOSITORIOS = 2;

/** Um endereço do projeto: o nome que se lê e o endereço que se abre. */
export interface LinkDoProjeto { nome: string; url: string }

/** O nome que um endereço ganha quando ninguém escreveu um. A mesma dedução do
 *  servidor, repetida aqui para o chip nascer nomeado antes de a gravação ir e
 *  voltar. */
function nomeDoEndereco(url: string): string {
  const limpo = url.trim();
  const gh = /github\.com\/([^/?#]+)\/([^/?#]+)/i.exec(limpo);
  if (gh) return `${gh[1]}/${gh[2].replace(/\.git$/i, '')}`;
  try { return new URL(limpo).hostname.replace(/^www\./, ''); } catch { return limpo.slice(0, 60); }
}

/**
 * Os endereços do projeto, em chips: a marca do serviço e o nome do que está
 * do outro lado.
 *
 * Chip, e não campo de texto empilhado, porque uma URL do Drive tem setenta
 * caracteres de id opaco: lida em linha ela não diz nada, e três delas juntas
 * viram um bloco ilegível. O que identifica a pasta é o nome que alguém deu.
 *
 * Do GitHub o nome é deduzido da própria URL - `owner/repo` está lá, e é assim
 * que o repositório é chamado em voz alta. Do Drive não dá: a pasta é um id, e
 * por isso ali o nome é digitado.
 */
function ChipsDeEndereco({ rotulo, valores, marca, exemplo, dica, teto, somenteLeitura, onChange }: {
  rotulo: string;
  valores: LinkDoProjeto[];
  marca: 'github' | 'drive';
  exemplo: string;
  dica?: string;
  /** Sem teto quando não vem: o botão de somar fica para sempre. */
  teto?: number;
  somenteLeitura: boolean;
  onChange: (v: LinkDoProjeto[]) => void;
}) {
  const [somando, setSomando] = useState(false);
  const [url, setUrl] = useState('');
  const [nome, setNome] = useState('');
  const campoUrl = useRef<HTMLInputElement>(null);
  // O cursor vai para o endereço quando o bloco abre, e não na montagem: o
  // formulário fica montado o tempo todo - é o que dá à animação de onde sair -
  // e `autoFocus` ali roubaria o cursor assim que a ficha do projeto abrisse.
  useEffect(() => { if (somando) campoUrl.current?.focus(); }, [somando]);
  const fecharForm = () => { setSomando(false); setUrl(''); setNome(''); };
  const Marca = marca === 'github' ? IconGitHub : IconDrive;
  const cabeMais = teto == null || valores.length < teto;

  function somar() {
    const limpo = url.trim();
    if (!limpo) return;
    onChange([...valores, { url: limpo, nome: nome.trim() || nomeDoEndereco(limpo) }]);
    fecharForm();
  }

  return (
    <div className="form-group">
      <label className="form-label">{rotulo}</label>
      <div className="link-chips">
        {valores.map((v, i) => (
          // `.surge` em cada chip, e não `.lista-anima` no contêiner: os chips
          // que já estavam têm chave estável, então só o que acabou de nascer
          // anima. Com a classe no contêiner, somar um faria todos piscarem.
          <span className="link-chip surge" key={`${v.url}-${i}`}>
            <a href={v.url} target="_blank" rel="noopener noreferrer" title={v.url}>
              <Marca size={13} />
              <span>{v.nome || nomeDoEndereco(v.url)}</span>
            </a>
            {!somenteLeitura && (
              <button type="button" aria-label={`Tirar ${v.nome}`} title="Tirar"
                onClick={() => onChange(valores.filter((_, j) => j !== i))}>
                <IconX size={11} />
              </button>
            )}
          </span>
        ))}
        {valores.length === 0 && somenteLeitura && (
          <span className="link-chips-vazio">Não informado</span>
        )}
        {!somenteLeitura && cabeMais && !somando && (
          <button type="button" className="link-chip-add" onClick={() => setSomando(true)}>
            <IconPlus size={11} /> Adicionar
          </button>
        )}
      </div>

      {/* O formulário de somar é um gesto, e não um campo da ficha - por isso
          nasce fechado. Abre e fecha com `.revelar`, que anima a altura: ele
          empurra a dica e o resto da ficha para baixo, e um corte ali faria a
          página saltar.

          Fica montado o tempo todo, e não condicionado ao `somando`: é dele que
          a animação tira a altura de destino, e montado só enquanto aberto o
          bloco animaria de nada para nada. Quem esvazia o rascunho é o
          `fecharForm`, e não a desmontagem. */}
      {!somenteLeitura && (
        <div className={`revelar${somando ? ' aberto' : ''}`}>
          <div>
            <div className="link-chip-form">
              <input ref={campoUrl} className="form-input" value={url} placeholder={exemplo}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.preventDefault(); fecharForm(); }
                  if (e.key === 'Enter') { e.preventDefault(); somar(); }
                }} />
              <input className="form-input" value={nome}
                placeholder={marca === 'github' ? 'Nome (sai da URL se ficar vazio)' : 'Nome da pasta'}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') { e.preventDefault(); fecharForm(); }
                  if (e.key === 'Enter') { e.preventDefault(); somar(); }
                }} />
              <button type="button" className="btn btn-primary btn-sm" disabled={!url.trim()}
                onClick={somar}>
                <IconPlus size={11} /> Adicionar
              </button>
              <button type="button" className="campo-acao" onClick={fecharForm}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
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
          // A mesma leitura do campo de prioridade: o nome, e embaixo o que
          // ele quer dizer. A marca sobe para o topo, ao lado do nome.
          conteudo: (
            <>
              <span style={{ display: 'inline-flex', marginTop: 1 }}>
                {ICONE_PRIORIDADE[p]({ size: 14 })}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block' }}>{p}</span>
                <span className="select-opcao-descricao">{DESCRICAO_PRIORIDADE[p]}</span>
              </span>
            </>
          ),
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

// ── Entregas do projeto ─────────────────────────────────────────────────────

/** Carência antes de uma coluna recolhida voltar a recolher (ms). */
const RECOLHER_APOS_MS = 2000;
/** Tempo parado sobre o traço antes de ele abrir: atravessar o quadro com o
 *  ponteiro não deve disparar a expansão. */
const INTENCAO_MS = 200;

/** Uma coluna do quadro de tarefas do painel.
 *
 *  Recolhe quando está vazia - padrão de todo quadro da casa - ou quando a
 *  etapa foi marcada como pontual pelo botão do próprio cabeçalho. Fechada, ela
 *  é um traço com a bolinha da cor e a contagem; abre parando o ponteiro em
 *  cima, e na hora quando um card está sendo arrastado, porque aí a coluna
 *  precisa estar pronta para receber. */
function ColunaDoQuadro({ etapa, tarefas, pessoas, podeEditar, arrastando, onAbrir, onCriar,
  onExcluir, onSoltarAqui, onArrastar, onFimDoArraste, onFixarRecolhida, entregaDe }: {
  etapa: EtapaTarefa;
  tarefas: Tarefa[];
  pessoas: Pessoa[];
  podeEditar: boolean;
  /** De que entrega é a tarefa, quando o quadro mistura várias. Dentro de uma
   *  entrega só, some: repetir o mesmo nome em todo card não informa nada. */
  entregaDe?: (t: Tarefa) => string | null;
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
          // Abrir a tarefa é leitura, e não edição: quem não pode editar
          // continua podendo ler o que foi combinado - o formulário abre em
          // modo de leitura sozinho. O que a permissão barra é arrastar,
          // criar e excluir, que são os gestos que mudam alguma coisa.
          <div key={x.id} className="kanban-card"
            draggable={podeEditar}
            onDragStart={() => onArrastar(x.id)}
            onDragEnd={onFimDoArraste}
            onClick={() => onAbrir(x)}
            style={{ cursor: 'pointer', opacity: arrastando === x.id ? 0.45 : 1 }}>
            <p className="kanban-card-title">{x.titulo}</p>
            {entregaDe?.(x) && (
              <p className="kanban-card-entrega" title={entregaDe(x) ?? undefined}>
                {entregaDe(x)}
              </p>
            )}
            <div className="painel-kanban-pe">
              {/* O ícone de prioridade explica a ordem da coluna, que de outro
                  modo pareceria arbitrária. Mesma marca do índice de projetos. */}
              <span className="painel-kanban-prio"
                style={{ color: COR_PRIORIDADE[x.prioridade ?? PRIORIDADE_PADRAO] ?? 'var(--gray2)' }}
                title={`Prioridade: ${x.prioridade ?? PRIORIDADE_PADRAO}`}>
                {ICONE_PRIORIDADE[x.prioridade ?? PRIORIDADE_PADRAO]?.({ size: 12 })}
              </span>
              {x.prazo && <span>{fmtData(x.prazo)}</span>}
              {x.responsaveis?.length > 0 && (
                <span style={{ marginLeft: 'auto' }}>
                  <DonosDaTarefa ids={x.responsaveis} pessoas={pessoas} size={16} />
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

/** Tarefas em quadro, dentro do painel. Serve a uma entrega e ao projeto
 *  inteiro: é a mesma leitura, e o que muda é quem entrega a lista.
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
 *  responde primeiro sobre ela mesma.
 *
 *  Dentro da coluna manda a urgência: a coluna já diz em que ponto do fluxo a
 *  tarefa está, e a prioridade diz por qual começar. No empate fica a ordem que
 *  já vinha, que é a de criação - ninguém reordena tarefa à mão, então não há
 *  decisão de pessoa para esta ordenação atropelar. */
function QuadroDeTarefas({ tarefas, etapas, pessoas, podeEditar, onAbrir, onCriar, onExcluir,
  onMover, onFixarRecolhida, entregaDe, alto }: {
  tarefas: Tarefa[];
  etapas: EtapaTarefa[];
  pessoas: Pessoa[];
  podeEditar: boolean;
  /** De que entrega é cada tarefa. Só no quadro do projeto inteiro. */
  entregaDe?: (t: Tarefa) => string | null;
  /** Coluna alta, para quando o quadro é a tela e não um bloco dentro dela. */
  alto?: boolean;
  onAbrir: (t: Tarefa) => void;
  /** Nasce já na coluna em que foi pedida. */
  onCriar: (status: string) => void;
  onExcluir: (t: Tarefa) => void;
  onMover: (t: Tarefa, status: string) => void;
  onFixarRecolhida?: (etapaId: number) => void;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);

  // A ordem padrão de toda lista de tarefas: prioridade, e o prazo dentro dela.
  const daColuna = (nome: string) =>
    tarefas.filter(x => x.status === nome).sort(porUrgencia);

  return (
    <div className={`kanban-board painel-kanban${alto ? ' painel-kanban-alto' : ''}`}>
      {etapas.map(et => (
        <ColunaDoQuadro key={et.id}
          etapa={et}
          tarefas={daColuna(et.nome)}
          pessoas={pessoas}
          podeEditar={podeEditar}
          arrastando={arrastando}
          onAbrir={onAbrir}
          entregaDe={entregaDe}
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

/**
 * A aba Tarefas da ficha do projeto: o mesmo quadro da tela de Tarefas, com as
 * tarefas deste projeto e de nenhum outro.
 *
 * Existe porque a pergunta "o que está acontecendo neste projeto" era respondida
 * em três lugares - uma entrega de cada vez, aqui dentro, ou na tela de Tarefas
 * com o filtro certo aplicado. O quadro do projeto inteiro é a resposta direta,
 * e o card diz de que entrega cada tarefa é, que é o que a lista por entrega
 * dava de graça e um quadro misturado perderia.
 *
 * A tarefa criada por aqui nasce sem entrega: é tarefa do projeto, e pendurá-la
 * numa entrega por chute daria à entrega um andamento que ninguém pediu. Quem
 * quer a tarefa dentro de uma entrega cria pelo quadro dela, na aba Geral.
 */
function TarefasDoProjeto({ projeto, etapas, pessoas, podeEditar, onAbrir, onCriar, onExcluir,
  onMover, onFixarRecolhida }: {
  projeto: Projeto;
  etapas: EtapaTarefa[];
  pessoas: Pessoa[];
  podeEditar: boolean;
  onAbrir: (t: Tarefa) => void;
  onCriar: (status: string) => void;
  onExcluir: (t: Tarefa) => void;
  onMover: (t: Tarefa, status: string) => void;
  onFixarRecolhida?: (etapaId: number) => void;
}) {
  const todas = projeto.tarefas ?? [];
  const tituloDaEntrega = new Map((projeto.entregas ?? []).map(e => [e.id, e.titulo]));

  // Os mesmos filtros da tela de Tarefas, com o mesmo desenho, só que dentro
  // deste projeto: com trinta tarefas no quadro, "o que é do Rafael" e "o que é
  // desta entrega" são as duas perguntas de quem abre a aba.
  const [fResponsavel, setFResponsavel] = useState<string[]>([]);
  const [fEntrega, setFEntrega] = useState<string[]>([]);
  const [fEtiqueta, setFEtiqueta] = useState<string[]>([]);
  const [fPrioridade, setFPrioridade] = useState<string[]>([]);
  const [busca, setBusca] = useState('');
  const temFiltro = fResponsavel.length > 0 || fEntrega.length > 0
    || fEtiqueta.length > 0 || fPrioridade.length > 0 || busca.trim() !== '';

  /** As opções vêm do que existe nas tarefas, e não de listas fixas: filtro que
   *  oferece valor sem resultado é ruído. O valor é o id, e o nome é só o
   *  rótulo - duas pessoas ou duas entregas podem ter o mesmo nome. */
  const opcoes = useMemo(() => {
    const porNome = (a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, 'pt-BR');
    const donos = [...new Set(todas.flatMap(t => t.responsaveis ?? []))]
      .map(id => ({ value: id, label: pessoas.find(p => p.id === id)?.nome ?? '' }))
      .filter(o => o.label)
      .sort(porNome);
    const titulos = new Map((projeto.entregas ?? []).map(e => [e.id, e.titulo]));
    const entregas = [...new Set(todas.map(t => t.entrega_id).filter((id): id is number => id != null))]
      .map(id => ({ value: String(id), label: titulos.get(id) ?? '' }))
      .filter(o => o.label)
      .sort(porNome);
    const etiquetas = [...new Set(todas.flatMap(t => t.etiquetas ?? []))]
      .map(nome => ({ value: nome, label: nome }))
      .sort(porNome);
    // A prioridade vem da escala da casa, e não do que está nas tarefas: a
    // ordem dela quer dizer alguma coisa, e por nome ela sairia embaralhada.
    const prioridades = PRIORIDADES
      .filter(nivel => todas.some(t => (t.prioridade ?? PRIORIDADE_PADRAO) === nivel))
      .map(nivel => ({ value: nivel as string, label: nivel as string }));
    return { responsavel: donos, entrega: entregas, etiqueta: etiquetas, prioridade: prioridades };
  }, [todas, pessoas, projeto.entregas]);

  const tarefas = useMemo(() => todas.filter(t =>
    // Basta um dos donos casar: quem filtra por uma pessoa quer as tarefas
    // dela, inclusive as que ela divide com outra.
    (fResponsavel.length === 0 || (t.responsaveis ?? []).some(id => fResponsavel.includes(id))) &&
    (fEntrega.length === 0 || fEntrega.includes(String(t.entrega_id))) &&
    (fEtiqueta.length === 0 || (t.etiquetas ?? []).some(e => fEtiqueta.includes(e))) &&
    (fPrioridade.length === 0 || fPrioridade.includes(t.prioridade ?? PRIORIDADE_PADRAO)) &&
    // A busca alcança o título, o descritivo e o nome da entrega: é por esses
    // três que se procura uma tarefa em voz alta.
    (contemTermo(t.titulo, busca) || contemTermo(t.descricao, busca)
      || contemTermo(t.entrega_id != null ? tituloDaEntrega.get(t.entrega_id) : null, busca))
  ), [todas, fResponsavel, fEntrega, fEtiqueta, fPrioridade, busca, tituloDaEntrega]);

  return (
    <section>
      <div className="admin-section-head">
        <p className="admin-section-title">
          Tarefas
          {/* A mesma bolha do cabeçalho das colunas, logo abaixo: é o mesmo
              subtotal, e dois desenhos para a mesma coisa na mesma tela se leem
              como duas coisas. Com filtro, ela diz quantas sobraram de quantas. */}
          <span className="kanban-conta-bolha">
            {temFiltro ? `${tarefas.length}/${todas.length}` : todas.length}
          </span>
        </p>
        {/* Com tarefa na tela o quadro se explica sozinho: contar quantas estão
            em aberto e ensinar a arrastar era dizer em texto o que as colunas
            já mostram. A frase fica só para o quadro vazio, onde não há coluna
            com conteúdo que aponte para o mais. */}
        {todas.length === 0 && (
          <p className="form-hint">
            Nenhuma tarefa ainda. O mais dentro de uma coluna cria a primeira.
          </p>
        )}
      </div>

      {todas.length > 0 && (
        <div className="admin-toolbar painel-kanban-filtros">
          <span className="admin-toolbar-label">Filtrar</span>
          <FilterDropdown label="Responsável" values={fResponsavel} options={opcoes.responsavel}
            onChange={setFResponsavel} />
          <FilterDropdown label="Entrega" values={fEntrega} options={opcoes.entrega}
            onChange={setFEntrega} />
          {opcoes.etiqueta.length > 0 && (
            <FilterDropdown label="Etiqueta" values={fEtiqueta} options={opcoes.etiqueta}
              onChange={setFEtiqueta} />
          )}
          <FilterDropdown label="Prioridade" values={fPrioridade} options={opcoes.prioridade}
            onChange={setFPrioridade} />
          {temFiltro && (
            <button type="button" className="admin-toolbar-limpar surge"
              onClick={() => {
                setFResponsavel([]); setFEntrega([]); setFEtiqueta([]); setFPrioridade([]); setBusca('');
              }}>
              Limpar
            </button>
          )}
          {/* A busca depois dos filtros: eles estreitam o conjunto, e ela varre
              o que sobrou. */}
          <CampoBusca className="painel-kanban-busca" valor={busca} onMudar={setBusca}
            placeholder="Buscar por título, descritivo ou entrega" rotulo="Buscar tarefa" />
        </div>
      )}

      <QuadroDeTarefas
        alto
        tarefas={tarefas}
        etapas={etapas}
        pessoas={pessoas}
        podeEditar={podeEditar}
        entregaDe={t => (t.entrega_id ? tituloDaEntrega.get(t.entrega_id) ?? null : null)}
        onAbrir={onAbrir}
        onCriar={onCriar}
        onExcluir={onExcluir}
        onMover={onMover}
        onFixarRecolhida={onFixarRecolhida} />
    </section>
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
  // Texto, e nao numero: o campo precisa poder ficar vazio enquanto se digita, e
  // vazio vira nulo na gravacao.
  const [prioridade, setPrioridade] = useState(
    inicial?.prioridade == null ? '' : String(inicial.prioridade),
  );
  const [responsaveis, setResponsaveis] = useState<string[]>(inicial?.responsaveis ?? []);
  const [erros, setErros] = useState<Record<string, string>>({});

  function salvar() {
    if (!titulo.trim()) {
      setErros({ titulo: 'Informe o título da entrega.' });
      return;
    }
    // Sem `links`: o campo saiu da tela, e o servidor só reescreve a coluna
    // quando ela vem no corpo.
    const posicao = Number(prioridade);
    onSalvar({ titulo: titulo.trim(), descricao,
      marcador: marcador.trim(), submarcador: submarcador.trim(),
      status, prazo,
      prioridade: prioridade.trim() && Number.isFinite(posicao) && posicao >= 1
        ? Math.round(posicao)
        : null,
      responsaveis });
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
          placeholder="Funil de oportunidades no ar" />
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
        gridTemplateColumns: '220px 120px minmax(0, 1fr)', gap: 10 }}>
        <div className="form-group">
          <label className="form-label">Prazo</label>
          <DatePicker compact allowPast value={prazo} onChange={setPrazo} />
        </div>
        {/* A fila que o cliente definiu para a area: 1 e o que vem primeiro. Se
            repete entre areas de proposito - cada uma prioriza a sua. */}
        <div className="form-group">
          <label className="form-label" htmlFor="entrega-prioridade">Prioridade</label>
          <input id="entrega-prioridade" className="form-input" type="number" min={1} max={999}
            inputMode="numeric" value={prioridade} placeholder="1"
            title="A ordem dentro da area do cliente. Vazio: ainda nao priorizada."
            onChange={e => setPrioridade(e.target.value.replace(/[^0-9]/g, ''))} />
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
/** A prioridade da entrega, editada na propria linha.
 *
 *  E o numero que o cliente manda por planilha e muda de semana em semana:
 *  abrir a ficha da entrega para trocar um digito e caro demais para um gesto
 *  tao repetido. Clicar troca o chip pelo campo, no mesmo lugar e do mesmo
 *  tamanho - e a `.troca` da casa, so opacidade, porque a peca nao nasce nem
 *  some, muda de cara.
 *
 *  Enter grava, Escape desiste, e sair do campo grava tambem: quem digita e
 *  clica na proxima linha nao esta cancelando, esta seguindo. Campo vazio grava
 *  nulo, que e "ainda nao priorizada".
 *
 *  Sem prioridade, o chip so aparece quando o mouse entra na linha: uma lista de
 *  oitenta entregas sem fila nao precisa de oitenta lugares vazios pedindo
 *  numero. Quem le pelo teclado chega nele pelo Tab, que e o que o `:focus`
 *  tambem revela. */
function PrioridadeDaEntrega({ entrega, somenteLeitura, onDefinir }: {
  entrega: Entrega;
  somenteLeitura: boolean;
  onDefinir: (prioridade: number | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  /** O mesmo texto, para o `onBlur` ler. Sair do campo no mesmo quadro em que a
   *  ultima tecla entrou fazia a gravacao ver o valor anterior, e o numero
   *  recem-digitado se perdia. */
  const digitado = useRef('');
  const campo = useRef<HTMLInputElement>(null);

  // O foco vai para o campo quando ele nasce, e o texto ja entra marcado: a
  // primeira tecla troca o numero, em vez de escrever ao lado dele.
  useEffect(() => { if (editando) { campo.current?.focus(); campo.current?.select(); } }, [editando]);

  function gravar() {
    if (!editando) return;
    setEditando(false);
    const valor = digitado.current;
    const numero = Number(valor);
    const novo = valor.trim() && Number.isFinite(numero) && numero >= 1 ? Math.round(numero) : null;
    if (novo !== entrega.prioridade) onDefinir(novo);
  }

  if (somenteLeitura) {
    return entrega.prioridade != null ? (
      <span className="entrega-prioridade" title={`Prioridade ${entrega.prioridade} dentro da área`}>
        {entrega.prioridade}
      </span>
    ) : null;
  }

  if (editando) {
    return (
      <input
        ref={campo}
        className="entrega-prioridade entrega-prioridade-campo troca"
        type="text"
        inputMode="numeric"
        maxLength={3}
        value={texto}
        aria-label={`Prioridade de ${entrega.titulo}`}
        onClick={ev => ev.stopPropagation()}
        onChange={ev => {
          const limpo = ev.target.value.replace(/[^0-9]/g, '');
          digitado.current = limpo;
          setTexto(limpo);
        }}
        onBlur={gravar}
        onKeyDown={ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); gravar(); }
          if (ev.key === 'Escape') { ev.preventDefault(); setEditando(false); }
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className={`entrega-prioridade entrega-prioridade-botao troca${entrega.prioridade == null ? ' vazia' : ''}`}
      title={entrega.prioridade == null
        ? 'Definir a prioridade desta entrega na fila da área'
        : `Prioridade ${entrega.prioridade} dentro da área. Clique para trocar.`}
      aria-label={entrega.prioridade == null
        ? `Definir a prioridade de ${entrega.titulo}`
        : `Prioridade ${entrega.prioridade} de ${entrega.titulo}`}
      onClick={ev => {
        ev.stopPropagation();
        const atual = entrega.prioridade == null ? '' : String(entrega.prioridade);
        digitado.current = atual;
        setTexto(atual);
        setEditando(true);
      }}
    >
      {entrega.prioridade ?? <IconPlus size={10} />}
    </button>
  );
}

function SecaoEntregas({
  entregas, pendentes, tarefas, onVerTarefasDaEntrega, onCriarTarefa, onAbrirTarefa,
  onExcluirTarefa, onMoverTarefa, onFixarRecolhida, podeEditarTarefa, etapasTarefa,
  pessoas, marcadores, submarcadores,
  salvando, somenteLeitura,
  reunioes, focada, onVincular, onAbrirReuniao,
  onSalvarEntrega, onExcluirEntrega, onAlterarPendentes,
  onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
  onAnexarNaEntrega, onRemoverAnexoDaEntrega, onVerAnexoDaEntrega, onBaixarAnexoDaEntrega,
  naPlanning = false,
}: {
  /** Na folha da Planning, e não na ficha: o projeto já existe, então entrega
   *  nova grava na hora mesmo sendo a primeira, e o título segue o das outras
   *  seções da folha. */
  naPlanning?: boolean;
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
  onAnexarNaEntrega: (entregaId: number, arquivos: FileList) => void;
  onRemoverAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
  onVerAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
  onBaixarAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
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

  /** Troca só o status, preservando o resto da entrega - `salvar_entrega`
   *  regrava a linha inteira. */
  function comStatus(e: Entrega, status: string): EntregaPendente {
    return {
      titulo: e.titulo, descricao: e.descricao ?? '',
      marcador: e.marcador ?? '', submarcador: e.submarcador ?? '', status,
      prazo: e.prazo ?? '', prioridade: e.prioridade, responsaveis: e.responsaveis,
    };
  }

  /** Troca só a prioridade, preservando o resto - `salvar_entrega` regrava a
   *  linha inteira, como no `comStatus`. */
  function comPrioridade(e: Entrega, prioridade: number | null): EntregaPendente {
    return { ...comStatus(e, e.status), prioridade };
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

  const gravado = naPlanning || entregas.length > 0;
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
    // Sem prioridade vai para o fim: a entrega que o cliente ainda nao colocou
    // na fila nao se mistura com a primeira dela.
    if (ordem === 'prioridade') {
      copia.sort((a, b) => (a.prioridade ?? 9999) - (b.prioridade ?? 9999) || a.ordem - b.ordem);
    }
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
    <section className={naPlanning ? 'pl-secao pl-entregas' : undefined}>
      <div className="admin-section-head">
        {naPlanning ? (
          <p className="pl-secao-titulo">
            Entregas
            {total > 0 && (
              <span className="kanban-conta-bolha">
                {busca.trim() ? `${visiveis.length}/${total}` : total}
              </span>
            )}
          </p>
        ) : (
          <p className="admin-section-title">
            Entregas *
            {total > 0 && (
              <span style={{ marginLeft: 6, fontWeight: 600 }}>
                ({busca.trim() ? `${visiveis.length} de ${total}` : total})
              </span>
            )}
          </p>
        )}
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
          {naPlanning ? 'Nenhuma entrega neste projeto.' : 'Nenhuma entrega. O projeto precisa de ao menos uma.'}
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

                  {/* A fila que o cliente definiu para a area desta entrega,
                      trocada na propria linha. */}
                  <PrioridadeDaEntrega entrega={e} somenteLeitura={somenteLeitura}
                    onDefinir={n => onSalvarEntrega(comPrioridade(e, n), e.id)} />

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
                              <ChipReuniao key={r.id}
                                assunto={r.assunto}
                                data={fmtDataCurta(r.data)}
                                fireflies={!!r.fireflies_id}
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

                        <AnexosDaEntrega
                          entregaId={e.id}
                          arquivos={e.arquivos ?? []}
                          somenteLeitura={somenteLeitura}
                          onAnexar={onAnexarNaEntrega}
                          onRemover={onRemoverAnexoDaEntrega}
                          onVer={onVerAnexoDaEntrega}
                          onBaixar={onBaixarAnexoDaEntrega} />

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
                          <QuadroDeTarefas
                            tarefas={daEntrega}
                            etapas={etapasTarefa}
                            pessoas={pessoas}
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

      {excluindoEntrega && (
        <Dialogo
          titulo="Excluir entrega"
          descricao={<>
            Tem certeza que deseja excluir "<strong>{excluindoEntrega.titulo}</strong>"?
            {excluindoEntrega.evidencias.length > 0 && (
              <>
                {' '}As {excluindoEntrega.evidencias.length === 1
                  ? 'evidência anexada vai junto'
                  : `${excluindoEntrega.evidencias.length} evidências anexadas vão junto`}.
              </>
            )}
          </>}
          rotuloOk="Excluir" ocupado={salvando}
          onFechar={() => setExcluindoEntrega(null)}
          onConfirmar={() => { const alvo = excluindoEntrega; setExcluindoEntrega(null); onExcluirEntrega(alvo); }}
        />
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
 *  abre a lista, e o desenho escolhido fica ali. A peça é a `MarcoDeStatus`,
 *  a mesma dos objetivos da semana; aqui ficam as escolhas da entrega. */
function MarcoEntrega({ status, onEscolher }: {
  status: string;
  onEscolher: (v: string) => void;
}) {
  // Estado escolhido a mão ganha uma linha a mais, para desfazer: sem ela, quem
  // pôs a entrega em triagem não teria como devolvê-la ao automático.
  const naMao = ESCOLHAS_DO_MARCO.includes(status as typeof ESCOLHAS_DO_MARCO[number]);
  const opcoes = [
    ...ESCOLHAS_DO_MARCO.map(valor => ({ valor })),
    ...(naMao ? [{ valor: ENTREGA_PLANEJADA, rotulo: 'Reabrir', nota: 'volta ao estado automático' }] : []),
  ];
  return (
    <MarcoDeStatus status={status} opcoes={opcoes} cores={COR_ENTREGA} icones={ICONE_ENTREGA}
      nome="Etapa da entrega" onEscolher={onEscolher} />
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

  /* O print da conversa com o cliente, colado com Ctrl+V, entra junto dos que
     já estavam escolhidos - é a prova mais comum, e abrir o explorador para
     achar um recorte que acabou de ser feito é volta à toa. O ouvinte fica no
     documento enquanto o diálogo vive: ele é modal, e o foco pode estar no
     botão e não no comentário. Texto colado no comentário segue sendo texto. */
  useEffect(() => {
    const aoColar = (e: ClipboardEvent) => {
      const colados = arquivosColados(e.clipboardData);
      if (!colados.length) return;
      e.preventDefault();
      setEscolhidos(atual => {
        // FileList não se monta à mão; o DataTransfer é o que devolve uma.
        const juntos = new DataTransfer();
        for (const f of [...Array.from(atual ?? []), ...colados]) juntos.items.add(f);
        return juntos.files;
      });
    };
    document.addEventListener('paste', aoColar);
    return () => document.removeEventListener('paste', aoColar);
  }, []);

  return (
    <Dialogo
      titulo={alvo === ENTREGA_ENTREGUE ? 'Marcar como entregue' : 'Marcar como validada'}
      descricao={alvo === ENTREGA_ENTREGUE
        ? <>"<strong>{entrega.titulo}</strong>" só é dada como entregue com a prova do que foi enviado ao cliente.</>
        : <>"<strong>{entrega.titulo}</strong>" só é dada como validada com o aceite do cliente anexado.</>}
      rotuloOk={alvo === ENTREGA_ENTREGUE ? 'Anexar e entregar' : 'Anexar e validar'}
      ocupado={!escolhidos?.length || salvando} ocupadoRotulo={salvando ? 'Salvando…' : undefined}
      corOk={COR_ENTREGA[alvo]}
      largura={400}
      onFechar={onFechar}
      onConfirmar={() => escolhidos && void onConcluir(escolhidos, comentario.trim())}
    >

        <input ref={input} type="file" multiple hidden
          onChange={e => setEscolhidos(e.target.files)} />

        <button type="button" className="secao-add"
          style={{ width: '100%', height: 38, gap: 7, borderRadius: 'var(--radius-md)',
            fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600 }}
          onClick={() => input.current?.click()}>
          <IconPlus size={14} />
          {nomes.length ? 'Trocar arquivo' : 'Escolher evidência'}
        </button>
        <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '6px 0 0', textAlign: 'center' }}>
          ou cole um print com Ctrl+V
        </p>

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

    </Dialogo>
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
                      descricoes={DESCRICAO_PAPEL}
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


// ── Aba Planning ────────────────────────────────────────────────────────────
//
//  A reunião de planejamento da semana, e não um relatório: a tela existe para
//  ser percorrida em voz alta com o time, um projeto de cada vez.
//
//  A navegação é a de uma agenda de divisórias - as abas empilhadas na borda
//  esquerda, uma por projeto, e a folha do escolhido encostada nelas. Era uma
//  revista de rolagem contínua, com todos os projetos um abaixo do outro; numa
//  reunião isso obrigava a procurar onde se estava a cada troca de assunto, e
//  não dizia quantos ainda faltavam.
//
//  Cada folha tem três coisas, nesta ordem, que é a da conversa:
//
//   1. A SEMANA - o backlog do projeto ao lado dos cinco dias úteis. Os devs
//      puxam do backlog o que entra em cada dia, e o gesto grava o prazo.
//   2. O COMBINADO - destaques e reuniões da semana, escritos ali na hora e
//      gravados por projeto e por semana, para a planning seguinte poder abrir
//      a anterior.
//   3. OS PONTOS DE ATENÇÃO - o que está fora do lugar, que é o assunto que
//      sobra depois de a semana estar montada.

/** Semana é o passo do acompanhamento: define o que é leitura velha, o recorte
 *  da atividade recente e a janela do que está planejado. */
const DIAS_DA_SEMANA = 7;

/** Avisa a quem estiver ouvindo (o quadro de objetivos do cabeçalho) que a
 *  Planning acabou de gravar. */
export const EVENTO_PLANNING_GRAVADA = 'planning:gravada';

/** A segunda-feira da semana de uma data, ou a desta semana. A semana da casa
 *  começa na segunda, e é ela que o quadro mostra - não uma janela móvel de
 *  sete dias, que na quarta arrastaria metade da semana passada junto. */
function segundaDaSemana(base?: Date): Date {
  const d = base ? new Date(base) : new Date();
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

/** O domingo que fecha a semana dos cinco dias úteis recebidos. */
function domingoDepoisDe(dias: string[]): string {
  const d = new Date(`${dias[dias.length - 1]}T12:00:00`);
  d.setDate(d.getDate() + 2);
  return iso10(d);
}

/** Dentro da semana cujos dias úteis são estes - o fim de semana incluído, que
 *  é quando parte do trabalho acaba sendo concluída. */
const dentroDaSemana = (iso: string | undefined | null, dias: string[]) => {
  if (!iso || dias.length === 0) return false;
  const dia = diaLocal(iso);
  return dia >= dias[0] && dia <= domingoDepoisDe(dias);
};

/** A data local em texto. Montada a partir dos componentes, e não por
 *  `toISOString`, que converte para UTC: a leste de Greenwich a meia-noite
 *  local cai no dia anterior em UTC, e o dia inteiro sairia deslocado. */
const iso10 = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hojeIso = () => iso10(new Date());

/** Segunda a sexta da semana pedida, em ISO. É a régua do quadro: as colunas,
 *  o que conta como "da semana" e o que sobra para o rodapé do fim de semana. */
function diasUteisDaSemana(segunda: Date): string[] {
  const s = segundaDaSemana(segunda);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(s);
    d.setDate(d.getDate() + i);
    return iso10(d);
  });
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

/**
 * A folha de um projeto na Planning: o que a sala olha enquanto fala dele.
 *
 * A ordem é a da reunião, e não a do banco: primeiro a semana, que é o que se
 * monta ali na hora; depois o que ficou combinado; e por último o que está fora
 * do lugar, que é o assunto que sobra quando a semana já foi fechada.
 */
function FolhaDaPlanning({ projeto: p, semana, dias, pessoas, planning, podeEditar,
  podeEditarTarefa, podeExcluirTarefa, etapas, etapaDeEntrada, etapaDeConclusao, onAbrir,
  onAbrirTarefa, onSalvarTarefa, onExcluirTarefa, onMudarPlanning, onCriarTarefa, entregas,
  provas }: {
  /** Como prender um print a um objetivo desta folha. */
  provas?: ProvasDosObjetivos;
  projeto: Projeto;
  /** A seção de entregas do projeto, montada pela página, que é quem tem os
   *  gestos de gravar entrega, evidência e anexo. */
  entregas: React.ReactNode;
  /** A segunda-feira da semana em foco. */
  semana: Date;
  dias: string[];
  pessoas: Pessoa[];
  planning: PlanningDaSemana;
  /** Escrever o combinado é `projetos:editar`. */
  podeEditar: boolean;
  /** Puxar tarefa para a semana é `tarefas:editar`, que é outra. */
  podeEditarTarefa: boolean;
  podeExcluirTarefa: boolean;
  etapas: EtapaTarefa[];
  onExcluirTarefa: (t: Tarefa) => void;
  etapaDeEntrada: string;
  etapaDeConclusao: string;
  onAbrir: (p: Projeto) => void;
  onAbrirTarefa: (t: Tarefa, p: Projeto) => void;
  onSalvarTarefa: (t: Tarefa, mudancas: Record<string, unknown>) => void;
  /** Só os objetivos: a prova entra por caminho próprio, e a folha não a
   *  regrava a cada tecla. */
  onMudarPlanning: (dados: { objetivos: ObjetivoDaSemana[] }) => void;
  onCriarTarefa: (status: string) => void;
}) {
  const gestor = p.equipe.find(m => m.papel === 'Gestor');
  const ehGeral = p.id === PROJETO_GERAL;

  return (
    <div className="pl-folha troca" key={`${p.id}|${iso10(semana)}`}>
      <header className="pl-cabeca">
        {/* A Geral não é projeto: sem ficha para abrir, sem cliente e sem time. O
            que ela diz no alto é para que serve. */}
        {ehGeral ? (
          <div className="pl-quem">
            <h2>{p.nome}</h2>
            <p className="pl-meta">Demandas da casa que não são de um projeto</p>
          </div>
        ) : (
        <div className="pl-quem">
          <h2>
            <button type="button" onClick={() => onAbrir(p)} title="Abrir a ficha do projeto">
              {p.nome}
            </button>
          </h2>
          <p className="pl-meta">
            {p.cliente_nome ?? 'Sem cliente'}
            <span className="nt-sep">·</span>
            {gestor
              ? <PessoaFoto nome={gestor.nome} id={gestor.id} equipe={p.equipe} tamanho={17} />
              : <span className="nt-vazio">Sem gestor</span>}
            {/* O resto do time em pilha, ao lado do gestor: na planning eles
                sao a conferencia de quem esta na sala, e a pilha diz isso sem
                ocupar uma linha propria no pe da folha. */}
            {p.equipe.some(m => m.id !== gestor?.id) && (
              <>
                <span className="nt-sep">·</span>
                <DonosDaTarefa ids={p.equipe.filter(m => m.id !== gestor?.id).map(m => m.id)}
                  pessoas={p.equipe} size={20} />
              </>
            )}
          </p>
        </div>
        )}

        {/* Só o progresso. As contagens de tarefas saíram: quem está na
            reunião tem o quadro da semana logo abaixo, com as mesmas tarefas
            à vista, e quatro números repetindo o que se vê ali eram peso sem
            resposta nova. O progresso fica, porque ele é das entregas e não
            está desenhado em lugar nenhum da folha.
            A Geral não tem entrega, e aí não sobra número nenhum. */}
        {!ehGeral && (
          <div className="pl-numeros">
            <span className="pl-numero pl-numero-progresso" title="Entregas validadas">
              <strong>{progressoDe(p)}%</strong>
              <span className="nt-progresso-barra"><span style={{ width: `${progressoDe(p)}%` }} /></span>
            </span>
          </div>
        )}
      </header>

      {/* Os objetivos vêm antes do quadro: a planning começa pelo que a semana
          precisa entregar, e só então decide que tarefa entra em que dia. Com
          o quadro na frente, a sala montava a semana antes de dizer para quê. */}
      <section className="pl-secao pl-combinado">
        <p className="pl-secao-titulo">
          Objetivos da semana
          {planning.objetivos.length > 0 && (
            <span className="kanban-conta-bolha">
              {planning.objetivos.filter(o => o.feito).length}/{planning.objetivos.length}
            </span>
          )}
        </p>
        <ObjetivosDaPlanning
          projetoId={p.id}
          valores={planning.objetivos}
          somenteLeitura={!podeEditar}
          pessoas={pessoas}
          placeholder="O que precisa acontecer nesta semana"
          provas={podeEditar ? provas : undefined}
          onChange={v => onMudarPlanning({ objetivos: v })} />
      </section>

      {/* O quadro do projeto, nas etapas do quadro de tarefas - o mesmo da ficha,
          com a mesma busca e os mesmos filtros. Eram as colunas dos cinco dias,
          e o que a sala pergunta olhando para a semana e em que pe esta cada
          tarefa, que e o que a etapa responde. Arrastar aqui muda a etapa. */}
      <section className="pl-secao pl-secao-quadro">
        <TarefasDoProjeto
          projeto={p}
          etapas={etapas}
          pessoas={pessoas}
          podeEditar={podeEditarTarefa}
          onAbrir={x => onAbrirTarefa(x, p)}
          onCriar={status => onCriarTarefa(status)}
          onExcluir={onExcluirTarefa}
          onMover={(t, status) => onSalvarTarefa(t, { status })} />
      </section>

      {/* As entregas do projeto, a mesma seção da ficha, com tudo o que ela
          faz: a planning decide a semana olhando para o que o projeto tem de
          entregar, e sair para a ficha a cada pergunta partiria a reunião. */}
      {entregas}

    </div>
  );
}

// ── A folha do Funil ────────────────────────────────────────────────────────

/** Uma oportunidade, no recorte que a folha do Funil desenha. Vem da mesma
 *  leitura do quadro do Funil (`board`). */
export interface OportunidadeDoFunil {
  id: string;
  empresa: string | null;
  contato_nome: string | null;
  interesse: string | null;
  valor_estimado: number | null;
  parcelas: number | null;
  responsavel_nome: string | null;
  responsavel_foto: string | null;
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  created_at: string;
  current_status_id: number | null;
  status_since: string | null;
}

/** Uma etapa do funil. `is_conversion` é a de ganho e `is_excluded` a de perda. */
export interface EtapaDoFunil {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  descricao?: string | null;
  is_conversion?: number | null;
  is_excluded?: number | null;
}

/** As duas reuniões da Planning: a dos projetos e a do comercial. */
type SecaoDaPlanning = 'projetos' | 'objetivos' | 'comercial';

/** O que a página leu do funil. `carregando` enquanto a leitura vai; `erro`
 *  quando ela não veio. */
export interface FunilDaPlanning {
  carregando: boolean;
  erro?: string;
  etapas: EtapaDoFunil[];
  oportunidades: OportunidadeDoFunil[];
}

const valorEmReais = (v: number | null | undefined) => (v == null ? '-'
  : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));

/** As contas da semana sobre o funil, que servem à folha e ao número da aba. */
function contasDoFunil(funil: FunilDaPlanning, dias: string[]) {
  const inicio = dias[0];
  const fim = domingoDepoisDe(dias);
  const hoje = hojeIso();
  const fechada = new Set(funil.etapas
    .filter(e => Number(e.is_conversion) === 1 || Number(e.is_excluded) === 1).map(e => Number(e.id)));
  const ganho = new Set(funil.etapas.filter(e => Number(e.is_conversion) === 1).map(e => Number(e.id)));
  // A data da próxima ação é só dia, sem hora: compara como texto. O resto é
  // carimbo com hora, e vira o dia local antes de comparar.
  const naSemana = (dia: string | null | undefined) => !!dia && dia >= inicio && dia <= fim;
  const abertas = funil.oportunidades.filter(o => !fechada.has(Number(o.current_status_id)));
  return {
    fechada,
    abertas,
    novas: funil.oportunidades.filter(o => naSemana(diaLocal(o.created_at))).length,
    acoesNaSemana: abertas.filter(o => naSemana(o.proxima_acao_em)).length,
    atrasadas: abertas.filter(o => !!o.proxima_acao_em && o.proxima_acao_em < hoje).length,
    ganhas: funil.oportunidades
      .filter(o => ganho.has(Number(o.current_status_id)) && naSemana(diaLocal(o.status_since))).length,
    valorAberto: abertas.reduce((soma, o) => soma + (Number(o.valor_estimado) || 0), 0),
    /** Chegou à etapa de ganho ou de perda nesta semana: é o resultado que a
     *  sala confere, e o que ficou para trás já foi conferido antes. */
    fechouNaSemana: (o: OportunidadeDoFunil) => naSemana(diaLocal(o.status_since)),
  };
}

/**
 * A folha do Funil na Planning: o combinado comercial da semana.
 *
 * Os objetivos são os mesmos das folhas de projeto, gravados por semana. O
 * quadro é o do Funil, só para ler: as etapas abertas com todas as
 * oportunidades, e as de ganho e perda só com o que chegou lá nesta semana.
 * Mexer num card é trabalho do Funil, e o clique leva até lá com ele aberto -
 * duas telas movendo o mesmo card seriam dois lugares para desencontrar.
 */
function FolhaDoFunil({ semana, dias, funil, planning, pessoas, podeEditar,
  onMudarPlanning, onAbrirOportunidade, provas }: {
  /** Como prender um print a um objetivo desta folha. */
  provas?: ProvasDosObjetivos;
  semana: Date;
  dias: string[];
  funil: FunilDaPlanning;
  planning: PlanningDaSemana;
  /** Quem pode responder por um objetivo da semana do comercial. */
  pessoas: Pessoa[];
  podeEditar: boolean;
  /** Só os objetivos: a prova entra por caminho próprio, e a folha não a
   *  regrava a cada tecla. */
  onMudarPlanning: (dados: { objetivos: ObjetivoDaSemana[] }) => void;
  onAbrirOportunidade?: (id: string) => void;
}) {
  const contas = contasDoFunil(funil, dias);
  const hoje = hojeIso();
  const etapas = [...funil.etapas].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="pl-folha troca" key={`funil|${iso10(semana)}`}>
      <header className="pl-cabeca">
        <div className="pl-quem">
          <h2>Funil</h2>
          <p className="pl-meta">
            As oportunidades comerciais, {valorEmReais(contas.valorAberto)} em aberto
          </p>
        </div>
        <div className="pl-numeros">
          <span className="pl-numero"><strong>{contas.abertas.length}</strong><small>em aberto</small></span>
          <span className="pl-numero"><strong>{contas.novas}</strong><small>novas</small></span>
          <span className="pl-numero"><strong>{contas.acoesNaSemana}</strong><small>ações na semana</small></span>
          <span className={`pl-numero${contas.atrasadas ? ' alerta' : ''}`}>
            <strong>{contas.atrasadas}</strong><small>ações atrasadas</small>
          </span>
          <span className="pl-numero"><strong>{contas.ganhas}</strong><small>ganhas</small></span>
        </div>
      </header>

      <section className="pl-secao pl-combinado">
        <p className="pl-secao-titulo">
          Objetivos da semana
          {planning.objetivos.length > 0 && (
            <span className="kanban-conta-bolha">
              {planning.objetivos.filter(o => o.feito).length}/{planning.objetivos.length}
            </span>
          )}
        </p>
        <ObjetivosDaPlanning
          projetoId={PLANNING_FUNIL}
          valores={planning.objetivos}
          somenteLeitura={!podeEditar}
          pessoas={pessoas}
          placeholder="O que o comercial precisa fazer andar nesta semana"
          provas={podeEditar ? provas : undefined}
          onChange={v => onMudarPlanning({ objetivos: v })} />
      </section>

      <section className="pl-secao">
        <p className="pl-secao-titulo">
          O funil
          <span className="kanban-conta-bolha">{contas.abertas.length}</span>
        </p>
        {funil.carregando && funil.oportunidades.length === 0 ? (
          <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
        ) : funil.erro ? (
          <p className="nt-vazio">{funil.erro}</p>
        ) : (
          <div className="kanban-board painel-kanban pl-funil">
            {etapas.map(etapa => {
              const fechada = contas.fechada.has(Number(etapa.id));
              const cards = funil.oportunidades
                .filter(o => Number(o.current_status_id) === Number(etapa.id)
                  && (!fechada || contas.fechouNaSemana(o)))
                // A ação mais próxima na frente, e sem ação no fim: é a ordem em
                // que a sala passa pelos cards.
                .sort((a, b) => (a.proxima_acao_em || '9999-12-31').localeCompare(b.proxima_acao_em || '9999-12-31'));
              return (
                <div key={etapa.id} className="kanban-column" style={{ ['--col-color' as string]: etapa.cor }}>
                  <div className="kanban-column-header">
                    <div className="kanban-column-title" title={etapa.descricao ?? undefined}>
                      <span className="kanban-dot" style={{ background: etapa.cor }} />
                      {etapa.nome}
                    </div>
                    <span className="kanban-conta-bolha">{cards.length}</span>
                  </div>
                  {fechada && <p className="pl-funil-nota">Só as desta semana</p>}
                  <div className="kanban-column-body">
                    {cards.map(o => {
                      const atrasada = !!o.proxima_acao_em && o.proxima_acao_em < hoje && !fechada;
                      return (
                        <button key={o.id} type="button" className="kanban-card pl-funil-card"
                          style={{ ['--col-color' as string]: etapa.cor }}
                          title={onAbrirOportunidade ? 'Abrir no Funil' : undefined}
                          disabled={!onAbrirOportunidade}
                          onClick={() => onAbrirOportunidade?.(o.id)}>
                          <p className="kanban-card-title">{o.empresa ?? '-'}</p>
                          {(o.contato_nome || o.interesse) && (
                            <p className="kanban-card-sub">
                              {[o.contato_nome, o.interesse].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <div className="kanban-card-meta">
                            <span className="kanban-card-value">
                              {valorEmReais(o.valor_estimado)}
                              {o.parcelas != null && o.parcelas > 0 && (
                                <span className="kanban-card-parcelas">
                                  {o.parcelas === 1 ? 'à vista' : `${o.parcelas}x`}
                                </span>
                              )}
                            </span>
                            {o.responsavel_nome && (
                              <span className="kanban-card-meta-fim" title={o.responsavel_nome}>
                                <Avatar nome={o.responsavel_nome} foto={o.responsavel_foto} size={20} />
                              </span>
                            )}
                          </div>
                          {o.proxima_acao && (
                            <p className={`oportunidade-proxima${atrasada ? ' atrasada' : ''}`}>
                              <IconCalendario size={11} />
                              <span>{o.proxima_acao}</span>
                              {o.proxima_acao_em && <em>{fmtData(o.proxima_acao_em).slice(0, 5)}</em>}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/** O objetivo e onde ele está na lista gravada. A tela desenha em árvore - a
 *  mãe e, logo abaixo, os filhos -, mas a lista de verdade é plana, e é pelo
 *  índice nela que o campo, o foco e a gravação se acham. */
interface NoDoObjetivo { v: ObjetivoDaSemana; i: number; filha: boolean }

/**
 * A lista em árvore: cada objetivo solto, na ordem gravada, e sob ele os que
 * nasceram dele, também na ordem gravada. Filho cuja mãe sumiu (ou é ela
 * mesma filha de alguém) é desenhado solto - é o que o servidor faz com ele na
 * próxima gravação.
 */
function emArvore(valores: ObjetivoDaSemana[]): NoDoObjetivo[] {
  const maes = new Set(valores.filter(v => !v.pai).map(v => v.id));
  const eFilha = (v: ObjetivoDaSemana) => !!v.pai && v.pai !== v.id && maes.has(v.pai);
  const nos: NoDoObjetivo[] = [];
  valores.forEach((v, i) => {
    if (eFilha(v)) return;
    nos.push({ v, i, filha: false });
    valores.forEach((f, k) => { if (eFilha(f) && f.pai === v.id) nos.push({ v: f, i: k, filha: true }); });
  });
  return nos;
}

/** A família de um objetivo solto: ele e os filhos, na ordem gravada. */
const familiaDe = (valores: ObjetivoDaSemana[], id: string) =>
  valores.filter(v => v.id === id || v.pai === id);

/**
 * Os objetivos da semana, em checklist: uma linha por objetivo, Enter abre a
 * seguinte, a linha vazia sai sozinha ao perder o foco, e a caixinha marca o
 * que foi cumprido.
 *
 * É o mesmo gesto do checklist da tarefa, e não um campo de texto corrido: o
 * que se combina numa planning é uma lista de coisas, e a planning seguinte
 * abre esta semana para conferir o que andou - a marca é essa conferência.
 */
function ObjetivosDaPlanning({ projetoId, valores, placeholder, somenteLeitura, pessoas, provas, onChange }: {
  /** De que folha é a lista: é para lá que a troca de semana vai. */
  projetoId: string;
  valores: ObjetivoDaSemana[];
  placeholder: string;
  somenteLeitura: boolean;
  /** Quem pode responder por um objetivo. Na folha do projeto é o time dele; na
   *  do comercial, quem tem acesso ao painel. */
  pessoas: Pessoa[];
  /** Como prender um print à linha. Ausente em folha que não grava. */
  provas?: ProvasDosObjetivos;
  onChange: (v: ObjetivoDaSemana[]) => void;
}) {
  const campos = useRef<Array<HTMLInputElement | null>>([]);
  /** A semana em foco: é dela a sexta com que todo objetivo nasce, e uma data
   *  fora dela leva o objetivo embora. */
  const semanaDaPlanning = useContext(SemanaDaPlanningCtx);
  const sexta = semanaDaPlanning ? sextaDaSemana(semanaDaPlanning.segunda) : null;

  /** A data nova da linha. Na mesma semana, é só a data; em outra, o objetivo
   *  vai para aquela semana e sai desta - os filhos que ele tinha ficam, soltos. */
  const mudarData = (i: number, data: string) => {
    if (!data) return;
    const v = valores[i];
    if (!semanaDaPlanning || segundaDaData(data) === semanaDaPlanning.segunda) {
      trocar(i, { prazo: data });
      return;
    }
    const restante = valores
      .filter((_, k) => k !== i)
      .map(x => (x.pai === v.id ? { ...x, pai: null } : x));
    semanaDaPlanning.mover(projetoId, { ...v, prazo: data, pai: null }, restante);
  };
  /** O seletor de arquivo, um só para a lista inteira: qual linha vai receber é
   *  dito na hora de abrir. Um `input` por linha encheria a folha de campos
   *  invisíveis. */
  const escolher = useRef<HTMLInputElement | null>(null);
  const linhaDoAnexo = useRef<string | null>(null);
  const provasDe = (objetivoId: string) =>
    (provas?.lista ?? []).filter(e => e.objetivo_id === objetivoId);
  /** A linha que acabou de nascer, para o foco ir até ela depois da pintura. */
  const nova = useRef<number | null>(null);
  /** A linha levada pelo punho, e onde ela vai cair. */
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ id: string; pos: 'antes' | 'depois' } | null>(null);
  /** Cada linha pelo id, e onde ela estava antes da troca de ordem: é o que
   *  deixa a linha deslizar até o lugar novo em vez de saltar para ele. */
  const porId = useRef(new Map<string, HTMLDivElement>());
  const antes = useRef<Map<string, DOMRect> | null>(null);
  const ordem = valores.map(v => v.id).join('|');

  useEffect(() => {
    if (nova.current === null) return;
    campos.current[nova.current]?.focus();
    nova.current = null;
  });

  useLayoutEffect(() => {
    const velhas = antes.current;
    antes.current = null;
    if (!velhas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [id, el] of porId.current) {
      const de = velhas.get(id);
      if (!de) continue;
      const dy = de.top - el.getBoundingClientRect().top;
      if (!dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight;
      el.style.transition = 'transform var(--transition-spring)';
      el.style.transform = '';
      const limpar = () => { el.style.transition = ''; el.removeEventListener('transitionend', limpar); };
      el.addEventListener('transitionend', limpar);
    }
  }, [ordem]);

  const trocar = (i: number, mudanca: Partial<ObjetivoDaSemana>) =>
    onChange(valores.map((v, k) => (k === i ? { ...v, ...mudanca } : v)));

  /** Uma linha nova depois de outra. Depois de um filho, nasce um irmão (o
   *  Enter de quem está listando ajustes continua listando ajustes); depois de
   *  uma mãe, o novo solto entra depois da família inteira, para não cair no
   *  meio dos filhos dela. */
  const inserir = (depoisDe: number) => {
    const base = valores[depoisDe];
    if (base?.pai) { desdobrar(depoisDe); return; }
    let ate = depoisDe;
    if (base) valores.forEach((v, k) => { if (v.pai === base.id && k > ate) ate = k; });
    const lista = [...valores];
    lista.splice(ate + 1, 0, {
      id: novoIdDeObjetivo(), texto: '', feito: false, prazo: sexta, responsaveis: [], pai: null,
    });
    nova.current = ate + 1;
    onChange(lista);
  };

  /** Um objetivo que nasce de outro: o ajuste que a validação pediu. Entra
   *  depois do último filho da mãe, com os responsáveis dela, e o foco vai
   *  para ele. Desdobrar um filho cria um irmão: um nível só. */
  const desdobrar = (de: number) => {
    const origem = valores[de];
    if (!origem) return;
    const mae = origem.pai ? (valores.find(v => v.id === origem.pai) ?? origem) : origem;
    let ate = valores.findIndex(v => v.id === mae.id);
    valores.forEach((v, k) => { if (v.pai === mae.id && k > ate) ate = k; });
    const lista = [...valores];
    lista.splice(ate + 1, 0, {
      id: novoIdDeObjetivo(), texto: '', feito: false, prazo: sexta,
      responsaveis: [...mae.responsaveis], pai: mae.id,
    });
    nova.current = ate + 1;
    onChange(lista);
  };

  /** O "+" do fim da lista: sempre um objetivo solto, no fim. Pelo `inserir`,
   *  com um filho por último, ele viraria mais um desdobramento. */
  const inserirNoFim = () => {
    nova.current = valores.length;
    onChange([...valores, {
      id: novoIdDeObjetivo(), texto: '', feito: false, prazo: sexta, responsaveis: [], pai: null,
    }]);
  };

  /** Apagar a mãe solta os filhos: eles continuam valendo, só deixam de
   *  descer de alguém. */
  const remover = (i: number) => {
    const saindo = valores[i];
    onChange(valores
      .filter((_, k) => k !== i)
      .map(v => (saindo && v.pai === saindo.id ? { ...v, pai: null } : v)));
  };

  /** Grava a ordem nova, guardando antes onde cada linha estava. */
  const reordenar = (lista: ObjetivoDaSemana[]) => {
    if (lista.map(v => v.id).join('|') === ordem) return;
    antes.current = new Map([...porId.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
    onChange(lista);
  };

  /** Solta a linha levada. Um filho só troca de lugar entre os irmãos: ele é
   *  desenhado sob a mãe, e soltá-lo em outra família não o mudaria de mãe.
   *  Uma mãe leva a família junto, e cai antes ou depois da família de quem
   *  estava embaixo dela. */
  const soltar = (alvoId: string) => {
    const origem = valores.find(v => v.id === arrastando);
    const pos = sobre?.pos ?? 'antes';
    setArrastando(null);
    setSobre(null);
    const alvo = valores.find(v => v.id === alvoId);
    if (!origem || !alvo || origem.id === alvoId) return;
    if (origem.pai) {
      if (alvo.pai !== origem.pai) return;
      const lista = valores.filter(v => v.id !== origem.id);
      const para = lista.findIndex(v => v.id === alvoId);
      lista.splice(pos === 'antes' ? para : para + 1, 0, origem);
      reordenar(lista);
      return;
    }
    const maeDoAlvo = alvo.pai ?? alvo.id;
    if (maeDoAlvo === origem.id) return;
    const bloco = familiaDe(valores, origem.id);
    const resto = valores.filter(v => !bloco.includes(v));
    const familiaAlvo = familiaDe(resto, maeDoAlvo);
    const ancora = pos === 'antes' && !alvo.pai ? familiaAlvo[0] : familiaAlvo[familiaAlvo.length - 1];
    const para = resto.indexOf(ancora) + (pos === 'antes' && !alvo.pai ? 0 : 1);
    resto.splice(para, 0, ...bloco);
    reordenar(resto);
  };

  /** Alt com a seta leva a linha junto: arrastar não pode ser o único jeito de
   *  arrumar a ordem, e quem está escrevendo não quer largar o teclado. */
  const moverPorTecla = (i: number, passo: number) => {
    const atual = valores[i];
    if (!atual) return;
    // Filho troca com o irmão vizinho; mãe troca de lugar com a família
    // vizinha, levando a dela junto.
    if (atual.pai) {
      const irmaos = valores.map((v, k) => ({ v, k })).filter(x => x.v.pai === atual.pai);
      const aqui = irmaos.findIndex(x => x.k === i);
      const outro = irmaos[aqui + passo];
      if (!outro) return;
      const lista = [...valores];
      [lista[i], lista[outro.k]] = [lista[outro.k], lista[i]];
      nova.current = outro.k;
      reordenar(lista);
      return;
    }
    const soltos = valores.filter(v => !v.pai);
    const aqui = soltos.findIndex(v => v.id === atual.id);
    const vizinho = soltos[aqui + passo];
    if (!vizinho) return;
    const bloco = familiaDe(valores, atual.id);
    const resto = valores.filter(v => !bloco.includes(v));
    const familiaVizinha = familiaDe(resto, vizinho.id);
    const para = passo > 0
      ? resto.indexOf(familiaVizinha[familiaVizinha.length - 1]) + 1
      : resto.indexOf(familiaVizinha[0]);
    resto.splice(para, 0, ...bloco);
    nova.current = para;
    reordenar(resto);
  };

  const arvore = emArvore(valores);

  if (somenteLeitura) {
    return valores.length === 0
      ? <p className="nt-vazio">Nada combinado para esta semana.</p>
      : (
        <div className="pl-linhas">
          {emArvore(valores).map(({ v, filha }) => (
            <div key={v.id} className={`pl-linha${v.feito ? ' feito' : ''}${filha ? ' filha' : ''}`}>
              <MarcoDeStatus somenteLeitura status={statusDoObjetivo(v)} opcoes={OPCOES_DO_OBJETIVO}
                cores={COR_OBJETIVO} icones={ICONE_OBJETIVO} nome="Status do objetivo" />
              <span className="pl-linha-texto">{v.texto}</span>
              {v.desejavel && <ChipDesejavel />}
              {v.prazo && <span className="pl-linha-prazo">{fmtDataCurta(v.prazo)}</span>}
              {v.responsaveis.length > 0 && (
                <span className="pl-linha-donos">
                  {v.responsaveis.map(id => {
                    const p = pessoas.find(x => x.id === id);
                    return (
                      <span key={id} title={p?.nome ?? 'Usuário removido'}>
                        <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={18} />
                      </span>
                    );
                  })}
                </span>
              )}
              {provasDe(v.id).map(e => (
                <button key={e.id} type="button" className="pl-linha-prova"
                  title={`Abrir ${e.nome}`} onClick={() => provas?.abrir(e)}>
                  <IconClip size={11} />
                  <span>{e.nome}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      );
  }

  return (
    <div className={`pl-linhas${arrastando ? ' reordenando' : ''}`}>
      {arvore.map(({ v, i, filha }) => {
        const alvo = sobre?.id === v.id && arrastando !== v.id ? sobre.pos : null;
        return (
        <div
          key={v.id}
          ref={el => { if (el) porId.current.set(v.id, el); else porId.current.delete(v.id); }}
          className={[
            'pl-linha',
            v.feito ? 'feito' : '',
            filha ? 'filha' : '',
            arrastando === v.id ? 'levada' : '',
            alvo ? `cai-${alvo}` : '',
          ].filter(Boolean).join(' ')}
          onDragOver={e => {
            if (!arrastando) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const r = e.currentTarget.getBoundingClientRect();
            const pos = e.clientY < r.top + r.height / 2 ? 'antes' : 'depois';
            if (sobre?.id !== v.id || sobre.pos !== pos) setSobre({ id: v.id, pos });
          }}
          onDragLeave={e => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setSobre(x => (x?.id === v.id ? null : x));
          }}
          onDrop={e => { e.preventDefault(); soltar(v.id); }}
        >
          {/* O punho, e não a linha inteira, é o que arrasta: a linha é um campo
              de texto, e arrastar por ela brigaria com selecionar o que está
              escrito. Ele mora na margem do painel, então aparecer no hover
              não empurra a caixinha. */}
          <span
            className="pl-linha-punho"
            draggable
            aria-hidden="true"
            title="Arraste para mudar a ordem"
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              // Sem carga o Firefox nem começa o arraste.
              e.dataTransfer.setData('text/plain', v.id);
              const linha = e.currentTarget.parentElement!;
              const r = linha.getBoundingClientRect();
              e.dataTransfer.setDragImage(linha, e.clientX - r.left, e.clientY - r.top);
              setArrastando(v.id);
            }}
            onDragEnd={() => { setArrastando(null); setSobre(null); }}
          >
            <IconArrastar size={13} />
          </span>
          {/* O status no marco das entregas: fazer, fazendo, feito. Linha
              ainda em branco não tem o que marcar. */}
          <MarcoDeStatus status={statusDoObjetivo(v)} opcoes={OPCOES_DO_OBJETIVO}
            cores={COR_OBJETIVO} icones={ICONE_OBJETIVO} nome="Status do objetivo"
            desabilitado={v.texto.trim() === ''}
            onEscolher={s => trocar(i, marcasDoStatus(s as StatusDoObjetivo))} />
          <input
            ref={el => { campos.current[i] = el; }}
            className="pl-linha-campo"
            value={v.texto}
            placeholder={placeholder}
            onChange={e => trocar(i, { texto: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); inserir(i); }
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault();
                moverPorTecla(i, e.key === 'ArrowDown' ? 1 : -1);
              }
              // Backspace na linha vazia apaga a linha, como em toda lista:
              // obrigar a ir até o X para desfazer uma linha em branco é pedir
              // um gesto de mouse no meio de quem está digitando.
              if (e.key === 'Backspace' && v.texto === '' && valores.length > 1) {
                e.preventDefault();
                nova.current = Math.max(0, i - 1);
                remover(i);
              }
            }}
            // Print recém-tirado entra por Ctrl+V, como no comentário da tarefa:
            // a mão que acabou de recortar a tela não quer procurar o arquivo
            // no explorador. Texto colado continua sendo texto - `arquivosColados`
            // só devolve arquivo quando é só isso que veio.
            onPaste={e => {
              if (!provas || !v.texto.trim()) return;
              const colados = arquivosColados(e.clipboardData);
              if (colados.length === 0) return;
              e.preventDefault();
              provas.anexar(v.id, colados);
            }}
            // Linha em branco não vira item: sair dela é desistir de escrevê-la.
            onBlur={() => { if (v.texto.trim() === '' && valores.length > 0) remover(i); }} />
          {/* Para quando, e com quem. Só aparecem na linha que já tem frase:
              numa linha em branco não há o que combinar ainda, e dois controles
              ali dentro seriam ruído no meio da digitação. */}
          {v.texto.trim() !== '' && (
            <span className="pl-linha-combinado">
              {/* Desejável: não obrigatório, mas de grande valor. Ligado é o
                  chip âmbar, à vista; desligado é a estrela vazada, que só
                  aparece com a linha em foco, como a data e as pessoas. */}
              <span className={v.desejavel ? undefined : 'pl-linha-opcional'}>
                <AlternarDesejavel ligado={!!v.desejavel} onChange={d => trocar(i, { desejavel: d })} />
              </span>
              <span className={v.prazo ? undefined : 'pl-linha-opcional'}>
                <DatePicker chip allowPast required value={v.prazo ?? ''}
                  titulo={v.prazo ? 'Data de entrega. Uma data de outra semana leva o objetivo para ela.' : 'Para quando é este objetivo'}
                  onChange={d => mudarData(i, d)} />
              </span>
              <span className={v.responsaveis.length ? undefined : 'pl-linha-opcional'}>
                <SeletorPessoas compacto pessoas={pessoas} valor={v.responsaveis}
                  vazio="Quem responde por este objetivo"
                  onChange={r => trocar(i, { responsaveis: r })} />
              </span>
              {/* A prova do que foi feito: o print, o arquivo. Opcional como o
                  prazo e o responsável, e no mesmo lugar deles - é o que se põe
                  na linha depois que ela acontece. */}
              {provas && (
                <span className={`pl-linha-provas${provasDe(v.id).length ? '' : ' pl-linha-opcional'}`}>
                  {provasDe(v.id).map(e => (
                    <span key={e.id} className="chip-com-x">
                      <button type="button" className="pl-linha-prova"
                        title={`Abrir ${e.nome}`} onClick={() => provas.abrir(e)}>
                        <IconClip size={11} />
                        <span>{e.nome}</span>
                      </button>
                      {/* O X dentro da pílula, como no chip de data, e só no
                          hover: em repouso a linha mostra o que tem, e não os
                          botões de desfazer. */}
                      <button type="button" className="chip-x pl-linha-prova-tirar"
                        aria-label={`Tirar ${e.nome}`} title="Tirar o anexo"
                        onClick={() => provas.remover(e)}>
                        <IconX size={11} />
                      </button>
                    </span>
                  ))}
                  <AcaoDoObjetivo rotulo="Anexar prova deste objetivo"
                    title="Anexar um print ou arquivo como prova do que foi feito"
                    onClick={() => { linhaDoAnexo.current = v.id; escolher.current?.click(); }}>
                    <IconClip size={ICONE_DA_ACAO} />
                  </AcaoDoObjetivo>
                </span>
              )}
            </span>
          )}
          {/* O desdobramento: o objetivo que nasce deste - a validação que
              pediu ajustes. Só na linha que já tem frase; num filho, cria um
              irmão, porque a árvore tem um nível só. */}
          {v.texto.trim() !== '' && (
            <span className="pl-linha-opcional">
              <AcaoDoObjetivo rotulo={`Desdobrar "${v.texto}"`}
                title={filha ? 'Outro desdobramento do mesmo objetivo' : 'Desdobrar: criar um objetivo que nasce deste'}
                onMouseDown={e => e.preventDefault()} onClick={() => desdobrar(i)}>
                <IconRamificar size={ICONE_DA_ACAO} />
              </AcaoDoObjetivo>
            </span>
          )}
          <button type="button" className="checklist-tirar" aria-label="Remover esta linha"
            title="Remover" onMouseDown={e => e.preventDefault()} onClick={() => remover(i)}>
            <IconX size={11} />
          </button>
        </div>
        );
      })}
      {/* O mesmo "+" discreto do checklist da tarefa: em repouso a lista termina
          no ultimo item, e uma caixa com moldura pesava mais que os itens. */}
      <button type="button" className="checklist-add" onClick={inserirNoFim}>
        <IconPlus size={12} />
        {valores.length ? 'Outro item' : 'Adicionar'}
      </button>
      {provas && (
        <input ref={escolher} type="file" multiple hidden
          onChange={e => {
            const escolhidos = [...(e.target.files ?? [])];
            const linha = linhaDoAnexo.current;
            // O valor é zerado para escolher o MESMO arquivo de novo disparar
            // outra vez: sem isto, anexar, tirar e reanexar não faz nada.
            e.target.value = '';
            linhaDoAnexo.current = null;
            if (linha && escolhidos.length) provas.anexar(linha, escolhidos);
          }} />
      )}
    </div>
  );
}

/** O que a seção de acessos precisa saber fazer. Um objeto só, e não três
 *  props soltas: as funções andam juntas e nenhuma faz sentido sozinha. */
interface AcessosDoProjeto {
  salvar: (dados: {
    id?: number; rotulo: string; usuario: string; url: string;
    /** Ausente quando a edição não mexeu na senha: mandar vazio apagaria a que
     *  está gravada, e quem edita o rótulo não tem a senha em mãos. */
    senha?: string;
  }, lista: AcessoDoProjeto[]) => Promise<number | null>;
  /** A lista de agora vai junto: é dela que sai a pintura, e é para ela que a
   *  tela volta se o servidor recusar. */
  excluir: (a: AcessoDoProjeto, lista: AcessoDoProjeto[]) => void;
  /** A senha decifrada, uma de cada vez. Nulo quando o servidor recusou. */
  senha: (a: AcessoDoProjeto) => Promise<string | null>;
}

const ACESSO_EM_BRANCO = { rotulo: '', usuario: '', url: '', senha: '' };

/**
 * Os acessos do projeto: o login do portal entregue, do painel do cliente, do
 * ambiente de homologação.
 *
 * Não é o Cofre da casa, e não quer ser: lá moram as senhas da empresa, atrás
 * de um código por e-mail, porque uma sessão esquecida aberta não pode ser a
 * única coisa entre quem senta na máquina e as senhas todas. Aqui é o acesso
 * daquele projeto, ao lado do resto da ficha, para quem já enxerga o projeto -
 * pedir um código de e-mail para ler o login de homologação que o time usa dez
 * vezes por dia seria trocar o trabalho pela cerimônia.
 *
 * Duas regras continuam valendo, e são as que importam:
 *
 *  1. A senha nunca está na tela por padrão. Ela desce do servidor quando
 *     alguém pede para ver ou para copiar, vive na linha que a pediu e some em
 *     meio minuto - ou junto com a gaveta, o que vier primeiro.
 *  2. Nada disto aparece na página do cliente. É acesso da equipe.
 */
function SecaoAcessos({ acessos, somenteLeitura, acoes }: {
  acessos: AcessoDoProjeto[];
  somenteLeitura: boolean;
  acoes: AcessosDoProjeto;
}) {
  const { toast } = useToast();
  /** Qual linha está sendo escrita: o id de uma existente, a nova, ou nada. */
  const [editando, setEditando] = useState<number | 'nova' | null>(null);
  const [campos, setCampos] = useState(ACESSO_EM_BRANCO);
  const [gravando, setGravando] = useState(false);
  /** As senhas que alguém pediu para ver, por id. Somem com a gaveta. */
  const [abertas, setAbertas] = useState<Record<number, string>>({});
  /** Qual linha espera o servidor devolver a senha. */
  const [pedindo, setPedindo] = useState<number | null>(null);
  const editor = useRevelar(editando !== null);
  /** O foco vai para o primeiro campo quando o bloco abre, e não na montagem:
   *  `autoFocus` dispara um quadro antes de o `.revelar` abrir, e a página
   *  saltava até um campo de altura zero. */
  const primeiro = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (editor.aberto) primeiro.current?.focus(); }, [editor.aberto]);

  /** A senha aberta se fecha sozinha. Meio minuto é o tempo de ler e digitar em
   *  outro lugar; deixá-la até a gaveta fechar seria deixá-la à vista por cima
   *  do ombro de quem passa. */
  useEffect(() => {
    if (Object.keys(abertas).length === 0) return;
    const t = window.setTimeout(() => setAbertas({}), 30_000);
    return () => window.clearTimeout(t);
  }, [abertas]);

  function abrirEdicao(a: AcessoDoProjeto) {
    setEditando(a.id);
    // A senha não vem: quem edita o rótulo não precisa dela, e o campo em
    // branco quer dizer "deixa a que está lá".
    setCampos({ rotulo: a.rotulo, usuario: a.usuario ?? '', url: a.url ?? '', senha: '' });
  }

  async function gravar() {
    if (!campos.rotulo.trim() || gravando) return;
    setGravando(true);
    const id = await acoes.salvar({
      id: editando === 'nova' ? undefined : editando ?? undefined,
      rotulo: campos.rotulo.trim(),
      usuario: campos.usuario.trim(),
      url: campos.url.trim(),
      // Senha em branco na edição é "não mexer"; na linha nova é acesso sem
      // senha gravada, que é caso normal - nem todo acesso tem uma.
      ...(campos.senha || editando === 'nova' ? { senha: campos.senha } : {}),
    }, acessos);
    setGravando(false);
    if (id === null) return;
    setEditando(null);
    setCampos(ACESSO_EM_BRANCO);
  }

  /** Mostra ou esconde. Esconder é local; mostrar custa uma ida ao servidor,
   *  que é o que mantém a senha fora da listagem. */
  async function ver(a: AcessoDoProjeto) {
    if (abertas[a.id] !== undefined) {
      setAbertas(x => { const y = { ...x }; delete y[a.id]; return y; });
      return;
    }
    setPedindo(a.id);
    const senha = await acoes.senha(a);
    setPedindo(null);
    if (senha === null) return;
    setAbertas(x => ({ ...x, [a.id]: senha }));
  }

  /** Copia sem mostrar: a senha vai para a área de transferência e não passa
   *  pela tela. */
  async function copiar(a: AcessoDoProjeto, valor: string | null, oQue: string) {
    const conteudo = valor ?? await acoes.senha(a);
    if (conteudo === null) return;
    try {
      await navigator.clipboard.writeText(conteudo);
      toast('success', `${oQue} copiado`, a.rotulo);
    } catch {
      toast('error', 'O navegador não deixou copiar', 'Mostre o campo e copie à mão.');
    }
  }

  return (
    <section>
      <p className="admin-section-title">Acessos</p>
      <p className="acessos-dica">
        Login e senha do que a equipe usa neste projeto. A senha fica cifrada e
        não aparece na página do cliente.
      </p>

      {acessos.length === 0 && editando === null && (
        <p className="nt-vazio">Nenhum acesso guardado.</p>
      )}

      <div className="acessos-lista">
        {acessos.map(a => (
          <div key={a.id} className="acesso-linha">
            <span className="acesso-nome">
              {a.url
                ? <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>{a.rotulo}</a>
                : a.rotulo}
            </span>
            <span className="acesso-campo" title={a.usuario ?? undefined}>
              <span className="acesso-valor">
                {a.usuario || <span className="acesso-sem">sem usuário</span>}
              </span>
              {!!a.usuario && (
                <button type="button" className="acesso-botao" title="Copiar o usuário"
                  aria-label={`Copiar o usuário de ${a.rotulo}`}
                  onClick={() => void copiar(a, a.usuario, 'Usuário')}>
                  <IconClipboard size={12} />
                </button>
              )}
            </span>
            <span className="acesso-campo">
              {!a.tem_senha ? (
                <span className="acesso-valor"><span className="acesso-sem">sem senha</span></span>
              ) : (
                <>
                  {/* A senha revelada troca de lugar com os pontinhos, e não
                      nasce embaixo deles: é a mesma informação, no mesmo lugar,
                      mudando de cara. */}
                  <span className="acesso-valor troca"
                    key={abertas[a.id] === undefined ? 'oculta' : 'aberta'}>
                    {abertas[a.id] === undefined ? '••••••••' : (abertas[a.id] || 'em branco')}
                  </span>
                  <button type="button" className="acesso-botao"
                    title={abertas[a.id] === undefined ? 'Mostrar a senha' : 'Esconder a senha'}
                    aria-label={`Mostrar a senha de ${a.rotulo}`}
                    disabled={pedindo === a.id}
                    onClick={() => void ver(a)}>
                    {pedindo === a.id
                      ? <IconSpinner size={12} />
                      : abertas[a.id] === undefined ? <IconEye size={12} /> : <IconEyeOff size={12} />}
                  </button>
                  <button type="button" className="acesso-botao" title="Copiar a senha"
                    aria-label={`Copiar a senha de ${a.rotulo}`}
                    onClick={() => void copiar(a, abertas[a.id] ?? null, 'Senha')}>
                    <IconClipboard size={12} />
                  </button>
                </>
              )}
            </span>
            {!somenteLeitura && (
              <span className="acesso-acoes">
                <button type="button" className="acesso-botao" title="Editar este acesso"
                  aria-label={`Editar ${a.rotulo}`} onClick={() => abrirEdicao(a)}>
                  <IconEdit size={12} />
                </button>
                <button type="button" className="acesso-botao" title="Remover este acesso"
                  aria-label={`Remover ${a.rotulo}`} onClick={() => acoes.excluir(a, acessos)}>
                  <IconTrash size={12} />
                </button>
              </span>
            )}
          </div>
        ))}
      </div>

      {!somenteLeitura && (
        <>
          {editor.montado && (
            <div className={`revelar${editor.aberto ? ' aberto' : ''}`}>
              <div>
                <div className="acesso-editor">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Nome do acesso *</label>
                      <input className="form-input" ref={primeiro} value={campos.rotulo}
                        placeholder="Portal de homologação"
                        onChange={e => setCampos(c => ({ ...c, rotulo: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Usuário</label>
                      <input className="form-input" value={campos.usuario} autoComplete="off"
                        placeholder="equipe@sheeptechnology.com.br"
                        onChange={e => setCampos(c => ({ ...c, usuario: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-group">
                      <label className="form-label">Senha</label>
                      <input className="form-input" type="password" value={campos.senha}
                        autoComplete="new-password"
                        placeholder={editando === 'nova' ? '' : 'Em branco: mantém a atual'}
                        onChange={e => setCampos(c => ({ ...c, senha: e.target.value }))} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Endereço</label>
                      <input className="form-input" value={campos.url}
                        placeholder="https://portal.cliente.com.br/admin"
                        onChange={e => setCampos(c => ({ ...c, url: e.target.value }))} />
                    </div>
                  </div>
                  <div className="acesso-editor-acoes">
                    <button type="button" className="btn btn-secondary"
                      onClick={() => { setEditando(null); setCampos(ACESSO_EM_BRANCO); }}>
                      Cancelar
                    </button>
                    <button type="button" className="btn btn-primary"
                      disabled={!campos.rotulo.trim() || gravando}
                      onClick={() => void gravar()}>
                      {gravando && <IconSpinner size={13} />}
                      {gravando ? 'Gravando' : 'Gravar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {editando === null && (
            <button type="button" className="checklist-add"
              onClick={() => { setEditando('nova'); setCampos(ACESSO_EM_BRANCO); }}>
              <IconPlus size={12} />
              {acessos.length ? 'Outro acesso' : 'Adicionar acesso'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Todos os objetivos da semana numa folha só, agrupados por cliente.
 *
 * As divisórias mostram um projeto por vez, que é como a reunião acontece; esta
 * é a leitura de cima: o que a casa combinou para a semana, cliente a cliente.
 * Dois projetos do mesmo cliente aparecem juntos, que é como o cliente cobra.
 *
 * Escreve-se aqui também, com a mesma lista da folha do projeto: quem está
 * passando cliente a cliente não deveria ter de trocar de tela para acrescentar
 * um objetivo, pôr prazo ou dizer quem responde. Clicar no nome do projeto leva
 * à folha dele, que é onde o quadro da semana dá o contexto.
 */
function FolhaDosObjetivos({ lista, planning, pessoas, podeEditar, onMudarObjetivos,
  onVerProjeto, provasDe }: {
  /** Como prender um print a um objetivo, projeto por projeto. */
  provasDe?: (projetoId: string) => ProvasDosObjetivos;
  /** Os projetos da reunião, na ordem da sala. */
  lista: Projeto[];
  planning: Record<string, PlanningDaSemana>;
  pessoas: Pessoa[];
  podeEditar: boolean;
  onMudarObjetivos: (projetoId: string, objetivos: ObjetivoDaSemana[]) => void;
  onVerProjeto: (projetoId: string) => void;
}) {
  /** Um bloco por cliente, na ordem em que os projetos aparecem na reunião: a
   *  ordem da sala vale aqui também. */
  const grupos = useMemo(() => {
    const porCliente = new Map<string, { cliente: string; projetos: Projeto[] }>();
    // Projeto sem nenhum objetivo entra igual: é aqui que o primeiro deles
    // nasce, e esconder o projeto esconderia justamente o que falta combinar.
    for (const p of lista) {
      const cliente = p.id === PROJETO_GERAL
        ? 'Sheep'
        : p.cliente_nome ?? 'Sem cliente';
      const grupo = porCliente.get(cliente) ?? { cliente, projetos: [] };
      grupo.projetos.push(p);
      porCliente.set(cliente, grupo);
    }
    return [...porCliente.values()];
  }, [lista, planning]);

  const todos = grupos.flatMap(g => g.projetos.flatMap(p => planning[p.id]?.objetivos ?? []));
  const feitos = todos.filter(o => o.feito).length;
  /** Os clientes recolhidos. Todos nascem abertos: a folha existe para ser lida
   *  de cima a baixo, e recolher e o que se faz depois de passar por um. */
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());

  return (
    <div className="pl-folha troca">
      <header className="pl-cabeca">
        <div className="pl-quem">
          <h2>Objetivos da semana</h2>
          <p className="pl-meta">
            O que a casa combinou, por cliente
            {todos.length > 0 && <><span className="nt-sep">·</span>{feitos} de {todos.length} cumpridos</>}
          </p>
        </div>
      </header>

      {grupos.length === 0 ? (
        <p className="nt-vazio">Nenhum projeto em andamento para combinar a semana.</p>
      ) : (
        <div className="pl-obj-grupos">
          {grupos.map(g => {
            const quantos = g.projetos.reduce((n, p) => n + (planning[p.id]?.objetivos ?? []).length, 0);
            const cumpridos = g.projetos
              .reduce((n, p) => n + (planning[p.id]?.objetivos ?? []).filter(o => o.feito).length, 0);
            const aberto = !recolhidos.has(g.cliente);
            const daCasa = g.projetos.every(p => p.id === PROJETO_GERAL);
            return (
            // Um cliente por chip, e o chip inteiro abre e recolhe: numa semana
            // com dez clientes, o que a sala quer e passar por um de cada vez.
            <section key={g.cliente} className="pl-secao pl-combinado pl-obj-grupo">
              <button type="button" className="pl-obj-cabeca" aria-expanded={aberto}
                onClick={() => setRecolhidos(atual => {
                  const outro = new Set(atual);
                  if (outro.has(g.cliente)) outro.delete(g.cliente); else outro.add(g.cliente);
                  return outro;
                })}>
                <span className={`entrega-seta${aberto ? ' aberta' : ''}`}>
                  <IconChevronRight size={12} />
                </span>
                {daCasa ? (
                  <img className="pl-aba-marca-sheep" src="/logo-lockup.png" alt="Sheep Technology" />
                ) : (
                  <LogoDoCliente cliente={g.cliente} />
                )}
                {/* Com um projeto só, o chip é a etiqueta dele: nome em cima e
                    cliente embaixo, como na divisória. Com mais de um, o chip é
                    do cliente, e os projetos aparecem nomeados aqui dentro. */}
                <span className="pl-aba-texto">
                  <strong>{g.projetos.length === 1 ? g.projetos[0].nome : g.cliente}</strong>
                  <small>
                    {g.projetos.length > 1
                      ? `${g.projetos.length} projetos`
                      : daCasa
                        ? 'Demandas da casa'
                        : g.projetos[0].cliente_nome ?? 'Sem cliente'}
                  </small>
                </span>
                <span className="kanban-conta-bolha">{cumpridos}/{quantos}</span>
              </button>

              {/* O conteúdo fica montado e a altura é que anima: montado só
                  enquanto aberto, o bloco animaria de nada para nada. */}
              <div className={`revelar${aberto ? ' aberto' : ''}`}>
              <div>
              {g.projetos.map(p => (
                <div key={p.id} className="pl-obj-projeto">
                  {/* O nome do projeto só quando o cliente tem mais de um: com um
                      só, ele repetiria o que o chip acima já diz. */}
                  {g.projetos.length > 1 && (
                    <button type="button" className="pl-obj-nome" onClick={() => onVerProjeto(p.id)}
                      title="Abrir a folha deste projeto">
                      {p.nome}
                    </button>
                  )}
                  {/* A mesma lista da folha do projeto: escrever, marcar, pôr
                      prazo e dizer quem responde, sem trocar de tela. */}
                  <ObjetivosDaPlanning
                    projetoId={p.id}
                    valores={planning[p.id]?.objetivos ?? []}
                    somenteLeitura={!podeEditar}
                    pessoas={pessoas}
                    placeholder={p.id === PROJETO_GERAL
                      ? 'O que a casa precisa resolver nesta semana'
                      : 'O que precisa acontecer nesta semana'}
                    provas={podeEditar ? provasDe?.(p.id) : undefined}
                    onChange={objetivos => onMudarObjetivos(p.id, objetivos)} />
                </div>
              ))}
              </div>
              </div>
            </section>
            );
          })}
        </div>
      )}

    </div>
  );
}

/** As folhas presas no alto da Planning, fora do arraste e da numeração. */
const FOLHAS_FIXAS = new Set([PROJETO_GERAL, PLANNING_FUNIL]);

/**
 * As abas laterais da Planning, no desenho das divisórias de uma agenda: uma
 * aba por projeto, empilhadas na borda esquerda, e a folha do projeto escolhido
 * encostada nelas.
 *
 * É navegação de reunião, e não índice de relatório: a sala percorre um projeto
 * de cada vez, e o que interessa é saber em qual se está e quantos faltam. Por
 * isso a aba ativa se funde com a folha, como a divisória que se puxa para
 * frente - e as outras ficam recuadas, atrás dela.
 *
 * A ordem é a da sala, e se arruma arrastando: clicar escolhe o projeto, clicar
 * e arrastar muda o lugar dele. É o mesmo gesto das etapas em Configurações, com
 * a mesma linha amarela dizendo onde a divisória vai cair.
 */
/** A marca do cliente na divisória da planning, no lugar onde a Geral leva a da
 *  casa. Segue a mesma regra do seletor de cliente: logo de uma cor só é máscara
 *  pintada na cor da marca, e as demais entram como imagem, escurecidas quando
 *  foram desenhadas em branco. Cliente sem logo cadastrada mostra a urgência, que
 *  era o que ocupava este lugar antes.
 *
 *  A altura é fixa e a largura tem teto: a tabela óptica das marcas vai de selo
 *  quadrado a assinatura larga, e sem o teto a assinatura comeria o nome do
 *  projeto ao lado. */
function LogoDaAba({ cliente, prioridade }: { cliente: string | null | undefined; prioridade: string }) {
  const marca = logoDoCliente(cliente);
  if (!marca) {
    return (
      <span className="pl-aba-prio" style={{ color: COR_PRIORIDADE[prioridade] ?? 'var(--gray2)' }}
        title={`Prioridade: ${prioridade}`} aria-label={`Prioridade ${prioridade}`}>
        {ICONE_PRIORIDADE[prioridade]?.({ size: 14 })}
      </span>
    );
  }
  const nome = cliente ?? 'Cliente';
  const altura = 15;
  if (marca.cor && marca.proporcao) {
    return (
      <span className="pl-aba-prio">
        <span className="marca-tingida" role="img" aria-label={nome} title={nome}
          style={{
            height: altura,
            width: Math.min(40, Math.round(altura * marca.proporcao)),
            ['--marca' as string]: `url(${marca.src})`,
            ['--marca-cor' as string]: marca.cor,
            ['--marca-cor-escura' as string]: marca.corEscura,
          }} />
      </span>
    );
  }
  return (
    <span className="pl-aba-prio">
      <img className="pl-aba-logo" src={marca.src} alt={nome} title={nome}
        data-escurecer={marca.escurecer ? '' : undefined}
        style={{ height: altura }} />
    </span>
  );
}

function AbasDeCaderno({ lista, ativo, contagem, podeReordenar, onEscolher, onReordenar }: {
  lista: Projeto[];
  ativo: string | null;
  /** Quantos objetivos cada projeto tem combinados para a semana em foco. */
  contagem: (p: Projeto) => number;
  /** Mudar a ordem é `projetos:editar`: quem só olha a reunião não a reorganiza. */
  podeReordenar: boolean;
  onEscolher: (id: string) => void;
  /** A lista inteira de ids, na ordem nova. */
  onReordenar: (ids: string[]) => void;
}) {
  const abas = useRef<Array<HTMLDivElement | null>>([]);
  /** As mesmas abas, por id: a posição na lista muda justamente no gesto que
   *  precisa achar cada uma de novo. */
  const porId = useRef(new Map<string, HTMLDivElement>());
  const nav = useRef<HTMLElement>(null);

  /** Onde esta a divisoria puxada para frente. Medida do botao de verdade, e nao
   *  calculada por posicao na lista: nome de projeto quebra, a aba cresce, e
   *  uma conta por altura fixa deixaria a marca torta - o mesmo motivo do traco
   *  das abas do sistema. */
  const [marca, setMarca] = useState<{ x: number; y: number; w: number; h: number; deitada: boolean } | null>(null);
  /** A marca so anima depois da primeira medida. Sem isso ela nasceria no canto
   *  e deslizaria ate a aba ativa ao abrir a tela, que e movimento sem gesto.
   *
   *  Liga na segunda medida, e nao num quadro de animacao: o transition vale
   *  pelo estilo de depois da mudanca, entao a classe e a posicao nova chegando
   *  juntas ja deslizam - e nao depende de o navegador estar pintando a aba. */
  const [pronta, setPronta] = useState(false);
  const jaMediu = useRef(false);
  const chave = lista.map(p => p.id).join('|');

  /** A divisória que está sendo levada, e onde ela cairia se soltasse agora. */
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<{ id: string; pos: 'antes' | 'depois' } | null>(null);

  /** Onde cada aba estava antes de a ordem mudar. É o ponto de partida do
   *  deslize: sem ele as divisórias pulariam para o lugar novo, e numa lista de
   *  nove ninguém veria qual trocou com qual. */
  const antes = useRef<Map<string, DOMRect> | null>(null);

  // Antes da pintura: medida depois, a marca apareceria uma vez no lugar errado.
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    function medir() {
      const i = lista.findIndex(p => p.id === ativo);
      const b = abas.current[i];
      if (!b || !el) return;
      setMarca({
        x: b.offsetLeft,
        y: b.offsetTop,
        w: b.offsetWidth,
        h: b.offsetHeight,
        // Abaixo de 1000px as divisorias viram abas de cima, e a marca passa a
        // cobrir o fio de cima da folha em vez do da esquerda.
        deitada: getComputedStyle(el).flexDirection === 'row',
      });
      if (jaMediu.current) setPronta(true);
      jaMediu.current = true;
    }
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave]);

  // O deslize das divisórias quando a ordem muda: cada uma nasce onde estava,
  // deslocada, e volta a zero no tempo de movimento da casa. Posição inversa e
  // não animação de layout, porque é o transform que o navegador anda sem
  // refazer a lista a cada quadro.
  useLayoutEffect(() => {
    const velhas = antes.current;
    antes.current = null;
    if (!velhas) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [id, el] of porId.current) {
      const de = velhas.get(id);
      if (!de) continue;
      const para = el.getBoundingClientRect();
      const dx = de.left - para.left;
      const dy = de.top - para.top;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      // Lê o layout para o navegador registrar o ponto de partida antes de o
      // transform voltar a zero; sem isso as duas escritas viram uma só.
      void el.offsetHeight;
      el.style.transition = 'transform var(--transition-spring)';
      el.style.transform = '';
      const limpar = () => { el.style.transition = ''; el.removeEventListener('transitionend', limpar); };
      el.addEventListener('transitionend', limpar);
    }
  }, [chave]);

  /** Guarda onde cada aba está e manda a ordem nova. */
  const reordenar = (ids: string[]) => {
    if (ids.join('|') === chave) return;
    antes.current = new Map([...porId.current].map(([id, el]) => [id, el.getBoundingClientRect()]));
    onReordenar(ids);
  };

  const soltar = (alvoId: string) => {
    const origem = arrastando;
    const pos = sobre?.pos ?? 'antes';
    setArrastando(null);
    setSobre(null);
    if (!origem || origem === alvoId) return;
    const ids = lista.map(p => p.id).filter(id => id !== origem);
    const para = ids.indexOf(alvoId);
    ids.splice(pos === 'antes' ? para : para + 1, 0, origem);
    reordenar(ids);
  };

  /** Seta sobe e desce entre as abas, como em toda lista de abas do sistema.
   *  Com Alt, a seta leva a aba junto: arrastar não pode ser o único jeito de
   *  arrumar a ordem. */
  const porTecla = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEscolher(lista[i].id);
      return;
    }
    const passo = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    if (e.altKey) {
      if (!podeReordenar) return;
      const destino = i + passo;
      if (destino < 0 || destino >= lista.length) return;
      // As folhas presas ficam no alto: nem saem de lá, nem deixam outra tomar o lugar.
      if (FOLHAS_FIXAS.has(lista[i].id) || FOLHAS_FIXAS.has(lista[destino].id)) return;
      const ids = lista.map(p => p.id);
      [ids[i], ids[destino]] = [ids[destino], ids[i]];
      reordenar(ids);
      return;
    }
    const alvo = (i + passo + lista.length) % lista.length;
    abas.current[alvo]?.focus();
    onEscolher(lista[alvo].id);
  };

  return (
    <nav ref={nav} className={`pl-abas${arrastando ? ' reordenando' : ''}`} role="tablist"
      aria-orientation="vertical" aria-label="Projetos da planning">
      {/* A divisoria puxada para frente e uma peca so, que desliza ate a aba
          escolhida - e nao um fundo que apaga numa aba e acende na outra. Com o
          corte seco, trocar de projeto numa lista de nove nao dizia de onde para
          onde a sala tinha ido. Um pixel a mais do lado da folha cobre o fio
          dela, que e o que funde a aba com a folha. */}
      {marca && (
        <span
          aria-hidden="true"
          className={`pl-aba-marca${pronta ? ' pronta' : ''}${marca.deitada ? ' deitada' : ''}`}
          style={{
            transform: `translate(${marca.x}px, ${marca.y}px)`,
            width: marca.w + (marca.deitada ? 0 : 1),
            height: marca.h + (marca.deitada ? 1 : 0),
          }} />
      )}
      {lista.map((p, i) => {
        const quantas = contagem(p);
        const prioridade = p.prioridade ?? PRIORIDADE_PADRAO;
        const alvo = sobre?.id === p.id && arrastando !== p.id ? sobre.pos : null;
        const ehGeral = p.id === PROJETO_GERAL;
        const ehFunil = p.id === PLANNING_FUNIL;
        // Geral e Funil ficam presas no alto: não arrastam, não recebem quem é
        // arrastado e não entram na numeração, que é a dos projetos.
        const ehFixa = FOLHAS_FIXAS.has(p.id);
        const arrastavel = podeReordenar && !ehFixa;
        const numero = lista.slice(0, i + 1).filter(x => !FOLHAS_FIXAS.has(x.id)).length;
        return (
          // Div com papel de aba, e não botão: o Firefox não começa arraste num
          // `button`, e aqui a mesma peça precisa ser clicada e arrastada.
          <div
            key={p.id}
            ref={el => {
              abas.current[i] = el;
              if (el) porId.current.set(p.id, el); else porId.current.delete(p.id);
            }}
            role="tab"
            aria-selected={ativo === p.id}
            tabIndex={ativo === p.id ? 0 : -1}
            draggable={arrastavel}
            title={arrastavel ? 'Clique para abrir, arraste para mudar a ordem' : undefined}
            className={[
              'pl-aba',
              ehFixa ? 'pl-aba-fixa' : '',
              ativo === p.id ? 'ativa' : '',
              arrastando === p.id ? 'levada' : '',
              alvo ? `cai-${alvo}` : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onEscolher(p.id)}
            onKeyDown={e => porTecla(e, i)}
            onDragStart={e => {
              e.dataTransfer.effectAllowed = 'move';
              // Sem carga o Firefox nem começa o arraste.
              e.dataTransfer.setData('text/plain', p.id);
              setArrastando(p.id);
            }}
            onDragEnd={() => { setArrastando(null); setSobre(null); }}
            onDragOver={e => {
              // Sobre as folhas presas nada cai: o lugar delas é o do alto.
              if (!arrastando || ehFixa) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              const r = e.currentTarget.getBoundingClientRect();
              const deitada = marca?.deitada ?? false;
              const pos = (deitada ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2)
                ? 'antes' : 'depois';
              if (sobre?.id !== p.id || sobre.pos !== pos) setSobre({ id: p.id, pos });
            }}
            onDragLeave={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setSobre(x => (x?.id === p.id ? null : x));
            }}
            onDrop={e => { e.preventDefault(); soltar(p.id); }}
          >
            {/* O número dá lugar ao punho no hover: é onde a mão procura o que
                arrastar, e dois ícones lado a lado apertariam o nome. */}
            {/* A Geral nao ocupa a coluna do numero: ela nao tem numero nem
                icone aqui, e a coluna vazia empurrava a marca e o nome para a
                direita, desalinhados de quem le a lista de cima a baixo. */}
            {!ehGeral && (
            <span className="pl-aba-num">
              {ehFixa ? (
                <span className="pl-aba-num-texto" aria-hidden="true">
                  {ehFunil ? <IconFunil size={13} /> : null}
                </span>
              ) : (
                <span className="pl-aba-num-texto">{String(numero).padStart(2, '0')}</span>
              )}
              {arrastavel && (
                <span className="pl-aba-punho" aria-hidden="true"><IconArrastar size={13} /></span>
              )}
            </span>
            )}
            {/* A marca do cliente, que é como o projeto é chamado em voz alta na
                planning. Cliente sem logo cadastrada cai na urgência, no desenho
                de barras da casa: o lugar nunca fica vazio. As folhas presas não
                têm cliente, e ali o espaço fica em branco para o nome delas
                alinhar com o dos projetos. */}
            {ehGeral ? (
              // A assinatura da casa, a mesma do login: a Geral e da Sheep, e na
              // coluna das marcas isso se le sem precisar de rotulo.
              <span className="pl-aba-prio">
                <img className="pl-aba-marca-sheep" src="/logo-lockup.png" alt="Sheep Technology" />
              </span>
            ) : ehFixa ? <span className="pl-aba-prio" aria-hidden="true" style={{ width: 14 }} /> : (
              <LogoDaAba cliente={p.cliente_nome} prioridade={prioridade} />
            )}
            <span className="pl-aba-texto">
              <strong>{p.nome}</strong>
              <small>
                {ehGeral ? 'Demandas da casa' : ehFunil ? 'Oportunidades comerciais' : p.cliente_nome ?? 'Sem cliente'}
              </small>
            </span>
            {/* Os objetivos combinados para a semana: é o que diz, sem entrar no
                projeto, se ele já foi discutido ou se a sala ainda vai discuti-lo. */}
            <span className={`pl-aba-conta${quantas === 0 ? ' vazia' : ''}`}
              title={quantas === 0
                ? 'Nenhum objetivo combinado para esta semana'
                : `${quantas} objetivo(s) para esta semana`}>
              {quantas}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * A semana em foco na Planning.
 *
 * Mora no cabeçalho da página, no lugar em que a aba Geral tem o "Novo
 * projeto": é o controle da página inteira - troca a semana de todos os
 * projetos de uma vez.
 *
 * Três peças: as setas redondas, uma de cada lado, para andar de uma em uma, e
 * o chip do meio com o número da semana, as datas e a situação dela. Clicar no
 * chip abre a lista das semanas do mês, com o mês navegável - é o caminho para
 * saltar três semanas sem clicar três vezes, e para voltar a esta de qualquer
 * lugar.
 */
type SituacaoDaSemana = 'atual' | 'planejada' | 'encerrada';

const ROTULO_DA_SITUACAO: Record<SituacaoDaSemana, string> = {
  atual: 'Atual',
  planejada: 'Planejada',
  encerrada: 'Encerrada',
};

/** Em que ponto do tempo uma semana está, pela segunda-feira dela. */
function situacaoDaSemana(segunda: Date): SituacaoDaSemana {
  const alvo = iso10(segundaDaSemana(segunda));
  const hoje = iso10(segundaDaSemana());
  return alvo === hoje ? 'atual' : alvo > hoje ? 'planejada' : 'encerrada';
}

/** O número ISO da semana: a primeira do ano é a que tem a primeira quinta.
 *  É o "Sem 37" que a casa usa quando fala de sprint. */
function numeroDaSemana(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const diaDaSemana = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - diaDaSemana);
  const inicioDoAno = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - inicioDoAno.getTime()) / 86400000 + 1) / 7);
}

/** "07/09 - 13/09": segunda a domingo, sem o ano, que é quase sempre o mesmo. */
function intervaloDaSemana(segunda: Date): string {
  const inicio = segundaDaSemana(segunda);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  const curto = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  return `${curto(inicio)} - ${curto(fim)}`;
}

/** As semanas de um mês: as que começam nele. A que atravessa a virada fica no
 *  mês da segunda-feira dela, para nenhuma semana aparecer em dois meses. */
function semanasDoMes(mes: Date): Date[] {
  const semanas: Date[] = [];
  const d = new Date(mes.getFullYear(), mes.getMonth(), 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d.getMonth() === mes.getMonth()) {
    semanas.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return semanas;
}

const LARGURA_DA_LISTA = 250;

function SeletorDeSemana({ semana, onMudar }: {
  semana: Date;
  onMudar: (d: Date) => void;
}) {
  const [aberto, setAberto] = useState(false);
  /** O mês que a lista mostra. Nasce no mês da semana em foco a cada abertura,
   *  e as setas da lista andam só nele, sem mexer na semana. */
  const [mes, setMes] = useState(() => new Date(semana.getFullYear(), semana.getMonth(), 1));
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  const situacao = situacaoDaSemana(semana);
  const focoIso = iso10(segundaDaSemana(semana));

  const andar = (passo: number) => {
    const d = new Date(semana);
    d.setDate(d.getDate() + passo * 7);
    onMudar(d);
  };

  /** Mede o chip e abre a lista centrada embaixo dele. O gatilho alterna, como
   *  todo dropdown da casa: o segundo clique fecha. */
  const alternar = () => {
    if (aberto) { setAberto(false); return; }
    const r = gatilho.current!.getBoundingClientRect();
    const left = Math.min(
      Math.max(8, r.left + r.width / 2 - LARGURA_DA_LISTA / 2),
      window.innerWidth - LARGURA_DA_LISTA - 8,
    );
    setPos({ top: r.bottom + 8, left });
    const inicio = segundaDaSemana(semana);
    setMes(new Date(inicio.getFullYear(), inicio.getMonth(), 1));
    setAberto(true);
  };

  const escolher = (d: Date) => {
    onMudar(d);
    setAberto(false);
    gatilho.current?.focus();
  };

  const andarMes = (passo: number) =>
    setMes(m => new Date(m.getFullYear(), m.getMonth() + passo, 1));

  const nomeDoMes = mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(' de ', ' ')
    .replace(/^./, c => c.toUpperCase());

  return (
    <div className="pl-barra">
      <div className="pl-semana">
        <button type="button" className="pl-seta" aria-label="Semana anterior" title="Semana anterior"
          onClick={() => andar(-1)}>
          <IconChevronRight size={14} />
        </button>

        <button
          ref={gatilho}
          type="button"
          className={`pl-semana-chip ${situacao}${aberto ? ' aberto' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          onClick={alternar}
          onKeyDown={e => { if (e.key === 'Escape') setAberto(false); }}
        >
          <span className="pl-semana-ponto" aria-hidden="true" />
          {/* A troca de semana muda o texto no lugar: `.troca` só mexe na
              opacidade, e o chip não pula de posição. */}
          <span className="pl-semana-texto troca" key={focoIso}>
            <small>Sem {numeroDaSemana(segundaDaSemana(semana))}</small>
            <span className="pl-semana-sep" aria-hidden="true">·</span>
            {intervaloDaSemana(semana)}
          </span>
          <span className="pl-semana-situacao">{ROTULO_DA_SITUACAO[situacao]}</span>
          <span className="pl-semana-seta" aria-hidden="true"><IconChevronDown size={13} /></span>
        </button>

        <button type="button" className="pl-seta" aria-label="Próxima semana" title="Próxima semana"
          onClick={() => andar(1)}>
          <IconChevronRight size={14} />
        </button>
      </div>

      {aberto && createPortal(
        <div
          ref={lista}
          className="pl-semana-lista surge"
          role="listbox"
          aria-label="Semanas do mês"
          style={{ top: pos.top, left: pos.left, width: LARGURA_DA_LISTA }}
          onKeyDown={e => { if (e.key === 'Escape') { setAberto(false); gatilho.current?.focus(); } }}
        >
          <div className="pl-semana-mes">
            <button type="button" className="pl-semana-mes-seta" aria-label="Mês anterior"
              onClick={() => andarMes(-1)}>
              <IconChevronRight size={12} />
            </button>
            <span className="troca" key={iso10(mes)}>{nomeDoMes}</span>
            <button type="button" className="pl-semana-mes-seta" aria-label="Próximo mês"
              onClick={() => andarMes(1)}>
              <IconChevronRight size={12} />
            </button>
          </div>

          <div className="pl-semana-opcoes lista-anima" key={iso10(mes)}>
            {semanasDoMes(mes).map(s => {
              const sit = situacaoDaSemana(s);
              const escolhida = iso10(s) === focoIso;
              return (
                <button
                  key={iso10(s)}
                  type="button"
                  role="option"
                  aria-selected={escolhida}
                  className={`pl-semana-opcao ${sit}${escolhida ? ' escolhida' : ''}`}
                  title={`Semana ${numeroDaSemana(s)}`}
                  onClick={() => escolher(s)}
                >
                  <span className="pl-semana-ponto" aria-hidden="true" />
                  <span className="pl-semana-opcao-datas">{intervaloDaSemana(s)}</span>
                  <span className="pl-semana-situacao">{ROTULO_DA_SITUACAO[sit]}</span>
                  <span className="pl-semana-visto" aria-hidden="true">
                    {escolhida && <IconCheck size={12} />}
                  </span>
                </button>
              );
            })}
          </div>

          {/* O atalho de volta mora na lista, e só quando a semana em foco não
              é esta: de outro mês, a semana atual não aparece nas opções. */}
          {situacao !== 'atual' && (
            <button type="button" className="pl-semana-voltar" onClick={() => escolher(segundaDaSemana())}>
              <IconArrowLeft size={12} />
              Voltar para esta semana
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Um objetivo da semana, que a sala marca quando cumpre. O `id` só existe na
 *  tela: é a chave que deixa a linha ser levada para outra posição sem que o
 *  React a confunda com a vizinha. O servidor guarda a ordem da lista. */
interface ObjetivoDaSemana {
  id: string;
  texto: string;
  feito: boolean;
  /** Em curso: o meio entre fazer e feito. Ver `statusDoObjetivo`. */
  fazendo?: boolean;
  /** Para quando o objetivo foi combinado. Nulo: a semana inteira. */
  prazo: string | null;
  /** Quem respondeu por ele na reunião. Vazio: é do time. */
  responsaveis: string[];
  /** O objetivo de que este nasceu: a validação que pediu os ajustes. Um nível
   *  só - a mãe nunca tem mãe. */
  pai?: string | null;
  /** Não obrigatório, mas de grande valor se sair: o chip âmbar com a estrela. */
  desejavel?: boolean;
}

/** O id de um objetivo é gravado junto dele, e é por ele que a prova se
 *  prende à linha. Por isso ele não pode ser um contador: dois objetivos
 *  criados em sessões diferentes cairiam no mesmo número, e a prova de um
 *  apareceria no outro. */
const novoIdDeObjetivo = () =>
  `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Um id que já veio gravado, quando ele veio. Linha escrita antes desta coluna
 *  chega sem, e ganha um aqui - que fica na próxima gravação. */
const idDoObjetivo = (v: unknown) => {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9_-]{1,40}$/.test(s) ? s : novoIdDeObjetivo();
};

/** A prova de que um objetivo foi cumprido: o print, o arquivo. Opcional, e de
 *  quem quiser deixar claro o que foi feito - não é condição de nada. */
interface EvidenciaDoObjetivo {
  id: number;
  objetivo_id: string;
  nome: string;
  tipo: string;
  tamanho: number;
}

/** O que a linha do objetivo precisa para carregar prova, já preso ao projeto
 *  daquela folha. Ausente onde a folha é só leitura. */
interface ProvasDosObjetivos {
  /** Todas as do projeto, na semana em foco. */
  lista: EvidenciaDoObjetivo[];
  anexar: (objetivoId: string, arquivos: File[]) => void;
  remover: (e: EvidenciaDoObjetivo) => void;
  abrir: (e: EvidenciaDoObjetivo) => void;
}

/** O combinado de um projeto numa semana: os objetivos dela, e a prova do que
 *  foi cumprido. */
interface PlanningDaSemana {
  objetivos: ObjetivoDaSemana[];
  evidencias: EvidenciaDoObjetivo[];
}

const PLANNING_VAZIA: PlanningDaSemana = { objetivos: [], evidencias: [] };

/**
 * Aba Planning: a reunião de planejamento da semana, projeto por projeto.
 *
 * A tela é feita para ser percorrida em voz alta com o time: escolhe-se o
 * projeto na divisória lateral, os devs puxam do backlog o que entra em cada
 * dia, e o que a sala combina fica escrito ali mesmo - os objetivos da
 * semana, gravados por projeto e por semana, para a planning seguinte poder
 * abrir a anterior e conferir.
 *
 * Só projetos em andamento: planning é sobre o que está correndo, e uma lista
 * com os pausados obrigaria a escolher entre eles a cada segunda-feira.
 */
function AbaPlanning({
  projetos, pessoas, planning, semana, onMudarSemana, onSalvarPlanning, onReordenar, provasDe,
  onAbrir, onSalvarTarefa, onAbrirTarefa, onCriarTarefa, onExcluirTarefa,
  etapas, etapaDeEntrada, etapaDeConclusao, podeEditar, podeEditarTarefa, podeExcluirTarefa,
  entregasDe, funil, secao, onVerProjeto, onAbrirOportunidade, foco,
}: {
  /** O projeto a pôr na tela, pedido de fora da Planning. */
  foco?: { id: string; nonce: number } | null;
  /** Monta a seção de entregas de um projeto. */
  entregasDe: (p: Projeto) => React.ReactNode;
  projetos: Projeto[];
  pessoas: Pessoa[];
  /** O combinado de todos os projetos na semana em foco, por id de projeto. */
  planning: Record<string, PlanningDaSemana>;
  semana: Date;
  onMudarSemana: (d: Date) => void;
  onSalvarPlanning: (projetoId: string, dados: PlanningDaSemana) => void;
  /** A ordem nova das divisórias, com todos os ids. */
  onReordenar: (ids: string[]) => void;
  /** Cria uma tarefa no projeto, com prazo no dia ou sem prazo, e abre o painel. */
  onCriarTarefa: (p: Projeto, status: string) => void;
  onAbrir: (p: Projeto) => void;
  onSalvarTarefa: (t: Tarefa, mudancas: Record<string, unknown>) => void;
  onAbrirTarefa: (t: Tarefa, p: Projeto) => void;
  /** Pede a exclusão: quem confirma é o diálogo da página. */
  onExcluirTarefa: (t: Tarefa) => void;
  etapas: EtapaTarefa[];
  etapaDeEntrada: string;
  etapaDeConclusao: string;
  podeEditar: boolean;
  podeEditarTarefa: boolean;
  podeExcluirTarefa: boolean;
  /** As oportunidades para a folha do Funil. Nulo para quem não vê o funil - e
   *  aí a aba não aparece. */
  funil: FunilDaPlanning | null;
  /** Qual reunião está na tela: os projetos, com as divisórias; todos os
   *  objetivos juntos, por cliente; ou o comercial, com a folha do funil. */
  secao: SecaoDaPlanning;
  /** Volta para a folha de um projeto a partir da visão de objetivos. */
  onVerProjeto: (id: string) => void;
  /** Leva à tela do Funil com a oportunidade aberta. */
  onAbrirOportunidade?: (id: string) => void;
  /** Como prender um print a um objetivo, projeto por projeto. Ausente para
   *  quem não edita. */
  provasDe?: (projetoId: string) => ProvasDosObjetivos;
}) {
  const dias = useMemo(() => diasUteisDaSemana(semana), [semana]);

  // A ordem da reunião é a que a sala arrumou arrastando as divisórias. Projeto
  // que ainda não foi posto em lugar nenhum - um recém-criado, por exemplo -
  // entra depois dos arrumados, pela prioridade, que é a decisão que a casa já
  // tomou sobre o que importa mais.
  const lista = useMemo(() => {
    const urgencia = (p: Projeto) => {
      const i = PRIORIDADES.indexOf((p.prioridade ?? PRIORIDADE_PADRAO) as typeof PRIORIDADES[number]);
      return i < 0 ? PRIORIDADES.length : i;
    };
    const posicao = (p: Projeto) => (p.planning_ordem == null ? null : Number(p.planning_ordem));
    const ordenados = projetos
      .filter(p => p.id !== PROJETO_GERAL && p.status === 'Em andamento')
      .sort((a, b) => {
        const pa = posicao(a);
        const pb = posicao(b);
        if (pa != null && pb != null && pa !== pb) return pa - pb;
        if (pa != null && pb == null) return -1;
        if (pa == null && pb != null) return 1;
        return urgencia(a) - urgencia(b);
      });
    // A Geral abre a reunião, presa no alto e fora do arraste: o que é da casa
    // inteira vem antes de passar projeto por projeto. O Funil não entra aqui:
    // ele é a outra reunião, a do comercial, com a folha dele.
    const geral = projetos.find(p => p.id === PROJETO_GERAL);
    return [...(geral ? [geral] : []), ...ordenados];
  }, [projetos]);

  const [ativo, setAtivo] = useState<string | null>(null);
  // O pedido de fora escolhe a divisória. Só vale quando o projeto está na
  // lista; fora dela, a folha que abriria seria outra, e o clique enganaria.
  useEffect(() => {
    if (foco && lista.some(p => p.id === foco.id)) setAtivo(foco.id);
  }, [foco?.nonce, lista]);
  // O projeto escolhido, ou o primeiro da lista. Guardado por id e não por
  // posição: a lista se reordena quando alguém muda uma prioridade, e a folha
  // não pode trocar de projeto por causa disso.
  const atual = lista.find(p => p.id === ativo) ?? lista[0] ?? null;

  /** O número na divisória: quantos objetivos aquele projeto tem combinados para
   *  esta semana. Era a contagem de tarefas do quadro, que a folha já mostra
   *  logo abaixo; o que a sala quer saber antes de entrar é se o projeto já tem
   *  semana combinada, e é o objetivo que diz isso. */
  const objetivosDaSemana = useCallback(
    (p: Projeto) => (planning[p.id]?.objetivos ?? []).length, [planning]);

  // Todos os objetivos juntos, por cliente: a leitura de cima da mesma reunião.
  // Largura inteira, como o comercial - não há divisória a escolher.
  if (secao === 'objetivos') {
    return (
      <div className="pl-sheet pl-sheet-inteira">
        <FolhaDosObjetivos
          lista={lista}
          planning={planning}
          pessoas={pessoas}
          podeEditar={podeEditar}
          provasDe={provasDe}
          onMudarObjetivos={(projetoId, objetivos) => onSalvarPlanning(projetoId, {
            ...(planning[projetoId] ?? PLANNING_VAZIA),
            objetivos,
          })}
          onVerProjeto={id => { setAtivo(id); onVerProjeto(id); }} />
      </div>
    );
  }

  // O comercial: a folha do funil sozinha, em largura inteira. Não há
  // divisória a escolher - é uma reunião só, sobre o funil inteiro.
  if (secao === 'comercial' && funil) {
    return (
      <div className="pl-sheet pl-sheet-inteira">
        <FolhaDoFunil
          semana={semana}
          dias={dias}
          funil={funil}
          planning={planning[PLANNING_FUNIL] ?? PLANNING_VAZIA}
          pessoas={pessoas}
          podeEditar={podeEditar}
          onAbrirOportunidade={onAbrirOportunidade}
          provas={provasDe?.(PLANNING_FUNIL)}
          onMudarPlanning={dados => onSalvarPlanning(PLANNING_FUNIL, {
            ...(planning[PLANNING_FUNIL] ?? PLANNING_VAZIA),
            ...dados,
          })} />
      </div>
    );
  }

  if (lista.length === 0) {
    return (
      <div className="admin-empty" style={{ padding: '48px 0' }}>
        <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={30} /></p>
        <p>Nenhum projeto em andamento para planejar.</p>
      </div>
    );
  }

  return (
    <>
      <div className="pl-pagina">
        <AbasDeCaderno lista={lista} ativo={atual?.id ?? null} contagem={objetivosDaSemana}
          podeReordenar={podeEditar} onEscolher={setAtivo}
          // Antes de mudar a ordem, a folha aberta fica presa pelo id. Sem
          // clique nenhum ela e "a primeira da lista", e arrastar outro projeto
          // para o topo trocaria o projeto aberto sem ninguem ter escolhido.
          onReordenar={ids => {
            if (!ativo && atual) setAtivo(atual.id);
            onReordenar(ids.filter(id => id !== PROJETO_GERAL && id !== PLANNING_FUNIL));
          }} />

        <div className="pl-sheet" role="tabpanel">
          {atual && (
            <FolhaDaPlanning
              projeto={atual}
              semana={semana}
              dias={dias}
              pessoas={pessoas}
              planning={planning[atual.id] ?? PLANNING_VAZIA}
              podeEditar={podeEditar}
              podeEditarTarefa={podeEditarTarefa}
              podeExcluirTarefa={podeExcluirTarefa}
              etapas={etapas}
              etapaDeEntrada={etapaDeEntrada}
              etapaDeConclusao={etapaDeConclusao}
              onAbrir={onAbrir}
              onAbrirTarefa={onAbrirTarefa}
              onSalvarTarefa={onSalvarTarefa}
              onExcluirTarefa={onExcluirTarefa}
              onCriarTarefa={status => onCriarTarefa(atual, status)}
              entregas={atual.id === PROJETO_GERAL ? null : entregasDe(atual)}
              provas={provasDe?.(atual.id)}
              onMudarPlanning={dados => onSalvarPlanning(atual.id, {
                ...(planning[atual.id] ?? PLANNING_VAZIA),
                ...dados,
              })} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Formulário ───────────────────────────────────────────────────────────────

function FormularioProjeto({
  editando, base, pessoas, clientes, salvando, abertura, onFechar, onSalvar,
  onCriarTarefa, onAbrirTarefa, onExcluirTarefa, onMoverTarefa,
  onFixarRecolhida, podeEditarTarefa, etapasTarefa, onBaixarAnexo, onVerAnexo, onEtiquetar,
  marcadores, submarcadores, onExcluir, somenteLeitura, onVerTarefasDaEntrega,
  onRegistrarReuniao, onVincularReuniao,
  onBuscarReunioesFireflies, onBuscarGravacaoFireflies, onBuscarTranscricaoFireflies,
  onAnexarReuniaoFireflies,
  onExcluirReuniao,
  onPublicar, onSalvarEntrega, onExcluirEntrega, onSubirEvidencia, onBaixarEvidencia, onVerEvidencia,
  onAnexarNaEntrega, onRemoverAnexoDaEntrega, onVerAnexoDaEntrega, onBaixarAnexoDaEntrega,
  acessos,
}: {
  editando: Projeto | null;
  /** Com que rascunho o painel abre enquanto o projeto ainda não voltou do
   *  servidor. É o mesmo objeto que foi gravado no clique. */
  base?: Rascunho;
  /** Em que aba a ficha abre, e que reunião já vem aberta. Vem do inbox, que
   *  acabou de atrelar uma - quem abre pela lista não pede nada disto. */
  abertura?: { aba?: 'reunioes'; reuniao?: number } | null;
  pessoas: Pessoa[];
  clientes: Cliente[];
  salvando: boolean;
  /** Sai para a tela de Tarefas, estreitada numa entrega deste projeto. */
  onVerTarefasDaEntrega?: (entregaId: number) => void;
  /** Cria uma tarefa dentro da entrega, do próprio painel do projeto. */
  /** Cria uma tarefa neste projeto e abre o painel dela. Sem entrega quando
   *  `entregaId` é nulo, que é o caso da aba Tarefas. */
  onCriarTarefa: (p: Projeto, entregaId: number | null, status?: string) => void;
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
  onRegistrarReuniao: (
    p: Projeto,
    r: { data: string; assunto: string; notas: string; participantes: string[] },
  ) => Promise<void>;
  onVincularReuniao: (reuniaoId: number, tipo: 'entrega', alvoId: number, ligar: boolean) => void;
  onBuscarReunioesFireflies: (busca: string) => Promise<{ reunioes?: ReuniaoFF[]; error?: string }>;
  onBuscarGravacaoFireflies: (firefliesId: string) => Promise<{ video?: string | null; audio?: string | null; error?: string }>;
  onBuscarTranscricaoFireflies: (firefliesId: string) => Promise<Transcricao | null>;
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
  /** Guardar, tirar e abrir os acessos deste projeto. Ausente enquanto ele
   *  ainda não existe: não há a que prender um login. */
  acessos?: AcessosDoProjeto;
  onSalvarEntrega: (p: Projeto, dados: EntregaPendente, id?: number) => Promise<void>;
  onExcluirEntrega: (e: Entrega) => void;
  onSubirEvidencia: (e: Entrega, arquivos: FileList | null, comentario?: string, etapa?: string) => Promise<void>;
  onBaixarEvidencia: (ev: Evidencia) => void;
  onVerEvidencia: (ev: Evidencia) => void;
  onAnexarNaEntrega: (entregaId: number, arquivos: FileList) => void;
  onRemoverAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
  onVerAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
  onBaixarAnexoDaEntrega: (a: ArquivoDaEntrega) => void;
}) {
  const [r, setR] = useState<Rascunho>(() => editando ? {
    nome: editando.nome, descricao: editando.descricao ?? '',
    cliente_id: editando.cliente_id ?? '',
    tipo: editando.tipo ?? '',
    repositorios: editando.repositorios ?? [],
    drives: editando.drives ?? [],
    link_portal: editando.link_portal ?? '',
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
   *  mesmo formato que o Funil usa em `?oportunidade=`. */
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

  // Projeto novo não tem tarefa nem reunião a que se prender, então só existe
  // "Geral" até ele ser criado.
  const [abaModal, setAbaModal] = useState<'geral' | 'tarefas' | 'reunioes'>(
    abertura?.aba ?? 'geral');
  /** Entrega para onde a tela deve ir, vinda do chip de uma reunião. */
  const [entregaFocada, setEntregaFocada] = useState<number | null>(null);
  /** E o caminho inverso: a reunião que o chip da entrega quer mostrar - ou a
   *  que o inbox acabou de atrelar, quando a ficha abriu por ele. */
  const [reuniaoFocada, setReuniaoFocada] = useState<number | null>(abertura?.reuniao ?? null);

  // O pedido de abertura também chega com a ficha já montada: quem estava com
  // um projeto aberto e vinculou uma reunião pelo inbox continua na mesma
  // instância do painel, e o estado inicial acima não roda de novo. Sem isto, a
  // ficha trocava de projeto mas ficava na aba Geral.
  useEffect(() => {
    if (!abertura) return;
    if (abertura.aba) setAbaModal(abertura.aba);
    if (abertura.reuniao) setReuniaoFocada(abertura.reuniao);
  }, [abertura]);
  /** A reunião aberta no modal central. Quem clica no chip dentro da entrega
   *  quer ver a conversa, e não ser levado para outra aba para procurá-la. */
  const [reuniaoAberta, setReuniaoAberta] = useState<Reuniao | null>(null);
  /** E a entrega aberta pelo chip de dentro de uma reunião, pelo mesmo motivo. */
  const [entregaAberta, setEntregaAberta] = useState<Entrega | null>(null);
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
              <p className="painel-rotulo">
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
          </div>

          {editando && (
            <Abas
              valor={abaModal}
              onChange={setAbaModal}
              style={{ marginBottom: 0, marginTop: 6 }}
              opcoes={[
                { valor: 'geral', label: 'Geral' },
                { valor: 'tarefas', label: 'Tarefas' },
                { valor: 'reunioes', label: 'Reuniões' },
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
        {/* Na aba do quadro o corpo deixa de rolar e vira moldura: quem rola
            passa a ser cada coluna, como na tela de Tarefas. Sem isso o quadro
            tinha uma altura chutada e sobrava faixa morta embaixo dele. */}
        <div className={`admin-modal-body aba-painel${abaModal === 'tarefas' ? ' corpo-do-quadro' : ''}`}
          key={abaModal}>

          {editando && abaModal === 'tarefas' && (
            <TarefasDoProjeto
              projeto={editando}
              etapas={etapasTarefa}
              pessoas={pessoas}
              podeEditar={!somenteLeitura && podeEditarTarefa}
              onAbrir={onAbrirTarefa}
              // Sem entrega: é tarefa do projeto.
              onCriar={status => onCriarTarefa(editando, null, status)}
              onExcluir={onExcluirTarefa}
              onMover={onMoverTarefa}
              onFixarRecolhida={onFixarRecolhida} />
          )}

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
              // O chip abre a entrega ali mesmo: etapa, andamento, tarefas e
            // as reuniões que trataram dela.
            onAbrirEntrega={id => {
              const e = (editando?.entregas ?? []).find(x => x.id === id);
              if (e) setEntregaAberta(e);
            }}
              salvando={salvando}
              onRegistrar={reg => onRegistrarReuniao(editando, reg)}
              onBuscarFireflies={onBuscarReunioesFireflies}
              onBuscarGravacao={onBuscarGravacaoFireflies}
          onBuscarTranscricao={onBuscarTranscricaoFireflies}
              onAnexarFireflies={ids => onAnexarReuniaoFireflies(editando, ids)}
              onExcluir={onExcluirReuniao}
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
                      descricao: DESCRICAO_PRIORIDADE[x],
                    }))}
                  />
                  {erros.prioridade && <p className="form-error">{erros.prioridade}</p>}
                </div>
              </div>
              <CampoEndereco rotulo="Link de acesso" valor={r.link_portal}
                placeholder="https://portal.cliente.com.br/"
                dica="Endereço do que foi entregue. Aparece na página do cliente."
                somenteLeitura={somenteLeitura} onChange={v => set('link_portal', v)} />
              <ChipsDeEndereco
                rotulo="Repositórios no GitHub"
                valores={r.repositorios}
                marca="github"
                teto={MAX_REPOSITORIOS}
                exemplo="https://github.com/sheeptechservices/portal-sheep"
                somenteLeitura={somenteLeitura}
                onChange={v => set('repositorios', v)} />
              <ChipsDeEndereco
                rotulo="Pastas no Drive"
                valores={r.drives}
                marca="drive"
                exemplo="https://drive.google.com/drive/folders/..."
                somenteLeitura={somenteLeitura}
                onChange={v => set('drives', v)} />
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

          {/* Fora do `fieldset`, e só com projeto gravado: cada acesso grava
              sozinho, por ação própria, e não junto com o resto da ficha - a
              senha passa pela cifra do servidor, e não por este formulário. */}
          {editando && acessos && (
            <SecaoAcessos acessos={editando.acessos ?? []} somenteLeitura={somenteLeitura}
              acoes={acessos} />
          )}

          {/* Fora do `fieldset`: abrir uma entrega, ver a prova anexada, buscar,
              agrupar e trocar de visão é leitura, e continua valendo para quem
              só olha. O que edita, a seção esconde sozinha. */}
          <SecaoEntregas
            somenteLeitura={somenteLeitura}
            entregas={editando?.entregas ?? []}
            reunioes={editando?.reunioes ?? []}
            focada={entregaFocada}
            onVincular={onVincularReuniao}
            // O chip abre a reunião ali mesmo: gravação, índice e resumos.
            onAbrirReuniao={id => {
              const r = (editando?.reunioes ?? []).find(x => x.id === id);
              if (r) setReuniaoAberta(r);
            }}
            pendentes={r.entregas}
            tarefas={editando?.tarefas ?? []}
            onVerTarefasDaEntrega={onVerTarefasDaEntrega}
            // Sem projeto gravado não há entrega gravada, e a lista nem aparece.
            onCriarTarefa={(entregaId, status) =>
              editando && onCriarTarefa(editando, entregaId, status)}
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
            onAnexarNaEntrega={onAnexarNaEntrega}
            onRemoverAnexoDaEntrega={onRemoverAnexoDaEntrega}
            onVerAnexoDaEntrega={onVerAnexoDaEntrega}
            onBaixarAnexoDaEntrega={onBaixarAnexoDaEntrega}
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

      {/* A reunião aberta pelo chip de uma entrega. Fora do painel porque é
          modal central: ela cobre a tela, e não a gaveta. */}
      {reuniaoAberta && (
        <ReuniaoModal
          reuniao={reuniaoAberta}
          buscarGravacao={onBuscarGravacaoFireflies}
          buscarTranscricao={onBuscarTranscricaoFireflies}
          onFechar={() => setReuniaoAberta(null)}
        />
      )}

      {entregaAberta && (() => {
        const Marca = ICONE_ENTREGA[entregaAberta.status] ?? IconMarcoPlanejado;
        const cor = COR_ENTREGA[entregaAberta.status] ?? 'var(--gray2)';
        const daEntrega = (editando?.tarefas ?? []).filter(t => t.entrega_id === entregaAberta.id);
        return (
          <EntregaModal
            entrega={entregaAberta}
            cor={cor}
            icone={<Marca size={14} />}
            avatares={entregaAberta.responsaveis.length > 0 ? (
              <>
                {entregaAberta.responsaveis.map(id => {
                  const p = pessoas.find(x => x.id === id);
                  return (
                    <span key={id} title={p?.nome ?? 'Usuário removido'}>
                      <Avatar nome={p?.nome ?? '?'} foto={p?.foto_url} size={20} />
                    </span>
                  );
                })}
              </>
            ) : undefined}
            tarefas={daEntrega.map(t => ({
              id: t.id,
              titulo: t.titulo,
              status: t.status,
              cor: etapasTarefa.find(x => x.nome === t.status)?.cor ?? 'var(--gray2)',
              feita: !!t.concluida_em,
            }))}
            reunioes={(editando?.reunioes ?? [])
              .filter(r => (r.entregas ?? []).includes(entregaAberta.id))
              .map(r => ({
                id: r.id, assunto: r.assunto, data: r.data, fireflies: !!r.fireflies_id,
              }))}
            // De uma para a outra sem passar pela lista: a entrega abre a
            // reunião, e a reunião abre a entrega.
            onAbrirReuniao={id => {
              const r = (editando?.reunioes ?? []).find(x => x.id === id);
              if (r) { setEntregaAberta(null); setReuniaoAberta(r); }
            }}
            onAbrirTarefa={id => {
              const t = (editando?.tarefas ?? []).find(x => x.id === id);
              if (t) { setEntregaAberta(null); onAbrirTarefa(t); }
            }}
            onFechar={() => setEntregaAberta(null)}
          />
        );
      })()}
    </div>,
    document.body,
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

type Aba = 'geral' | 'planning';

export default function ProjetosPage({ token, onVerTarefasDaEntrega, abrir, onAbriu, onAbrirOportunidade }: {
  token: string;
  /** Leva à tela do Funil com a oportunidade aberta: é de lá que um card é
   *  mexido, e a folha do Funil na Planning só o mostra. */
  onAbrirOportunidade?: (id: string) => void;
  /** Entregue pelo painel: leva à tela de Tarefas já filtrada numa entrega. */
  onVerTarefasDaEntrega?: (projetoId: string, entregaId: number) => void;
  /** O projeto que a busca rápida escolheu. O `nonce` faz o mesmo projeto
   *  reabrir quando se busca por ele de novo depois de ter fechado a ficha.
   *
   *  `aba` e `reuniao` vêm do inbox, quando ele acaba de atrelar uma reunião:
   *  a ficha abre na aba de Reuniões, com aquela aberta. */
  abrir?: {
    id: string; nonce: number; aba?: 'reunioes' | 'planning'; reuniao?: number;
    /** Com `aba: 'planning'`: a segunda-feira da semana (AAAA-MM-DD) e se o
     *  projeto tem divisória própria lá. Sem divisória, o objetivo aparece na
     *  visão de todos os objetivos. */
    semana?: string; divisoria?: boolean;
  };
  onAbriu?: () => void;
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
  /** A ficha que a busca rápida pediu. Espera a lista chegar: o alvo pode
   *  aterrissar antes dela, e abrir uma ficha vazia seria pior do que esperar
   *  um instante. */
  const [alvoDaBusca, setAlvoDaBusca] = useState<string | null>(null);
  /** Com o que a ficha deve abrir, quando quem pediu sabe mais que o id: a aba
   *  e a reunião que o inbox acabou de atrelar. */
  const [aberturaPedida, setAberturaPedida] =
    useState<{ aba?: 'reunioes'; reuniao?: number } | null>(null);
  /** O projeto que acabou de nascer do clique em "Novo projeto", enquanto o
   *  painel dele está aberto. A promessa existe porque a primeira gravação
   *  automática pode sair antes de o servidor dizer que id ele deu. */
  const nascendo = useRef<{ promessa: Promise<string | null>; id: string | null } | null>(null);
  /** Id recém-nascido esperando aparecer na listagem para o painel trocar de
   *  "novo" para "editando" - sem remontar, que o que já foi digitado fica. */
  const [idNascido, setIdNascido] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState<Projeto | null>(null);
  /** Arquivo aberto em prévia, sem sair do portal. `fonte` diz de onde buscar
   *  o conteúdo: anexo do projeto e evidência de entrega vivem em tabelas
   *  diferentes, com ações próprias. */
  const [previa, setPrevia] = useState<
    { fonte: 'anexo'; item: Arquivo }
    | { fonte: 'evidencia'; item: Evidencia }
    | { fonte: 'entrega_arquivo'; item: ArquivoDaEntrega }
    | { fonte: 'objetivo'; item: EvidenciaDoObjetivo }
    | null
  >(null);
  /** A segunda-feira da semana em foco na Planning. Uma data, e não um texto:
   *  andar de semana é somar sete dias, e o texto sai dela. */
  const [semanaDaPlanning, setSemanaDaPlanning] = useState(() => segundaDaSemana());
  /** O projeto que a Planning deve pôr na tela, pedido de fora (o alvo dos
   *  objetivos). O `nonce` faz o mesmo pedido valer de novo. */
  const [focoDaPlanning, setFocoDaPlanning] = useState<{ id: string; nonce: number } | null>(null);
  /** O combinado de cada projeto na semana em foco, por id de projeto. */
  const [planning, setPlanning] = useState<Record<string, PlanningDaSemana>>({});

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

  // As oportunidades da folha do Funil, pela mesma leitura do quadro do Funil.
  // Só com a Planning à vista e só para quem vê o funil: para os outros a aba
  // nem existe. Cada volta à Planning relê, porque o comercial anda entre uma
  // reunião e outra; enquanto relê, a folha mostra o que já tinha.
  const veFunil = pode('oportunidades:ver');
  const [funil, setFunil] = useState<FunilDaPlanning>({ carregando: true, etapas: [], oportunidades: [] });
  /** Qual das duas reuniões está na tela. Guardada no navegador de quem usa: o
   *  comercial abre a Planning no comercial, e o time de projetos, nos projetos. */
  const [secaoPlanning, setSecaoPlanning] = useState<SecaoDaPlanning>(() => {
    try {
      const guardada = localStorage.getItem('planning:secao');
      return guardada === 'comercial' || guardada === 'objetivos' ? guardada : 'projetos';
    } catch { return 'projetos'; }
  });
  const mudarSecaoPlanning = useCallback((s: SecaoDaPlanning) => {
    setSecaoPlanning(s);
    try { localStorage.setItem('planning:secao', s); } catch { /* sem armazenamento, só não lembra */ }
  }, []);
  useEffect(() => {
    if (aba !== 'planning' || !veFunil) return;
    let vivo = true;
    setFunil(f => ({ ...f, carregando: true, erro: undefined }));
    api('?action=board')
      .then(r => {
        if (!vivo) return;
        if (!r || r.error) {
          setFunil(f => ({ ...f, carregando: false, erro: r?.error ?? 'O funil não veio. Tente de novo.' }));
          return;
        }
        setFunil({ carregando: false, etapas: r.statuses ?? [], oportunidades: r.submissions ?? [] });
      })
      .catch(() => { if (vivo) setFunil(f => ({ ...f, carregando: false, erro: 'O funil não veio. Tente de novo.' })); });
    return () => { vivo = false; };
  }, [aba, api, veFunil]);

  // O combinado da semana vem por ação própria, e só quando a Planning está à
  // vista: é um pedido a mais, e quem abre Projetos na aba Geral não o usa.
  // Trocar de semana recarrega, porque cada semana tem o seu.
  const semanaIso = iso10(semanaDaPlanning);
  // O quadro de objetivos do cabeçalho mexe num objetivo por fora da
  // Planning. Com ela aberta, a semana é relida: sem isso a próxima gravação
  // daqui, que regrava a lista inteira do projeto, desfaria o que mudou lá.
  const [releituraDaPlanning, setReleituraDaPlanning] = useState(0);
  useEffect(() => {
    const mudou = () => setReleituraDaPlanning(n => n + 1);
    window.addEventListener('objetivos:mudou', mudou);
    return () => window.removeEventListener('objetivos:mudou', mudou);
  }, []);
  useEffect(() => {
    if (aba !== 'planning') return;
    let vivo = true;
    void api(`?action=planning_semana&semana=${semanaIso}`).then(r => {
      if (!vivo || !Array.isArray(r?.planning)) return;
      const mapa: Record<string, PlanningDaSemana> = {};
      for (const x of r.planning) {
        mapa[String(x.projeto_id)] = {
          evidencias: (Array.isArray(x.evidencias) ? x.evidencias : []).map((e: any) => ({
            id: Number(e.id),
            objetivo_id: String(e.objetivo_id ?? ''),
            nome: String(e.nome ?? ''),
            tipo: String(e.tipo ?? ''),
            tamanho: Number(e.tamanho ?? 0),
          })),
          objetivos: Array.isArray(x.objetivos)
            ? x.objetivos.map((o: any) => ({
              id: idDoObjetivo(o?.id),
              texto: String(o?.texto ?? ''),
              feito: o?.feito === true,
              fazendo: o?.feito !== true && o?.fazendo === true,
              prazo: o?.prazo ? String(o.prazo) : null,
              responsaveis: Array.isArray(o?.responsaveis) ? o.responsaveis.map(String) : [],
              pai: o?.pai ? String(o.pai) : null,
              desejavel: o?.desejavel === true,
            }))
            : [],
        };
      }
      // O que ainda espera a pausa da digitação fica como está na tela: a
      // leitura saiu antes de a gravação chegar, e apagaria a frase recém-escrita.
      setPlanning(atual => {
        const junto = { ...mapa };
        for (const chave of gravando.current.keys()) {
          const [id, semana] = chave.split('|');
          if (semana === semanaIso && atual[id]) junto[id] = atual[id];
        }
        return junto;
      });
    });
    return () => { vivo = false; };
  }, [aba, api, semanaIso, releituraDaPlanning]);

  /** Prende uma prova a um objetivo. A linha mostra o chip na hora, com id
   *  provisório, e o id de verdade chega da gravação - recarregar a semana
   *  inteira para ver aparecer o print que se acabou de colar seria esperar
   *  duas vezes pela mesma coisa. */
  const anexarProva = useCallback((projetoId: string, objetivoId: string, arquivos: File[]) => {
    for (const arquivo of arquivos) {
      if (arquivo.size > LIMITE_DE_PROVA) {
        toast('error', 'Arquivo grande demais',
          `"${arquivo.name}" passa de 8 MB. Mande um recorte ou um link.`);
        continue;
      }
      const provisorio = -Date.now() - Math.floor(Math.random() * 1000);
      const linha: EvidenciaDoObjetivo = {
        id: provisorio, objetivo_id: objetivoId, nome: arquivo.name,
        tipo: arquivo.type || 'application/octet-stream', tamanho: arquivo.size,
      };
      const pintar = (f: (lista: EvidenciaDoObjetivo[]) => EvidenciaDoObjetivo[]) =>
        setPlanning(atual => ({
          ...atual,
          [projetoId]: {
            ...(atual[projetoId] ?? PLANNING_VAZIA),
            evidencias: f(atual[projetoId]?.evidencias ?? []),
          },
        }));
      pintar(lista => [...lista, linha]);
      void lerBase64(arquivo)
        .then(base64 => api('', 'POST', {
          action: 'add_planning_evidencia',
          projeto_id: projetoId, semana: semanaIso, objetivo_id: objetivoId,
          nome: arquivo.name, tipo: linha.tipo, tamanho: arquivo.size, base64,
        }))
        .then(r => {
          if (!r?.id) throw new Error(String(r?.error ?? 'sem id'));
          pintar(lista => lista.map(e => (e.id === provisorio ? { ...e, id: Number(r.id) } : e)));
        })
        .catch(() => {
          pintar(lista => lista.filter(e => e.id !== provisorio));
          toast('error', 'Não foi possível anexar', `"${arquivo.name}" não chegou ao servidor.`);
        });
    }
  }, [api, semanaIso, toast]);

  /** Tira a prova da linha. Some na hora e volta se o servidor recusar - por
   *  isso a lista de antes vem de quem chamou, que é quem a tem à mão. */
  const removerProva = useCallback((
    projetoId: string, prova: EvidenciaDoObjetivo, antes: EvidenciaDoObjetivo[],
  ) => {
    setPlanning(atual => ({
      ...atual,
      [projetoId]: {
        ...(atual[projetoId] ?? PLANNING_VAZIA),
        evidencias: (atual[projetoId]?.evidencias ?? []).filter(e => e.id !== prova.id),
      },
    }));
    void api('', 'POST', { action: 'excluir_planning_evidencia', id: prova.id })
      .then(r => { if (r?.error) throw new Error(String(r.error)); })
      .catch(() => {
        setPlanning(atual => ({
          ...atual,
          [projetoId]: { ...(atual[projetoId] ?? PLANNING_VAZIA), evidencias: antes },
        }));
        toast('error', 'Não foi possível tirar o anexo', `"${prova.nome}" continua lá.`);
      });
  }, [api, toast]);

  /** As provas daquele projeto, com o que fazer com elas. Preso ao projeto para
   *  a lista de objetivos não precisar saber de que folha ela é. */
  const provasDe = useCallback((projetoId: string): ProvasDosObjetivos => ({
    lista: planning[projetoId]?.evidencias ?? [],
    anexar: (objetivoId, arquivos) => anexarProva(projetoId, objetivoId, arquivos),
    remover: prova => removerProva(projetoId, prova, planning[projetoId]?.evidencias ?? []),
    abrir: prova => setPrevia({ fonte: 'objetivo', item: prova }),
  }), [planning, anexarProva, removerProva]);

  /** Grava o combinado de um projeto. Pinta na hora e manda depois, juntando as
   *  teclas: numa reunião se digita a frase inteira, e uma gravação por letra
   *  seria uma ida ao servidor a cada tecla de quem está falando. */
  const gravando = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; enviar: () => void }>());
  const salvarPlanning = useCallback((projetoId: string, dados: PlanningDaSemana) => {
    setPlanning(atual => ({ ...atual, [projetoId]: { ...atual[projetoId], ...dados } }));
    const chave = `${projetoId}|${semanaIso}`;
    const corpo = {
      action: 'salvar_planning_semana',
      projeto_id: projetoId,
      semana: semanaIso,
      objetivos: (dados.objetivos ?? []).map(o => ({
        id: o.id, texto: o.texto, feito: o.feito, fazendo: !o.feito && o.fazendo === true,
        prazo: o.prazo, responsaveis: o.responsaveis,
        pai: o.pai ?? null,
        desejavel: o.desejavel === true,
      })),
    };
    const enviar = () => {
      gravando.current.delete(chave);
      // Queda de rede ou resposta que não é JSON rejeitam a promessa, e sem o
      // `catch` a falha era muda: a frase ficava na tela e não chegava ao banco.
      void api('', 'POST', corpo)
        .then(r => {
          if (r?.error) { toast('error', 'Não foi possível gravar os objetivos', r.error); return; }
          // O quadro de objetivos do cabeçalho relê ao ouvir isto: fixado ao
          // lado da Planning, ele risca o objetivo no instante em que se marca.
          window.dispatchEvent(new Event(EVENTO_PLANNING_GRAVADA));
        })
        .catch(() => toast('error', 'Não foi possível gravar os objetivos',
          'A conexão caiu antes de a gravação chegar. Escreva de novo quando voltar.'));
    };
    clearTimeout(gravando.current.get(chave)?.timer);
    gravando.current.set(chave, { timer: setTimeout(enviar, 700), enviar });
  }, [api, semanaIso, toast]);

  /** Leva um objetivo para a semana da data nova dele. Some desta Planning na
   *  hora e volta se o servidor recusar. A gravação pendente desta folha é
   *  cancelada: ela ainda tinha o objetivo, e chegaria depois trazendo-o de
   *  volta - a lista que fica vai com o pedido de mudança. */
  const moverObjetivo = useCallback((projetoId: string, objetivo: ObjetivoLevado, restante: ObjetivoLevado[]) => {
    const chave = `${projetoId}|${semanaIso}`;
    clearTimeout(gravando.current.get(chave)?.timer);
    gravando.current.delete(chave);
    let antes: PlanningDaSemana | undefined;
    setPlanning(atual => {
      antes = atual[projetoId];
      const folha = atual[projetoId] ?? PLANNING_VAZIA;
      return {
        ...atual,
        [projetoId]: {
          ...folha,
          objetivos: restante as ObjetivoDaSemana[],
          evidencias: folha.evidencias.filter(e => e.objetivo_id !== objetivo.id),
        },
      };
    });
    const serie = (o: ObjetivoLevado) => ({
      id: o.id, texto: o.texto, feito: o.feito, fazendo: !o.feito && o.fazendo === true,
      prazo: o.prazo, responsaveis: o.responsaveis, pai: o.pai ?? null, desejavel: o.desejavel === true,
    });
    void api('', 'POST', {
      action: 'mover_objetivo_de_semana', projeto_id: projetoId, semana: semanaIso,
      objetivo: serie(objetivo), objetivos: restante.filter(o => o.texto.trim()).map(serie),
    })
      .then(r => {
        if (!r?.ok) throw new Error(String(r?.error ?? 'sem confirmação'));
        toast('success', 'Objetivo levado de semana',
          `"${objetivo.texto}" foi para a semana de ${diaEMes(String(r.semana))}.`);
        window.dispatchEvent(new Event(EVENTO_PLANNING_GRAVADA));
      })
      .catch(e => {
        setPlanning(atual => ({ ...atual, [projetoId]: antes ?? atual[projetoId] }));
        toast('error', 'Não foi possível mudar a semana', e instanceof Error ? e.message : undefined);
      });
  }, [api, semanaIso, toast]);
  const contextoDaSemana = useMemo(
    () => ({ segunda: semanaIso, mover: moverObjetivo }), [semanaIso, moverObjetivo]);

  /** Arruma a ordem das divisórias. Pinta na hora - a divisória já está no
   *  lugar novo quando o dedo sai do mouse - e desfaz se o servidor recusar. */
  const reordenarPlanning = useCallback((ids: string[]) => {
    const antes = projetos;
    const posicao = new Map(ids.map((id, i) => [id, i + 1]));
    setProjetos(ps => ps.map(p => (posicao.has(p.id) ? { ...p, planning_ordem: posicao.get(p.id)! } : p)));
    mudancasRef.current++;
    void api('', 'POST', { action: 'ordenar_planning', ids }).then(r => {
      if (!r?.error) return;
      setProjetos(antes);
      toast('error', 'Não foi possível mudar a ordem', r.error);
    });
  }, [api, projetos, toast]);

  // A gravação pendente não pode morrer com a tela: quem troca de página logo
  // depois de escrever perderia a última frase. Ao sair, o que estava esperando
  // a pausa da digitação vai na hora, em vez de ser cancelado.
  useEffect(() => () => {
    for (const { timer, enviar } of [...gravando.current.values()]) { clearTimeout(timer); enviar(); }
  }, []);

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
  /** Cria a tarefa já gravada e abre o painel dela. `entregaId` nulo é tarefa
   *  do projeto, sem entrega - o que a aba Tarefas cria. */
  const criarTarefaNoProjeto = useCallback((
    p: Projeto, entregaId: number | null, status?: string, prazo?: string | null,
  ) => {
    const base: RascunhoTarefa = {
      projeto_id: p.id, entrega_id: entregaId == null ? '' : String(entregaId), titulo: TITULO_PADRAO,
      descricao: '', status: status || etapaDeEntrada, prioridade: PRIORIDADE_PADRAO,
      // O prazo vem da coluna da Planning em que o mais foi clicado: a tarefa
      // nasce no dia em que a sala a pôs, e o painel abre com ele preenchido.
      responsaveis: usuario?.id ? [usuario.id] : [], prazo: prazo ?? '', etiquetas: [],
    };
    setRascunhoTarefa(base);
    criandoTarefa.current = api('', 'POST', {
      action: 'salvar_tarefa', ...base, entrega_id: entregaId ?? '',
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
    prioridade: t.prioridade ?? PRIORIDADE_PADRAO, responsaveis: t.responsaveis ?? [],
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
      const dono = pessoas.find(x => x.id === r.responsaveis[0]);
      pintarTarefa(r.id, {
        titulo: r.titulo, descricao: r.descricao, status: r.status,
        prioridade: r.prioridade, prazo: r.prazo || null, etiquetas: r.etiquetas,
        entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
        responsaveis: r.responsaveis,
        responsavel_id: r.responsaveis[0] ?? null,
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
  // digitado continua lá, e as entregas, as reuniões e a publicação
  // passam a existir.
  useEffect(() => {
    if (!idNascido) return;
    const p = projetos.find(x => x.id === idNascido);
    if (!p) return;
    setIdNascido(null);
    setForm(f => (f && !f.editando ? { ...f, editando: p } : f));
  }, [idNascido, projetos]);

  // O alvo da busca rápida chega antes da listagem: a página acabou de montar,
  // e os projetos ainda estão vindo. Guardar o id e esperar é o que faz a ficha
  // abrir com o projeto dentro, em vez de abrir vazia e piscar depois.
  useEffect(() => {
    if (!abrir) return;
    // Vindo do alvo dos objetivos: a Planning, e não a ficha. A semana e o
    // projeto vão para ela; quem não tem divisória própria (demandas gerais,
    // projeto parado) é achado na visão de todos os objetivos.
    if (abrir.aba === 'planning') {
      setAba('planning');
      if (abrir.semana && /^\d{4}-\d{2}-\d{2}$/.test(abrir.semana)) {
        const [a, m, d] = abrir.semana.split('-').map(Number);
        setSemanaDaPlanning(new Date(a, m - 1, d));
      }
      mudarSecaoPlanning(abrir.divisoria ? 'projetos' : 'objetivos');
      if (abrir.divisoria) setFocoDaPlanning({ id: abrir.id, nonce: abrir.nonce });
      onAbriu?.();
      return;
    }
    setAlvoDaBusca(abrir.id);
    setAberturaPedida(abrir.aba || abrir.reuniao ? { aba: abrir.aba, reuniao: abrir.reuniao } : null);
    // Vindo com reunião, a listagem que está na tela é de antes de ela existir:
    // a ficha abriria sem a reunião que o clique acabou de criar. Recarregar
    // aqui, e só aqui, evita pagar a leitura inteira em toda abertura de ficha.
    if (abrir.reuniao) void carregar();
  }, [abrir?.nonce]);

  useEffect(() => {
    if (!alvoDaBusca) return;
    const p = projetos.find(x => x.id === alvoDaBusca);
    if (!p) return;
    // Com reunião pedida, a ficha só abre quando ela já está na lista - do
    // contrário a aba de Reuniões abriria sem a reunião do clique, e o "espere
    // um instante" viraria "não aconteceu nada".
    if (aberturaPedida?.reuniao && !(p.reunioes ?? []).some(r => r.id === aberturaPedida.reuniao)) return;
    setAlvoDaBusca(null);
    setAba('geral');
    setForm({ editando: p });
    onAbriu?.();
  }, [alvoDaBusca, projetos, aberturaPedida]);

  /** Fecha o painel. O projeto que ninguém tocou não fica: abrir e desistir não
   *  deveria deixar "Projeto sem nome" no quadro da casa. Qualquer alteração,
   *  por menor que seja, já o torna trabalho de alguém - e aí ele permanece. */
  async function fecharProjeto(intacto: boolean) {
    setForm(null);
    // O pedido de abertura vale para a ficha que acabou de fechar, e nao para a
    // proxima: sem zerar, reabrir qualquer projeto cairia na aba de Reunioes.
    setAberturaPedida(null);
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
        observacoes: campos.observacoes, repositorios: campos.repositorios,
        drives: campos.drives, link_portal: campos.link_portal,
      } : p)));
      reconciliar();
    } finally {
      setSalvando(false);
    }
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
        prioridade: dados.prioridade ?? null,
        status: String(r.status ?? 'Planejada'),
        ordem: Number(r.ordem ?? 0),
        evidencias: [],
        arquivos: [],
        // O campo saiu da tela e a entrega nova nasce sem ele; a coluna
        // continua guardando o que foi escrito antes de ele sair.
        links: [],
        tarefas_total: 0, tarefas_feitas: 0, progresso: 0,
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

  /** Anexa um ou vários de uma vez. Os envios vão em paralelo: três arquivos
   *  são três pedidos ao mesmo tempo, e não três idas em fila. */
  async function anexarNaEntrega(entregaId: number, escolhidos: FileList) {
    const lista = [...escolhidos];
    const grandes = lista.filter(f => f.size > LIMITE_ANEXO);
    if (grandes.length) {
      toast('error', 'Arquivo grande demais',
        `${grandes[0].name} passa de ${fmtTamanho(LIMITE_ANEXO)}.`);
      return;
    }
    const envios = lista.map(async f => {
      const base64 = await lerBase64(f);
      return api('', 'POST', {
        action: 'add_entrega_arquivo',
        entrega_id: entregaId, nome: f.name, tipo: f.type, tamanho: f.size, base64,
      });
    });
    const respostas = await Promise.all(envios);
    const ruim = respostas.find(r => r?.error);
    if (ruim) { toast('error', 'Não foi possível anexar', ruim.error); void recarregar(); return; }
    // O servidor devolve id e carimbo; o resto a tela já tem. Assim o anexo
    // aparece no gesto, sem esperar a listagem inteira voltar.
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p,
      entregas: (p.entregas ?? []).map(e => (e.id !== entregaId ? e : {
        ...e,
        arquivos: [...(e.arquivos ?? []), ...respostas.map(r => r as ArquivoDaEntrega)],
      })),
    })));
    toast('success', lista.length > 1 ? 'Anexos guardados' : 'Anexo guardado');
  }

  /** Some da tela na hora e volta se o servidor recusar. */
  async function removerAnexoDaEntrega(a: ArquivoDaEntrega) {
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p,
      entregas: (p.entregas ?? []).map(e => (e.id !== a.entrega_id ? e : {
        ...e, arquivos: (e.arquivos ?? []).filter(x => x.id !== a.id),
      })),
    })));
    const r = await api('', 'POST', { action: 'excluir_entrega_arquivo', id: a.id });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível remover', r.error); return; }
    toast('success', 'Anexo removido');
  }

  async function baixarAnexoDaEntrega(a: ArquivoDaEntrega) {
    const r = await api(`?action=entrega_arquivo_base64&id=${a.id}`);
    if (!r?.base64) { toast('error', 'Não deu', 'O anexo não veio.'); return; }
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  /** Baixa o que estiver naquele endereço. O de sempre - o servidor devolve
   *  nome, tipo e conteúdo -, sem uma função por tabela. */
  async function baixarArquivo(endereco: string) {
    const r = await api(endereco);
    if (!r?.base64) { toast('error', 'Não deu', 'O arquivo não veio.'); return; }
    const link = document.createElement('a');
    link.href = `data:${r.tipo};base64,${r.base64}`;
    link.download = r.nome;
    link.click();
  }

  /** Os acessos de um projeto, ligados ao servidor. Presos ao projeto aberto,
   *  que é o único que a gaveta mostra.
   *
   *  A lista pinta na hora e a senha nunca entra nela: sobe cifrada na gravação
   *  e só desce quando alguém pede, uma de cada vez. A lista de antes vem de
   *  quem chamou - é a seção que a tem à mão, e assim nada aqui precisa
   *  adivinhar o estado do outro lado. */
  const acoesDeAcesso = useCallback((projetoId: string): AcessosDoProjeto => ({
    salvar: async (dados, lista) => {
      const r = await api('', 'POST', {
        action: 'salvar_projeto_acesso', projeto_id: projetoId, ...dados,
      });
      if (!r?.id) {
        toast('error', 'Não foi possível gravar o acesso', r?.error ?? 'Tente de novo.');
        return null;
      }
      const id = Number(r.id);
      const linha: AcessoDoProjeto = {
        id,
        rotulo: dados.rotulo,
        usuario: dados.usuario || null,
        url: dados.url || null,
        // Senha ausente na edição quer dizer "a de antes continua lá".
        tem_senha: dados.senha === undefined
          ? lista.find(a => a.id === id)?.tem_senha ?? false
          : !!dados.senha,
      };
      setProjetos(ps => ps.map(x => (x.id === projetoId
        ? {
          ...x,
          acessos: lista.some(a => a.id === id)
            ? lista.map(a => (a.id === id ? linha : a))
            : [...lista, linha],
        }
        : x)));
      return id;
    },
    excluir: (acesso, lista) => {
      setProjetos(ps => ps.map(x => (x.id === projetoId
        ? { ...x, acessos: lista.filter(a => a.id !== acesso.id) } : x)));
      void api('', 'POST', { action: 'excluir_projeto_acesso', id: acesso.id })
        .then(r => { if (r?.error) throw new Error(String(r.error)); })
        .catch(() => {
          setProjetos(ps => ps.map(x => (x.id === projetoId ? { ...x, acessos: lista } : x)));
          toast('error', 'Não foi possível remover', `"${acesso.rotulo}" continua guardado.`);
        });
    },
    senha: async (acesso) => {
      const r = await api(`?action=projeto_acesso_senha&id=${acesso.id}`);
      if (typeof r?.senha !== 'string') {
        toast('error', 'Não foi possível abrir a senha', r?.error ?? 'Tente de novo.');
        return null;
      }
      return r.senha as string;
    },
  }), [api, toast]);

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
  /** A transcrição inteira, buscada no clique de baixar. */
  async function buscarTranscricaoFireflies(firefliesId: string) {
    const r = await api(`?action=fireflies_transcricao&id=${encodeURIComponent(firefliesId)}`);
    return r ?? { error: 'Sessão expirada.' };
  }

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
  /** Os projetos de verdade, sem a Geral: é o que a aba Geral lista, conta e
   *  filtra. A Geral só existe na Planning e nas tarefas. */
  const daCasa = useMemo(() => projetos.filter(p => p.id !== PROJETO_GERAL), [projetos]);

  const opcoes = useMemo(() => {
    const uniq = (vs: (string | null)[]) =>
      [...new Set(vs.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      status: uniq(daCasa.map(p => p.status)).map(v => ({ value: v, label: v })),
      cliente: uniq(daCasa.map(p => p.cliente_nome)).map(v => ({ value: v, label: v })),
      gestor: uniq(daCasa.map(p => gestorDe(p)?.nome ?? null)).map(v => ({ value: v, label: v })),
      tipo: uniq(daCasa.map(p => p.tipo)).map(v => ({ value: v, label: v })),
    };
  }, [daCasa]);

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
    return daCasa.filter(p =>
      (fStatus.length === 0 || fStatus.includes(p.status)) &&
      (fCliente.length === 0 || (p.cliente_nome && fCliente.includes(p.cliente_nome))) &&
      (fGestor.length === 0 || fGestor.includes(gestorDe(p)?.nome ?? '')) &&
      (fTipo.length === 0 || (p.tipo && fTipo.includes(p.tipo))) &&
      (!q || [p.nome, p.codigo, p.cliente_nome, p.descricao].some(v =>
        (v ?? '').toLocaleLowerCase('pt-BR').includes(q)))
    );
  }, [daCasa, fStatus, fCliente, fGestor, fTipo, busca]);

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
        opcoes={[{ valor: 'geral', label: 'Geral' }, { valor: 'planning', label: 'Planning' }]}
      />

      <div className={`admin-page-header${aba === 'planning' ? ' com-semana' : ''}`}>
        <div>
          <h1 className="admin-page-title">Projetos</h1>
          <p className="admin-page-desc">
            {aba === 'geral'
              ? 'Cadastro dos projetos da casa'
              : secaoPlanning === 'comercial' && veFunil
                ? 'A semana do comercial: os leads do funil e os objetivos'
                : secaoPlanning === 'objetivos'
                  ? 'Tudo o que a casa combinou para esta semana, por cliente'
                  : 'A semana de cada projeto, montada com o time'}
          </p>
        </div>
        {aba === 'geral' && podeCriar && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
            onClick={novoProjeto}>
            + Novo projeto
          </button>
        )}
        {aba === 'planning' && (
          <SeletorDeSemana semana={semanaDaPlanning} onMudar={setSemanaDaPlanning} />
        )}
        {/* As leituras da mesma semana: projeto por projeto, nas divisórias;
            todos os objetivos juntos, por cliente; e a reunião do comercial,
            que só quem vê o funil alcança. */}
        {aba === 'planning' && (
          <div className="pl-secoes">
            <SegSwitch valor={secaoPlanning} onChange={mudarSecaoPlanning}
              opcoes={[
                { valor: 'projetos', label: 'Projetos' },
                { valor: 'objetivos', label: 'Objetivos' },
                ...(veFunil ? [{ valor: 'comercial' as const, label: 'Comercial' }] : []),
              ]} />
          </div>
        )}
      </div>

      {/* O cabeçalho fica de fora: o título é o mesmo nas duas abas, e vê-lo
          reanimar a cada troca daria a impressão de que a página inteira
          recarregou. */}
      <AbaPainel key={aba} // O mesmo vao da pagina: aqui dentro os blocos sao os mesmos - cartoes,
        // filtros, busca e lista -, e um vao proprio deixava esta tela mais
        // solta que as outras.
        style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Os cartões são da aba Geral. Na Planning nem o esqueleto deles aparece,
          senão a tela prometeria uma faixa que não vem. */}
      {aba === 'planning' ? null : carregando ? (
        <CartoesKpiEsqueleto cartoes={5} />
      ) : daCasa.length > 0 && (
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
          <CartaoKpi rotulo="Progresso médio" valor={`${resumo.progresso}%`} nota="das entregas validadas"
            cor="#0066CC" atraso={0.15} />
        </div>
      )}

      {/* A barra de filtros é da aba Geral. Na Planning a reunião percorre a
          carteira inteira: recortá-la por cliente ou por tipo deixaria projeto
          de fora da conversa sem ninguém perceber. */}
      {aba === 'geral' && !carregando && daCasa.length > 0 && (
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
      {aba === 'geral' && !carregando && daCasa.length > 0 && (
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
        <SemanaDaPlanningCtx.Provider value={contextoDaSemana}>
        <AbaPlanning
          foco={focoDaPlanning}
          projetos={projetos}
          pessoas={pessoas}
          planning={planning}
          semana={semanaDaPlanning}
          onMudarSemana={setSemanaDaPlanning}
          onSalvarPlanning={salvarPlanning}
          provasDe={podeEditar ? provasDe : undefined}
          onReordenar={reordenarPlanning}
          onCriarTarefa={(p, status) => criarTarefaNoProjeto(p, null, status)}
          onSalvarTarefa={salvarTarefa}
          onAbrirTarefa={abrirTarefa}
          onExcluirTarefa={setExcluindoTarefa}
          etapas={etapasTarefa}
          etapaDeEntrada={etapaDeEntrada}
          etapaDeConclusao={etapaDeConclusao}
          podeEditar={podeEditar}
          podeEditarTarefa={pode('tarefas:editar')}
          podeExcluirTarefa={pode('tarefas:excluir')}
          onAbrir={p => setForm({ editando: p })}
          funil={veFunil ? funil : null}
          secao={veFunil || secaoPlanning !== 'comercial' ? secaoPlanning : 'projetos'}
          onVerProjeto={() => mudarSecaoPlanning('projetos')}
          onAbrirOportunidade={onAbrirOportunidade}
          // A mesma seção da ficha, ligada aos mesmos gestos da página: o que
          // se faz numa entrega aqui é o que se faria abrindo o projeto.
          entregasDe={p => (
            <SecaoEntregas
              naPlanning
              somenteLeitura={!podeEditar}
              entregas={p.entregas ?? []}
              reunioes={p.reunioes ?? []}
              onVincular={vincularReuniao}
              // A reunião mora na ficha: o chip abre o projeto já na aba de
              // reuniões, com ela aberta.
              onAbrirReuniao={id => {
                setAberturaPedida({ aba: 'reunioes', reuniao: id });
                setForm({ editando: p });
              }}
              pendentes={[]}
              onAlterarPendentes={() => {}}
              tarefas={p.tarefas ?? []}
              onVerTarefasDaEntrega={onVerTarefasDaEntrega
                ? entregaId => onVerTarefasDaEntrega(p.id, entregaId)
                : undefined}
              onCriarTarefa={(entregaId, status) => criarTarefaNoProjeto(p, entregaId, status)}
              onAbrirTarefa={abrirTarefa}
              onExcluirTarefa={setExcluindoTarefa}
              onMoverTarefa={moverTarefaDeEtapa}
              onFixarRecolhida={pode('configuracoes:etapas') ? fixarEtapaRecolhida : undefined}
              podeEditarTarefa={pode('tarefas:editar')}
              etapasTarefa={etapasTarefa}
              pessoas={pessoas}
              marcadores={marcadoresDeEntrega}
              submarcadores={submarcadoresDeEntrega}
              salvando={salvando}
              onSalvarEntrega={(dados, id) => salvarEntrega(p, dados, id)}
              onExcluirEntrega={excluirEntrega}
              onSubirEvidencia={subirEvidencia}
              onBaixarEvidencia={baixarEvidencia}
              onVerEvidencia={ev => setPrevia({ fonte: 'evidencia', item: ev })}
              onAnexarNaEntrega={anexarNaEntrega}
              onRemoverAnexoDaEntrega={removerAnexoDaEntrega}
              onVerAnexoDaEntrega={a => setPrevia({ fonte: 'entrega_arquivo', item: a })}
              onBaixarAnexoDaEntrega={baixarAnexoDaEntrega}
            />
          )}
        />
        </SemanaDaPlanningCtx.Provider>
      )}
      </AbaPainel>

      {form && (
        <FormularioProjeto
          // Versão viva da lista, e não o retrato de quando o modal abriu: o
          // retrato de abertura não mostraria o que acabou de ser gravado.
          editando={form.editando ? projetos.find(p => p.id === form.editando!.id) ?? form.editando : null}
          base={form.base}
          abertura={aberturaPedida}
          onVerTarefasDaEntrega={form.editando && onVerTarefasDaEntrega
            ? entregaId => onVerTarefasDaEntrega(form.editando!.id, entregaId)
            : undefined}
          onCriarTarefa={criarTarefaNoProjeto}
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
          onRegistrarReuniao={registrarReuniao}
          onVincularReuniao={vincularReuniao}
          onBuscarReunioesFireflies={buscarReunioesFireflies}
          onBuscarGravacaoFireflies={buscarGravacaoFireflies}
          onBuscarTranscricaoFireflies={buscarTranscricaoFireflies}
          onAnexarReuniaoFireflies={anexarReuniaoFireflies}
          onExcluirReuniao={excluirReuniao}
          onPublicar={publicarProjeto}
          acessos={podeEditar && form.editando ? acoesDeAcesso(form.editando.id) : undefined}
          onSalvarEntrega={salvarEntrega}
          onExcluirEntrega={excluirEntrega}
          onSubirEvidencia={subirEvidencia}
          onBaixarEvidencia={baixarEvidencia}
          onVerEvidencia={ev => setPrevia({ fonte: 'evidencia', item: ev })}
          onAnexarNaEntrega={anexarNaEntrega}
          onRemoverAnexoDaEntrega={removerAnexoDaEntrega}
          onVerAnexoDaEntrega={a => setPrevia({ fonte: 'entrega_arquivo', item: a })}
          onBaixarAnexoDaEntrega={baixarAnexoDaEntrega}
          onVerAnexo={a => setPrevia({ fonte: 'anexo', item: a })}
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
          // Criar entrega é editar projeto: sem essa permissão o seletor não
          // oferece, em vez de oferecer e o servidor recusar.
          onEntregaCriada={podeEditar ? (projetoId, entrega) => {
            mudancasRef.current++;
            setProjetos(ps => ps.map(x => (x.id === projetoId
              ? { ...x, entregas: [...(x.entregas ?? []), entrega] } : x)));
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
            chave: `${previa.fonte}:${previa.item.id}`,
          }}
          onCarregar={() => api(previa.fonte === 'evidencia'
            ? `?action=entrega_evidencia_base64&id=${previa.item.id}`
            : previa.fonte === 'entrega_arquivo'
              ? `?action=entrega_arquivo_base64&id=${previa.item.id}`
              : previa.fonte === 'objetivo'
                ? `?action=planning_evidencia_base64&id=${previa.item.id}`
                : `?action=projeto_arquivo_base64&id=${previa.item.id}`)}
          onBaixar={() => (previa.fonte === 'evidencia'
            ? void baixarEvidencia(previa.item)
            : previa.fonte === 'entrega_arquivo'
              ? void baixarAnexoDaEntrega(previa.item)
              : previa.fonte === 'objetivo'
                ? void baixarArquivo(`?action=planning_evidencia_base64&id=${previa.item.id}`)
                : void baixarAnexo(previa.item))}
          onFechar={() => setPrevia(null)}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao titulo={excluindo.nome} oQue="projeto" zIndex={1100}
          onCancelar={() => setExcluindo(null)} onConfirmar={() => void excluir(excluindo)} />
      )}
    </div>
  );
}
