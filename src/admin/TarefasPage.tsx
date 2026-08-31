// ─────────────────────────────────────────────────────────────────────────────
//  Tarefas.
//
//  O trabalho miúdo dos projetos, opcionalmente pendurado numa entrega. É daqui
//  que saem o andamento e o percentual de cada entrega: uma tarefa em curso põe
//  a entrega "Em andamento", uma tarefa com etiqueta de impedimento a põe
//  "Bloqueada", e a fração concluída vira o percentual. A regra mora no servidor
//  (`statusDeduzido`); esta tela só mostra o resultado.
//
//  Três visões da mesma lista: quadro para mover, lista para ler, tabela para
//  comparar. A carga é a mesma da tela de Projetos - as tarefas já vêm junto,
//  e já cortadas por equipe para quem é membro.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { iniciais, useAuth, useToast } from './AdminApp';
import {
  IconAgrupar, IconAlert, IconCalendario, IconCheck, IconChevronDown, IconInbox,
  IconOrdenar, IconSearch, IconTrash, IconUser, IconVisaoLista, IconVisaoQuadro,
  IconVisaoTabela, IconX,
} from '../components/icons';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';
import FilterDropdown from '../components/FilterDropdown';
import { SkeletonCards, SkeletonTabela } from '../components/Skeleton';
import { CartaoKpi, CartoesKpiEsqueleto } from '../components/CartaoKpi';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import {
  COR_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES, PRIORIDADE_PADRAO,
  useFecharNoFundo, type Projeto, type Tarefa,
} from './ProjetosPage';

/** Uma coluna do quadro. Nome, cor e ordem saem de Configurações > Etapas.
 *  `is_entrada` é onde a tarefa nasce e `is_conclusao` é o que conta como
 *  trabalho terminado - o mesmo par que a entrega lê para saber o andamento. */
export interface EtapaTarefa {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  is_entrada: number;
  /** A etapa de conversão: o que conta como feito no percentual da entrega. */
  is_conclusao: number;
  /** Desconsiderada: a tarefa some da conta da entrega, sem sair do quadro. */
  is_excluded: number;
  /** Etapa pontual: a coluna nasce recolhida, mesmo com tarefas. */
  always_collapsed: number;
}

/** Vale enquanto a lista não chegou do servidor, e é a mesma com que o sistema
 *  nasceu - assim o quadro não pisca com outro formato no primeiro quadro. */
export const ETAPAS_PADRAO: EtapaTarefa[] = [
  { id: -1, nome: 'A fazer', cor: '#6E6F69', ordem: 1, is_entrada: 1, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -2, nome: 'Em andamento', cor: '#B58300', ordem: 2, is_entrada: 0, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -3, nome: 'Em revisão', cor: '#7C3AED', ordem: 3, is_entrada: 0, is_conclusao: 0, is_excluded: 0, always_collapsed: 0 },
  { id: -4, nome: 'Concluída', cor: '#23A455', ordem: 4, is_entrada: 0, is_conclusao: 1, is_excluded: 0, always_collapsed: 0 },
];

/** As duas perguntas que as visões fazem sobre uma etapa, resolvidas uma vez só.
 *  Uma tarefa numa etapa que foi excluída ainda existe: cai no cinza e não
 *  conta como concluída, que é o mais próximo da verdade. */
function indexar(etapas: EtapaTarefa[]) {
  const mapa = new Map(etapas.map(e => [e.nome, e]));
  return {
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    fecha: (nome: string) => Number(mapa.get(nome)?.is_conclusao ?? 0) === 1,
    desconsidera: (nome: string) => Number(mapa.get(nome)?.is_excluded ?? 0) === 1,
  };
}

type Etapario = ReturnType<typeof indexar>;

/** As duas perguntas que as visões fazem sobre uma etiqueta. Etiqueta que saiu
 *  da configuração e ainda está numa tarefa cai no cinza e não trava nada. */
function indexarEtiquetas(etiquetas: EtiquetaTarefa[]) {
  const mapa = new Map(etiquetas.map(e => [e.nome, e]));
  return {
    lista: etiquetas,
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    trava: (nome: string) => Number(mapa.get(nome)?.bloqueia ?? 0) === 1,
  };
}

type Etiquetario = ReturnType<typeof indexarEtiquetas>;

/** Uma etiqueta de tarefa, como vem de Configurações > Etapas > Tarefas.
 *  `bloqueia` é a única que muda o comportamento do sistema: enquanto uma tarefa
 *  aberta a carrega, a entrega a que ela pende aparece como bloqueada. */
export interface EtiquetaTarefa {
  id: number;
  nome: string;
  cor: string;
  descricao: string | null;
  ordem: number;
  bloqueia: number;
  /** Papéis da equipe que enxergam a etiqueta. Vazio é "todo mundo", e só vale
   *  quando a regra está ligada em Configurações. */
  papeis: string[];
}

/** Quais etiquetas oferecer a quem está editando a tarefa.
 *
 *  A regra é sobre o papel de quem edita **naquele projeto**, e não sobre o
 *  papel dele no sistema: a mesma pessoa pode ser QA num projeto e Dev noutro.
 *  Quem não está na equipe - o gestor da casa olhando de fora - continua vendo
 *  tudo, senão a lista viria vazia justo para quem organiza o trabalho.
 *
 *  Isto governa o que a tela oferece, não o que o servidor aceita: etiqueta já
 *  aplicada continua na tarefa e continua aparecendo nas visões. */
export function etiquetasParaOPapel(
  todas: EtiquetaTarefa[], porPapel: boolean, projeto: Projeto | undefined, usuarioId: string | undefined,
): EtiquetaTarefa[] {
  if (!porPapel || !projeto || !usuarioId) return todas;
  const papel = projeto.equipe.find(m => m.id === usuarioId)?.papel;
  if (!papel) return todas;
  return todas.filter(e => e.papeis.length === 0 || e.papeis.includes(papel));
}

type TarefaComProjeto = Tarefa & { projeto: Projeto };

interface Pessoa { id: string; nome: string; email: string; foto_url: string | null }

/** Rascunho de tarefa, antes de virar linha. */
interface Rascunho {
  id?: number;
  projeto_id: string;
  entrega_id: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  responsavel_id: string;
  prazo: string;
  etiquetas: string[];
}

const VAZIO: Omit<Rascunho, 'status'> = {
  projeto_id: '', entrega_id: '', titulo: '', descricao: '',
  prioridade: PRIORIDADE_PADRAO, responsavel_id: '', prazo: '', etiquetas: [],
};

const ORDENS = [
  { valor: 'prazo', label: 'Prazo' },
  { valor: 'prioridade', label: 'Prioridade' },
  { valor: 'projeto', label: 'Projeto' },
  { valor: 'titulo', label: 'Título' },
] as const;

const AGRUPAMENTOS = [
  { valor: 'status', label: 'Status' },
  { valor: 'projeto', label: 'Projeto' },
  { valor: 'cliente', label: 'Cliente' },
  { valor: 'prioridade', label: 'Prioridade' },
] as const;

/** Um bloco da tela: a coluna do quadro, a seção da lista, a faixa da tabela.
 *  As três visões leem a mesma divisão, então trocar o agrupamento troca as
 *  três de uma vez. */
interface Grupo {
  chave: string;
  rotulo: string;
  cor: string;
  /** Desenho ao lado do rótulo, quando a dimensão tem um. */
  icone?: React.ReactNode;
  /** Só existem no agrupamento por status, e vêm da configuração da etapa. */
  recolhida?: boolean;
  desconsiderada?: boolean;
  tarefas: TarefaComProjeto[];
}

/** Arrastar só faz sentido quando o bloco é um campo da própria tarefa. Mudar
 *  de cliente ou de projeto arrastando seria mexer no cadastro por engano. */
const CAMPO_ARRASTAVEL: Record<string, 'status' | 'prioridade' | null> = {
  status: 'status', prioridade: 'prioridade', projeto: null, cliente: null,
};

const SEM_CLIENTE = 'Sem cliente';

/** Altura da lista de etiquetas: cabe o conjunto inteiro, até um teto. Rolar
 *  para achar a última é atrito num campo que se usa muito. */
const alturaDaLista = (n: number) => Math.min(8 + n * 38, 420);

/** As colunas de status e de prioridade vêm sempre inteiras, mesmo vazias: a
 *  ausência de tarefa numa etapa é informação, e sumir com a coluna esconde
 *  isso. Projeto e cliente só rendem bloco quando têm tarefa. */
function montarGrupos(
  tarefas: TarefaComProjeto[], criterio: string, etapas: EtapaTarefa[],
): Grupo[] {
  const junta = (chaveDe: (t: TarefaComProjeto) => string) => {
    const mapa = new Map<string, TarefaComProjeto[]>();
    for (const t of tarefas) {
      const k = chaveDe(t);
      const lista = mapa.get(k) ?? [];
      lista.push(t);
      mapa.set(k, lista);
    }
    return mapa;
  };

  if (criterio === 'prioridade') {
    const mapa = junta(t => t.prioridade || PRIORIDADE_PADRAO);
    return PRIORIDADES.map(p => ({
      chave: p,
      rotulo: p,
      cor: COR_PRIORIDADE[p] ?? '#6E6F69',
      icone: ICONE_PRIORIDADE[p]?.({ size: 13 }),
      tarefas: mapa.get(p) ?? [],
    }));
  }

  if (criterio === 'projeto' || criterio === 'cliente') {
    const mapa = junta(t => (criterio === 'projeto'
      ? t.projeto.nome
      : t.projeto.cliente_nome || SEM_CLIENTE));
    return [...mapa.entries()]
      // Sem cliente vai para o fim: é a ausência de um valor, não um valor.
      .sort((a, b) => (a[0] === SEM_CLIENTE ? 1 : b[0] === SEM_CLIENTE ? -1
        : a[0].localeCompare(b[0], 'pt-BR')))
      .map(([nome, lista]) => ({
        chave: nome, rotulo: nome, cor: 'var(--gray2)', tarefas: lista,
      }));
  }

  const mapa = junta(t => t.status);
  const grupos: Grupo[] = etapas.map(e => ({
    chave: e.nome,
    rotulo: e.nome,
    cor: e.cor,
    recolhida: !!e.always_collapsed,
    desconsiderada: !!e.is_excluded,
    tarefas: mapa.get(e.nome) ?? [],
  }));
  // Tarefa numa etapa que deixou de existir continua visível, num bloco à parte
  // - senão ela sumiria da tela sem ter sido apagada.
  for (const [nome, lista] of mapa) {
    if (!etapas.some(e => e.nome === nome)) {
      grupos.push({ chave: nome, rotulo: nome, cor: '#6E6F69', tarefas: lista });
    }
  }
  return grupos;
}

// ── Peças ───────────────────────────────────────────────────────────────────

function fmtData(iso: string | null): string {
  if (!iso) return '-';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** Dias até o prazo. Negativo é atraso. */
function diasPara(iso: string | null): number | null {
  if (!iso) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoje.getTime()) / 86400000);
}

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');

function Avatar({ nome, foto, size = 22 }: { nome: string; foto?: string | null; size?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return (
      <img src={foto} alt="" referrerPolicy="no-referrer" onError={() => setFalhou(true)} title={nome}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <span title={nome} style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--yellow)',
      color: 'var(--on-yellow)', fontSize: size * 0.43, fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{iniciais(nome)}</span>
  );
}

/** O lugar do avatar quando não há ninguém. Existe para a linha "Sem
 *  responsável" ficar alinhada com as outras: sem ela o rótulo encosta na
 *  borda e a lista parece desalinhada. */
function AvatarVazio({ size = 20 }: { size?: number }) {
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--gray4)',
      color: 'var(--gray2)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      <IconUser size={Math.round(size * 0.6)} />
    </span>
  );
}

function ChipStatus({ status, cor }: { status: string; cor: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700,
      color: cor, background: `${cor}1F`, padding: '2px 9px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cor, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function ChipEtiqueta({ etiqueta, cor = '#6E6F69' }: { etiqueta: string; cor?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.03em',
      color: cor, background: `${cor}1F`, padding: '2px 7px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

/** Prazo em texto, vermelho quando venceu e a tarefa não terminou. */
function Prazo({ iso, concluida }: { iso: string | null; concluida: boolean }) {
  if (!iso) return null;
  const dias = diasPara(iso);
  const atrasado = dias !== null && dias < 0 && !concluida;
  return (
    <span
      title={atrasado ? `${Math.abs(dias)} dia(s) de atraso` : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap',
        color: atrasado ? 'var(--red)' : 'var(--gray2)', fontWeight: atrasado ? 700 : 500,
      }}>
      <IconCalendario size={12} />
      {fmtData(iso)}
    </span>
  );
}

function Prioridade({ valor }: { valor: string }) {
  const Icone = ICONE_PRIORIDADE[valor || PRIORIDADE_PADRAO];
  if (!Icone) return null;
  return (
    <span title={`Prioridade: ${valor}`} style={{ display: 'inline-flex', color: 'var(--gray)' }}>
      <Icone size={14} />
    </span>
  );
}

// ── Página ──────────────────────────────────────────────────────────────────

export default function TarefasPage({ token }: { token: string }) {
  const { pode, usuario, onSessionExpired } = useAuth();
  const { toast } = useToast();

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [etapas, setEtapas] = useState<EtapaTarefa[]>(ETAPAS_PADRAO);
  const [etiquetas, setEtiquetas] = useState<EtiquetaTarefa[]>([]);
  const [etiquetaPorPapel, setEtiquetaPorPapel] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<TarefaComProjeto | null>(null);
  const [view, setView] = useState<'quadro' | 'lista' | 'tabela'>('quadro');

  const [fProjeto, setFProjeto] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fResponsavel, setFResponsavel] = useState<string[]>([]);
  const [fEtiqueta, setFEtiqueta] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState<string>('prazo');
  const [agrupamento, setAgrupamento] = useState<string>('status');

  const et = useMemo(() => indexar(etapas), [etapas]);
  const etq = useMemo(() => indexarEtiquetas(etiquetas), [etiquetas]);
  const entrada = etapas.find(e => Number(e.is_entrada) === 1)?.nome ?? etapas[0]?.nome ?? '';

  const podeEditar = pode('tarefas:editar');
  const podeExcluir = pode('tarefas:excluir');

  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetch(`/api/admin-data${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-admin-session': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) { onSessionExpired(); return null; }
    return res.json().catch(() => null);
  }, [token, onSessionExpired]);

  const carregar = useCallback(async () => {
    try {
      // A mesma carga da tela de Projetos: as tarefas vêm junto dos projetos, e
      // é dali que saem os nomes de projeto e de entrega mostrados aqui.
      const [p, u, e, tags] = await Promise.all([
        api('?action=projetos'),
        api('?action=usuarios_notificaveis'),
        api('?action=tarefa_status_configs'),
        api('?action=tarefa_etiquetas'),
      ]);
      setProjetos(p?.projetos ?? []);
      setPessoas(u?.usuarios ?? []);
      if (e?.statuses?.length) setEtapas(e.statuses);
      setEtiquetas(tags?.etiquetas ?? []);
      setEtiquetaPorPapel(!!tags?.porPapel);
    } catch {
      toast('error', 'Não foi possível carregar', 'A lista de tarefas não veio. Tente de novo.');
    } finally {
      setCarregando(false);
    }
  }, [api, toast]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Toda tarefa de todo projeto visível, já com o projeto ao lado: a tela é
   *  transversal, e sem isso cada card teria que procurar o dono. */
  const tarefas = useMemo<TarefaComProjeto[]>(
    () => projetos.flatMap(p => (p.tarefas ?? []).map(t => ({ ...t, projeto: p }))),
    [projetos],
  );

  const filtradas = useMemo(() => {
    const q = semAcento(busca.trim());
    const lista = tarefas.filter(t =>
      (fProjeto.length === 0 || fProjeto.includes(t.projeto.nome)) &&
      (fStatus.length === 0 || fStatus.includes(t.status)) &&
      (fResponsavel.length === 0 || fResponsavel.includes(t.responsavel_nome ?? '')) &&
      (fEtiqueta.length === 0 || t.etiquetas.some(e => fEtiqueta.includes(e))) &&
      (!q || semAcento(t.titulo).includes(q) || semAcento(t.descricao ?? '').includes(q))
    );
    const chave: Record<string, (t: TarefaComProjeto) => string | number> = {
      // Sem prazo vai para o fim: o que tem data é o que cobra decisão hoje.
      prazo: t => t.prazo ?? '9999-12-31',
      prioridade: t => PRIORIDADES.indexOf((t.prioridade ?? PRIORIDADE_PADRAO) as typeof PRIORIDADES[number]),
      projeto: t => semAcento(t.projeto.nome),
      titulo: t => semAcento(t.titulo),
    };
    const de = chave[ordem] ?? chave.prazo;
    return [...lista].sort((a, b) => {
      const va = de(a), vb = de(b);
      return va < vb ? -1 : va > vb ? 1 : a.id - b.id;
    });
  }, [tarefas, fProjeto, fStatus, fResponsavel, fEtiqueta, busca, ordem]);

  const grupos = useMemo(
    () => montarGrupos(filtradas, agrupamento, etapas),
    [filtradas, agrupamento, etapas],
  );

  // Os cartões contam o que está na tela: mexer num filtro e ver o número
  // parado faria duvidar de qual dos dois está certo.
  const resumo = useMemo(() => {
    const fecha = (t: TarefaComProjeto) => et.fecha(t.status);
    const foraDaConta = (t: TarefaComProjeto) => et.desconsidera(t.status);
    const abertas = filtradas.filter(t => !fecha(t) && !foraDaConta(t));
    return {
      total: filtradas.length,
      abertas: abertas.length,
      feitas: filtradas.filter(fecha).length,
      atrasadas: abertas.filter(t => {
        const d = diasPara(t.prazo);
        return d !== null && d < 0;
      }).length,
      travadas: abertas.filter(t => t.etiquetas.some(e => etq.trava(e))).length,
    };
  }, [filtradas, et, etq]);

  const nomesConclusivos = etapas.filter(e => Number(e.is_conclusao) === 1).map(e => e.nome);
  const filtrandoFeitas = nomesConclusivos.length > 0
    && nomesConclusivos.every(n => fStatus.includes(n));
  const nomesBloqueio = etiquetas.filter(e => e.bloqueia).map(e => e.nome);
  const filtrandoTravadas = nomesBloqueio.length > 0
    && nomesBloqueio.every(e => fEtiqueta.includes(e));

  const opcoes = useMemo(() => {
    const uniq = (vs: (string | null)[]) =>
      [...new Set(vs.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return {
      projeto: uniq(tarefas.map(t => t.projeto.nome)).map(v => ({ value: v, label: v })),
      status: uniq(tarefas.map(t => t.status)).map(v => ({ value: v, label: v })),
      responsavel: uniq(tarefas.map(t => t.responsavel_nome)).map(v => ({ value: v, label: v })),
      etiqueta: uniq(tarefas.flatMap(t => t.etiquetas)).map(v => ({ value: v, label: v })),
    };
  }, [tarefas]);

  const temFiltro = fProjeto.length + fStatus.length + fResponsavel.length + fEtiqueta.length > 0
    || !!busca.trim();

  function limparFiltros() {
    setFProjeto([]); setFStatus([]); setFResponsavel([]); setFEtiqueta([]);
    setBusca(''); setBuscando(false);
  }

  async function salvar(r: Rascunho) {
    if (!r.projeto_id) { toast('error', 'Falta o projeto', 'Escolha a que projeto a tarefa pertence.'); return; }
    if (!r.titulo.trim()) { toast('error', 'Falta o título', 'A tarefa precisa de um título.'); return; }
    setSalvando(true);
    try {
      const resposta = await api('', 'POST', {
        action: 'salvar_tarefa', ...r,
        entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
      });
      if (resposta?.error) { toast('error', 'Não foi possível salvar', resposta.error); return; }
      setForm(null);
      await carregar();
      toast('success', r.id ? 'Tarefa salva' : 'Tarefa criada');
    } finally {
      setSalvando(false);
    }
  }

  /** Move a tarefa de coluna. O campo depende do agrupamento: no quadro por
   *  status arrastar troca o status, no quadro por prioridade troca a
   *  prioridade. A pintura é otimista - arrastar tem que responder na hora - e a
   *  recarga em seguida traz a entrega já reavaliada. */
  async function mover(t: TarefaComProjeto, campo: 'status' | 'prioridade', valor: string) {
    setProjetos(ps => ps.map(p => ({
      ...p,
      tarefas: (p.tarefas ?? []).map(x => (x.id === t.id ? { ...x, [campo]: valor } : x)),
    })));
    const r = await api('', 'POST', {
      action: 'salvar_tarefa', id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id,
      titulo: t.titulo, descricao: t.descricao, status: t.status, prioridade: t.prioridade,
      responsavel_id: t.responsavel_id, prazo: t.prazo, etiquetas: t.etiquetas,
      [campo]: valor,
    });
    if (r?.error) toast('error', 'Não foi possível mover', r.error);
    await carregar();
  }

  async function excluir(t: Tarefa) {
    setExcluindo(null);
    const r = await api('', 'POST', { action: 'excluir_tarefa', id: t.id });
    if (r?.error) { toast('error', 'Não foi possível excluir', r.error); return; }
    await carregar();
    toast('success', 'Tarefa excluída');
  }

  const abrirEdicao = (t: Tarefa) => setForm({
    id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id ? String(t.entrega_id) : '',
    titulo: t.titulo, descricao: t.descricao ?? '', status: t.status,
    prioridade: t.prioridade ?? PRIORIDADE_PADRAO, responsavel_id: t.responsavel_id ?? '',
    prazo: t.prazo ?? '', etiquetas: t.etiquetas,
  });

  if (!pode('tarefas:ver')) {
    return (
      <div className="admin-content-wrap">
        <div className="perfil-vazio">
          <IconAlert size={16} />
          <p className="perfil-vazio-titulo">Sem acesso</p>
          <p className="perfil-vazio-desc">Seu perfil não enxerga as tarefas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Tarefas</h1>
          <p className="admin-page-desc">O trabalho dos projetos, e o que move as entregas</p>
        </div>
        {podeEditar && projetos.length > 0 && (
          <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
            onClick={() => setForm({ ...VAZIO, status: entrada, projeto_id: projetos[0].id })}>
            + Nova tarefa
          </button>
        )}
      </div>

      {carregando ? (
        <CartoesKpiEsqueleto cartoes={5} />
      ) : tarefas.length > 0 && (
        <div className="admin-stats" style={{ marginBottom: 18 }}>
          <CartaoKpi rotulo="Tarefas" valor={resumo.total}
            nota={temFiltro ? 'no filtro atual' : 'nos projetos que você vê'}
            cor="var(--yellow)" atraso={0} />
          <CartaoKpi rotulo="Abertas" valor={resumo.abertas} nota="ainda na mesa"
            cor="#B58300" atraso={0.05} />
          <CartaoKpi rotulo="Concluídas" valor={resumo.feitas} nota="na etapa de conversão"
            cor="#23A455" atraso={0.1}
            ativo={filtrandoFeitas}
            onClick={() => setFStatus(f => filtrandoFeitas
              ? f.filter(x => !nomesConclusivos.includes(x))
              : [...new Set([...f, ...nomesConclusivos])])} />
          <CartaoKpi rotulo="Atrasadas" valor={resumo.atrasadas} nota="prazo vencido e abertas"
            cor="#D93025" atraso={0.15} />
          <CartaoKpi rotulo="Bloqueadas" valor={resumo.travadas} nota="com etiqueta de bloqueio"
            cor="#C2410C" atraso={0.2}
            ativo={filtrandoTravadas}
            onClick={() => setFEtiqueta(f => filtrandoTravadas
              ? f.filter(x => !nomesBloqueio.includes(x))
              : [...new Set([...f, ...nomesBloqueio])])} />
        </div>
      )}

      {!carregando && tarefas.length > 0 && (
        <>
          <div className="admin-toolbar">
            <span className="admin-toolbar-label">Filtrar</span>
            <FilterDropdown label="Projeto" values={fProjeto} options={opcoes.projeto} onChange={setFProjeto} />
            <FilterDropdown label="Status" values={fStatus} options={opcoes.status} onChange={setFStatus} />
            <FilterDropdown label="Responsável" values={fResponsavel} options={opcoes.responsavel} onChange={setFResponsavel} />
            <FilterDropdown label="Etiqueta" values={fEtiqueta} options={opcoes.etiqueta} onChange={setFEtiqueta} />
            {temFiltro && (
              <button
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={limparFiltros}>
                Limpar
              </button>
            )}
            <div className="admin-toolbar-spacer" />

            <button type="button" className="admin-toolbar-btn"
              onClick={() => { setBuscando(b => !b); if (buscando) setBusca(''); }}
              title="Buscar tarefa" aria-label="Buscar tarefa" aria-expanded={buscando}>
              <IconSearch size={14} />
            </button>
            <SeletorLista valor={agrupamento} onChange={setAgrupamento} opcoes={AGRUPAMENTOS}
              icone={IconAgrupar} rotulo="Agrupar tarefas" />
            <SeletorLista valor={ordem} onChange={setOrdem} opcoes={ORDENS}
              icone={IconOrdenar} rotulo="Ordenar tarefas" />

            <div className="view-toggle">
              <div className="view-toggle-pill"
                style={{ left: view === 'quadro' ? 3 : view === 'lista' ? 35 : 67 }} />
              <button className={view === 'quadro' ? 'active' : ''} onClick={() => setView('quadro')}
                title="Quadro" aria-label="Ver em quadro">
                <IconVisaoQuadro size={14} />
              </button>
              <button className={view === 'lista' ? 'active' : ''} onClick={() => setView('lista')}
                title="Lista" aria-label="Ver em lista">
                <IconVisaoLista size={14} />
              </button>
              <button className={view === 'tabela' ? 'active' : ''} onClick={() => setView('tabela')}
                title="Tabela" aria-label="Ver em tabela">
                <IconVisaoTabela size={14} />
              </button>
            </div>
          </div>

          {buscando && (
            <input autoFocus className="form-input" value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título ou descrição"
              onKeyDown={e => { if (e.key === 'Escape') { setBusca(''); setBuscando(false); } }}
              style={{ marginTop: 10, height: 36, fontSize: 13 }} />
          )}
        </>
      )}

      {carregando ? (
        // O esqueleto imita a visão aberta: quadro vira cartões, o resto vira
        // linhas. Um giro no meio da tela não diria nada disso.
        view === 'quadro'
          ? <SkeletonCards cards={8} />
          : <SkeletonTabela linhas={7} colunas={[1, 4, 2, 2, 2, 2, 1, 1]} />
      ) : filtradas.length === 0 ? (
        <div className="admin-empty">
          <p style={{ color: 'var(--gray2)', marginBottom: 6 }}><IconInbox size={34} /></p>
          <p>{temFiltro ? 'Nenhuma tarefa para esse filtro' : 'Nenhuma tarefa ainda'}</p>
          {temFiltro && (
            <button
              style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={limparFiltros}>
              Limpar filtros
            </button>
          )}
        </div>
      ) : view === 'quadro' ? (
        <Quadro grupos={grupos} agrupamento={agrupamento} et={et} etq={etq} podeEditar={podeEditar}
          onAbrir={abrirEdicao} onMover={mover} />
      ) : view === 'lista' ? (
        <Lista grupos={grupos} et={et} etq={etq} podeExcluir={podeExcluir}
          onAbrir={abrirEdicao} onExcluir={setExcluindo} />
      ) : (
        <Tabela grupos={grupos} et={et} etq={etq} podeExcluir={podeExcluir}
          onAbrir={abrirEdicao} onExcluir={setExcluindo} />
      )}

      {form && (
        <FormularioTarefa
          rascunho={form}
          projetos={projetos}
          etapas={etapas}
          etiquetas={etiquetas}
          etiquetaPorPapel={etiquetaPorPapel}
          usuarioId={usuario?.id}
          etq={etq}
          pessoas={pessoas}
          salvando={salvando}
          somenteLeitura={!podeEditar}
          onMudar={setForm}
          onFechar={() => setForm(null)}
          onSalvar={() => void salvar(form)}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao tarefa={excluindo}
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => void excluir(excluindo)} />
      )}
    </div>
  );
}

// ── Ordenar e agrupar ───────────────────────────────────────────────────────

/** Botão de ícone com lista curta. Serve aos dois critérios da barra, que têm o
 *  mesmo formato e devem se comportar igual. */
function SeletorLista({ valor, onChange, opcoes, icone: Icone, rotulo }: {
  valor: string;
  onChange: (v: string) => void;
  opcoes: readonly { valor: string; label: string }[];
  icone: (p: { size?: number }) => JSX.Element;
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  function abrir() {
    const r = triggerRef.current!.getBoundingClientRect();
    // Ancorado pela direita: o botão fica no fim da barra, e abrir para a
    // direita jogaria a lista para fora da tela.
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 180) });
    setAberto(a => !a);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="admin-toolbar-btn" onClick={abrir}
        title={rotulo} aria-label={rotulo} aria-expanded={aberto}>
        <Icone size={14} />
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: 180, zIndex: 10000 }}>
          {opcoes.map(o => (
            <div key={o.valor} className={`status-select-option${valor === o.valor ? ' active' : ''}`}
              onClick={() => { onChange(o.valor); setAberto(false); }}>
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Quadro ──────────────────────────────────────────────────────────────────

/** Carência antes de uma etapa recolhida voltar a recolher (ms). */
const RECOLHER_APOS_MS = 2000;
/** Tempo parado sobre a faixa antes de ela abrir - só atravessar o quadro com o
 *  mouse não deve disparar a expansão. */
const INTENCAO_MS = 200;

/** Uma coluna do quadro. Recolhe quando está vazia (padrão de todo board da
 *  casa) ou quando a etapa foi marcada como pontual em Configurações, e volta a
 *  abrir com intenção: mouse parado em cima, ou uma tarefa arrastada até ela. */
function Coluna({ grupo, et, etq, podeEditar, arrastando, isOver, onAbrir, onDragOver, onDragLeave, onDrop, onArrastar, onSoltar }: {
  grupo: Grupo;
  et: Etapario;
  etq: Etiquetario;
  podeEditar: boolean;
  arrastando: number | null;
  isOver: boolean;
  onAbrir: (t: Tarefa) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onArrastar: (id: number) => void;
  onSoltar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const abrirTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fecharTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limparAbrir = () => { if (abrirTimer.current) { clearTimeout(abrirTimer.current); abrirTimer.current = null; } };
  const limparFechar = () => { if (fecharTimer.current) { clearTimeout(fecharTimer.current); fecharTimer.current = null; } };
  useEffect(() => () => { limparAbrir(); limparFechar(); }, []);

  const tarefas = grupo.tarefas;
  const recolhivel = tarefas.length === 0 || !!grupo.recolhida;

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
    isOver ? 'drag-over' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{ ['--col-color' as string]: grupo.cor }}
      onDragOver={e => {
        if (!podeEditar || arrastando === null) return;
        e.preventDefault();
        onDragOver();
        if (recolhivel) segurarAberta();
      }}
      onDragLeave={() => { onDragLeave(); if (recolhivel) agendarFechar(); }}
      onDrop={e => { e.preventDefault(); if (recolhivel) agendarFechar(); onDrop(); }}
      {...(recolhivel ? { onMouseEnter: entrou, onMouseLeave: saiu } : {})}
    >
      {recolhivel && (
        <div className="kanban-rail" aria-hidden="true">
          <span className="kanban-dot" style={{ background: grupo.cor }} />
          {tarefas.length > 0 && <span className="kanban-rail-count">{tarefas.length}</span>}
        </div>
      )}

      <div className="kanban-column-header">
        <div className="kanban-column-title">
          {grupo.icone
            ? <span style={{ display: 'inline-flex', color: grupo.cor }}>{grupo.icone}</span>
            : <span className="kanban-dot" style={{ background: grupo.cor }} />}
          {grupo.rotulo}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--gray2)' }}>
          {tarefas.length}
        </span>
      </div>

      <div className="kanban-column-body">
        {tarefas.map(t => (
          <div key={t.id} className="kanban-card"
            draggable={podeEditar}
            onDragStart={() => onArrastar(t.id)}
            onDragEnd={onSoltar}
            onClick={() => onAbrir(t)}
            style={{ cursor: 'pointer', opacity: arrastando === t.id ? 0.45 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
              <Prioridade valor={t.prioridade} />
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--black)', margin: 0, flex: 1 }}>
                {t.titulo}
              </p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--gray2)', margin: 0 }}>{t.projeto.nome}</p>
            {t.etiquetas.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {t.etiquetas.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={etq.cor(e)} />)}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {t.responsavel_nome && (
                <Avatar nome={t.responsavel_nome} foto={t.responsavel_foto} size={20} />
              )}
              <span style={{ marginLeft: 'auto' }}>
                {/* Etapa desconsiderada não cobra prazo: a tarefa saiu da conta. */}
                <Prazo iso={t.prazo} concluida={et.fecha(t.status) || !!grupo.desconsiderada} />
              </span>
            </div>
          </div>
        ))}
        {tarefas.length === 0 && (
          // Agrupado por cliente ou projeto o cartão não se arrasta, então o
          // convite mudaria de sentido.
          <div className="kanban-empty-slot">
            {podeEditar ? 'Arraste tarefas aqui' : 'Nada aqui'}
          </div>
        )}
      </div>
    </div>
  );
}

function Quadro({ grupos, agrupamento, et, etq, podeEditar, onAbrir, onMover }: {
  grupos: Grupo[];
  agrupamento: string;
  et: Etapario;
  etq: Etiquetario;
  podeEditar: boolean;
  onAbrir: (t: Tarefa) => void;
  onMover: (t: TarefaComProjeto, campo: 'status' | 'prioridade', valor: string) => void;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  // Agrupado por cliente ou por projeto o quadro é só leitura: soltar um cartão
  // noutra coluna significaria trocar o dono da tarefa, que não é gesto de
  // arrastar.
  const campo = CAMPO_ARRASTAVEL[agrupamento] ?? null;
  const arrastavel = podeEditar && campo !== null;

  return (
    <div className="kanban-board">
      {grupos.map(grupo => (
        <Coluna
          key={grupo.chave}
          grupo={grupo}
          et={et}
          etq={etq}
          podeEditar={arrastavel}
          arrastando={arrastando}
          isOver={sobre === grupo.chave}
          onAbrir={onAbrir}
          onDragOver={() => setSobre(grupo.chave)}
          onDragLeave={() => setSobre(x => (x === grupo.chave ? null : x))}
          onDrop={() => {
            setSobre(null);
            const t = grupos.flatMap(g => g.tarefas).find(x => x.id === arrastando);
            setArrastando(null);
            if (t && campo && t[campo] !== grupo.chave) onMover(t, campo, grupo.chave);
          }}
          onArrastar={setArrastando}
          onSoltar={() => { setArrastando(null); setSobre(null); }}
        />
      ))}
    </div>
  );
}

// ── Lista ───────────────────────────────────────────────────────────────────

function Lista({ grupos, et, etq, podeExcluir, onAbrir, onExcluir }: {
  grupos: Grupo[];
  et: Etapario;
  etq: Etiquetario;
  podeExcluir: boolean;
  onAbrir: (t: Tarefa) => void;
  onExcluir: (t: TarefaComProjeto) => void;
}) {
  // Bloco vazio não vira seção aqui: na lista ele seria um título solto, sem o
  // alvo de arraste que justifica a coluna vazia do quadro.
  const cheios = grupos.filter(g => g.tarefas.length > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {cheios.map(grupo => (
        <div key={grupo.chave}>
          <p className="admin-section-title"
            style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {grupo.icone
              ? <span style={{ display: 'inline-flex', color: grupo.cor }}>{grupo.icone}</span>
              : <span className="kanban-dot" style={{ background: grupo.cor }} />}
            {grupo.rotulo}
            <span style={{ fontWeight: 600 }}>({grupo.tarefas.length})</span>
          </p>
          <div className="admin-file-list">
            {grupo.tarefas.map(t => (
              <div key={t.id} className="admin-file-item" style={{ cursor: 'pointer' }}
                onClick={() => onAbrir(t)} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAbrir(t); } }}>
                <span className="kanban-dot" title={t.status}
                  style={{ background: et.cor(t.status), marginRight: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--black)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.titulo}
                  </p>
                  {/* O que a linha diz embaixo depende do que já está no título
                      do bloco: repetir o agrupamento em toda linha é ruído. */}
                  <p style={{ fontSize: 11.5, color: 'var(--gray2)', margin: '2px 0 0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[t.projeto.nome, t.status, t.descricao]
                      .filter((x, i) => x && !(i === 0 && grupo.rotulo === t.projeto.nome)
                        && !(i === 1 && grupo.rotulo === t.status))
                      .join(' - ')}
                  </p>
                </div>
                {t.etiquetas.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={etq.cor(e)} />)}
                <Prioridade valor={t.prioridade} />
                <Prazo iso={t.prazo} concluida={et.fecha(t.status) || !!grupo.desconsiderada} />
                {t.responsavel_nome && <Avatar nome={t.responsavel_nome} foto={t.responsavel_foto} size={22} />}
                {podeExcluir && (
                  <button type="button" className="file-delete-btn" title="Excluir tarefa"
                    aria-label={`Excluir ${t.titulo}`}
                    onClick={e => { e.stopPropagation(); onExcluir(t); }}>
                    <IconTrash size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tabela ──────────────────────────────────────────────────────────────────

function Tabela({ grupos, et, etq, podeExcluir, onAbrir, onExcluir }: {
  grupos: Grupo[];
  et: Etapario;
  etq: Etiquetario;
  podeExcluir: boolean;
  onAbrir: (t: Tarefa) => void;
  onExcluir: (t: TarefaComProjeto) => void;
}) {
  const cheios = grupos.filter(g => g.tarefas.length > 0);

  return (
    <div className="admin-table-wrap">
      <table className="admin-table sem-quebra largura-fixa" style={{ minWidth: 1080 }}>
        <thead>
          <tr>
            <th style={{ width: 40 }} aria-label="Prioridade" />
            <th style={{ width: 320 }}>Tarefa</th>
            <th style={{ width: 180 }}>Projeto</th>
            <th style={{ width: 170 }}>Entrega</th>
            <th style={{ width: 140 }}>Status</th>
            <th style={{ width: 170 }}>Responsável</th>
            <th style={{ width: 110 }}>Prazo</th>
            <th style={{ width: 70 }}>Ações</th>
          </tr>
        </thead>
        {cheios.map(grupo => (
          // Um tbody por grupo: a faixa é o cabeçalho do próprio corpo, então
          // ela não se perde ao rolar nem vira uma linha clicável a mais.
          <tbody key={grupo.chave}>
            <tr className="linha-grupo">
              <td colSpan={8}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  {grupo.icone
                    ? <span style={{ display: 'inline-flex', color: grupo.cor }}>{grupo.icone}</span>
                    : <span className="kanban-dot" style={{ background: grupo.cor }} />}
                  {grupo.rotulo}
                  <span style={{ fontWeight: 600, color: 'var(--gray2)' }}>
                    ({grupo.tarefas.length})
                  </span>
                </span>
              </td>
            </tr>
            {grupo.tarefas.map(t => {
              const entrega = t.projeto.entregas?.find(e => e.id === t.entrega_id);
              return (
                <tr key={t.id} onClick={() => onAbrir(t)} tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAbrir(t); } }}
                  style={{ cursor: 'pointer' }}>
                  <td><Prioridade valor={t.prioridade} /></td>
                  <td>
                    <span style={{ fontWeight: 600, color: 'var(--black)' }}>{t.titulo}</span>
                    {t.etiquetas.length > 0 && (
                      <span style={{ display: 'inline-flex', gap: 4, marginLeft: 6 }}>
                        {t.etiquetas.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={etq.cor(e)} />)}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--gray)' }}>{t.projeto.nome}</td>
                  <td style={{ fontSize: 12, color: 'var(--gray2)' }}>{entrega?.titulo ?? '-'}</td>
                  <td><ChipStatus status={t.status} cor={et.cor(t.status)} /></td>
                  <td style={{ fontSize: 12, color: 'var(--gray)' }}>
                    {t.responsavel_nome ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <Avatar nome={t.responsavel_nome} foto={t.responsavel_foto} size={20} />
                        {t.responsavel_nome}
                      </span>
                    ) : <span style={{ color: 'var(--gray2)' }}>Sem responsável</span>}
                  </td>
                  <td><Prazo iso={t.prazo} concluida={et.fecha(t.status) || !!grupo.desconsiderada} /></td>
                  <td>
                    {podeExcluir && (
                      <button type="button" className="admin-toolbar-btn perigo" title="Excluir tarefa"
                        aria-label={`Excluir ${t.titulo}`}
                        onClick={e => { e.stopPropagation(); onExcluir(t); }}>
                        <IconTrash size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

// ── Etiquetas ───────────────────────────────────────────────────────────────

/** Escolha múltipla, no gatilho compacto da casa. Não fecha ao escolher:
 *  etiqueta quase sempre vem em conjunto. */
function SeletorEtiquetas({ valor, opcoes, etq, onChange, desabilitado }: {
  valor: string[];
  opcoes: EtiquetaTarefa[];
  etq: Etiquetario;
  onChange: (v: string[]) => void;
  desabilitado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  /** Onde a lista cabe em relação ao campo. Abre para cima quando não há espaço
   *  embaixo, e acompanha a largura do campo. */
  const medir = useCallback(() => {
    const r = triggerRef.current!.getBoundingClientRect();
    const altura = alturaDaLista(opcoes.length);
    const paraCima = window.innerHeight - r.bottom - 8 < altura && r.top > altura;
    return {
      top: paraCima ? r.top - altura - 4 : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 300),
    };
  }, [opcoes.length]);

  // Este dropdown não usa o `useDropdownDismiss` do resto do sistema de
  // propósito. Lá, qualquer rolagem fecha - o que é certo para um seletor que
  // fecha ao escolher. Aqui escolher é para acontecer várias vezes, e marcar uma
  // etiqueta mexe na altura do campo, o que faz o corpo do modal rolar sozinho:
  // com aquela regra, a lista fechava no primeiro clique e o campo parecia
  // aceitar uma etiqueta só. Aqui a rolagem recoloca a lista em vez de fechá-la.
  useEffect(() => {
    if (!aberto) return;
    const dentro = (alvo: Node | null) => !!alvo
      && (triggerRef.current?.contains(alvo) || dropRef.current?.contains(alvo));
    const aoClicar = (e: MouseEvent) => { if (!dentro(e.target as Node)) setAberto(false); };
    const recolocar = (e?: Event) => {
      // Rolagem de dentro da própria lista não move o campo.
      if (e && dropRef.current?.contains(e.target as Node)) return;
      setPos(medir());
    };
    document.addEventListener('mousedown', aoClicar);
    window.addEventListener('scroll', recolocar, true);
    window.addEventListener('resize', recolocar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      window.removeEventListener('scroll', recolocar, true);
      window.removeEventListener('resize', recolocar);
    };
  }, [aberto, medir]);

  // Marcar uma etiqueta muda a altura do campo. Com a lista aberta para cima,
  // ela descolaria do campo a cada escolha se não recolocasse aqui.
  useEffect(() => {
    if (aberto) setPos(medir());
  }, [valor.length, aberto, medir]);

  function abrir() {
    setPos(medir());
    setAberto(a => !a);
  }

  return (
    <>
      <button ref={triggerRef} type="button" className="liquidez-trigger" onClick={abrir}
        disabled={desabilitado} aria-expanded={aberto}
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0, minHeight: 42,
          padding: '5px 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          // O mesmo fundo que o `SelectSistema` pinta: sem isto o campo herdava
          // o cinza do gatilho e lia como desabilitado ao lado dos outros.
          background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}>
        {valor.length === 0
          ? <span style={{ color: 'var(--gray2)' }}>Sem etiqueta</span>
          : <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {valor.map(e => <ChipEtiqueta key={e} etiqueta={e} cor={etq.cor(e)} />)}
            </span>}
        <span aria-hidden="true" style={{
          display: 'inline-flex', flexShrink: 0, color: 'var(--gray2)',
          transform: aberto ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--transition)',
        }}>
          <IconChevronDown size={13} />
        </span>
      </button>
      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          role="listbox" aria-multiselectable="true"
          style={{ top: pos.top, left: pos.left, width: pos.width,
            maxHeight: alturaDaLista(opcoes.length), zIndex: 10002 }}>
          {opcoes.map(e => {
            const ativo = valor.includes(e.nome);
            const trava = Number(e.bloqueia) === 1;
            return (
              <div key={e.nome} className={`status-select-option${ativo ? ' active' : ''}`}
                role="option" aria-selected={ativo}
                onClick={() => onChange(ativo ? valor.filter(x => x !== e.nome) : [...valor, e.nome])}>
                {/* O chip fica do tamanho do texto: numa coluna esticada ele
                    virava uma tarja da largura da lista. */}
                <span style={{ flexShrink: 0 }}><ChipEtiqueta etiqueta={e.nome} cor={e.cor} /></span>
                {/* O nome sozinho não separa "análise comercial" de "fora de
                    escopo": a nota é o que decide qual das duas usar. */}
                <span style={{ flex: 1, minWidth: 0, fontSize: 11, fontWeight: 500,
                  color: 'var(--gray2)', overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>
                  {e.descricao ?? ''}{trava ? ' Trava a entrega.' : ''}
                </span>
                <span aria-hidden="true" style={{
                  display: 'inline-flex', flexShrink: 0,
                  color: 'var(--yellow)', visibility: ativo ? 'visible' : 'hidden',
                }}>
                  <IconCheck size={13} />
                </span>
              </div>
            );
          })}
          {opcoes.length === 0 && (
            <p style={{ padding: '10px 12px', fontSize: 12, color: 'var(--gray2)' }}>
              Nenhuma etiqueta configurada. Elas ficam em Configurações, na aba Etapas.
            </p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

// ── Exclusão ────────────────────────────────────────────────────────────────

function ConfirmarExclusao({ tarefa, onCancelar, onConfirmar }: {
  tarefa: Tarefa;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const fundo = useFecharNoFundo(onCancelar);
  return createPortal(
    <div className="admin-modal-overlay"
      style={{ zIndex: 10001, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="delete-confirm-title">Excluir tarefa</p>
        <p className="delete-confirm-desc">
          Tem certeza que deseja excluir "<strong>{tarefa.titulo}</strong>"? Esta ação não pode ser desfeita.
        </p>
        <div className="delete-confirm-actions">
          <button type="button" className="delete-confirm-cancel" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="delete-confirm-ok" onClick={onConfirmar}>Excluir</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Formulário ──────────────────────────────────────────────────────────────

function FormularioTarefa({ rascunho, projetos, etapas, etiquetas, etiquetaPorPapel, usuarioId, etq, pessoas, salvando, somenteLeitura, onMudar, onFechar, onSalvar }: {
  rascunho: Rascunho;
  projetos: Projeto[];
  etapas: EtapaTarefa[];
  etiquetas: EtiquetaTarefa[];
  etiquetaPorPapel: boolean;
  usuarioId: string | undefined;
  etq: Etiquetario;
  pessoas: Pessoa[];
  salvando: boolean;
  somenteLeitura: boolean;
  onMudar: (r: Rascunho) => void;
  onFechar: () => void;
  onSalvar: () => void;
}) {
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => onMudar({ ...rascunho, [k]: v });
  const projeto = projetos.find(p => p.id === rascunho.projeto_id);
  const fundo = useFecharNoFundo(onFechar);
  const trava = rascunho.etiquetas.some(e => etq.trava(e));
  // A lista muda com o projeto escolhido: é lá que a pessoa tem um papel.
  const etiquetasVisiveis = etiquetasParaOPapel(etiquetas, etiquetaPorPapel, projeto, usuarioId);
  const escondidas = etiquetas.length - etiquetasVisiveis.length;

  return createPortal(
    <div className="admin-modal-overlay"
      style={{ zIndex: 10000, alignItems: 'center', justifyContent: 'center' }} {...fundo}>
      <div className="delete-confirm-modal" onClick={e => e.stopPropagation()}
        style={{ width: 1040, maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="delete-confirm-title" style={{ marginBottom: 4 }}>
              {rascunho.id ? 'Tarefa' : 'Nova tarefa'}
            </p>
            <p className="delete-confirm-desc" style={{ marginBottom: 0 }}>
              {projeto ? projeto.nome : 'Escolha o projeto abaixo'}
            </p>
          </div>
          <button type="button" className="admin-modal-close" aria-label="Fechar" onClick={onFechar}>
            <IconX size={16} />
          </button>
        </div>

        {/* A margem negativa devolve espaço para o anel de foco dos campos, que
            seria cortado pelo recorte da área rolável. */}
        {/* A margem negativa devolve espaço para o anel de foco dos campos, que
            seria cortado pelo recorte da área rolável. `overflowX: hidden` é o
            par obrigatório do `auto` vertical: sem ele, um rótulo longo de
            seletor empurra a barra horizontal para dentro do modal. */}
        <div style={{ overflowY: 'auto', overflowX: 'hidden', margin: '16px -4px 0', padding: '0 4px',
          display: 'flex', flexDirection: 'column', gap: 12 }}>

          <div className="form-group">
            <label className="form-label">Título *</label>
            <input className="form-input" value={rascunho.titulo} autoFocus disabled={somenteLeitura}
              onChange={e => set('titulo', e.target.value)} placeholder="Levantar requisitos" />
          </div>

          <div className="form-group">
            <label className="form-label">Descrição</label>
            <textarea className="form-input" rows={3} value={rascunho.descricao} disabled={somenteLeitura}
              onChange={e => set('descricao', e.target.value)}
              placeholder="O que precisa ser feito" style={{ fontSize: 13 }} />
          </div>

          {/* `minmax(0, 1fr)` e não `1fr`: item de grade não encolhe abaixo do
              próprio conteúdo por padrão, e o rótulo comprido de uma entrega
              esticava a coluna para fora do modal. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Projeto *</label>
              <SelectSistema
                valor={rascunho.projeto_id}
                onChange={v => onMudar({ ...rascunho, projeto_id: v, entrega_id: '' })}
                placeholder="Escolher projeto"
                opcoes={projetos.map(p => ({ valor: p.id, label: p.nome }))}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Entrega</label>
              <SelectSistema
                valor={rascunho.entrega_id}
                onChange={v => set('entrega_id', v)}
                opcoes={[
                  { valor: '', label: 'Sem entrega' },
                  ...(projeto?.entregas ?? []).map(e => ({ valor: String(e.id), label: e.titulo })),
                ]}
              />
            </div>
          </div>
          {/* Com o modal largo, os quatro campos curtos cabem numa linha só -
              em duas colunas cada um ficaria com meio modal de largura para
              guardar uma palavra. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10 }}>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Status</label>
              <SelectSistema valor={rascunho.status} onChange={v => set('status', v)}
                opcoes={etapas.map(e => ({ valor: e.nome, label: e.nome }))} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Prioridade</label>
              <SelectSistema valor={rascunho.prioridade} onChange={v => set('prioridade', v)}
                opcoes={PRIORIDADES.map(x => ({ valor: x as string, label: x }))} />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Responsável</label>
              <SelectSistema
                valor={rascunho.responsavel_id}
                onChange={v => set('responsavel_id', v)}
                opcoes={[
                  { valor: '', label: 'Sem responsável', icone: <AvatarVazio /> },
                  ...pessoas.map(p => ({
                    valor: p.id,
                    label: p.nome,
                    icone: <Avatar nome={p.nome} foto={p.foto_url} size={20} />,
                  })),
                ]}
              />
            </div>
            <div className="form-group" style={{ minWidth: 0 }}>
              <label className="form-label">Prazo</label>
              <DatePicker compact allowPast value={rascunho.prazo} onChange={v => set('prazo', v)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Etiquetas</label>
            <SeletorEtiquetas valor={rascunho.etiquetas} opcoes={etiquetasVisiveis} etq={etq}
              desabilitado={somenteLeitura} onChange={v => set('etiquetas', v)} />
            {escondidas > 0 && (
              <p style={{ fontSize: 11, color: 'var(--gray2)', margin: '6px 0 0' }}>
                {escondidas} etiqueta(s) fora da lista: elas pertencem a outros papéis da equipe
                deste projeto.
              </p>
            )}
            {trava && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5,
                color: 'var(--red)', margin: '8px 0 0' }}>
                <IconAlert size={13} />
                Enquanto esta tarefa estiver aberta, a entrega ligada a ela aparece como bloqueada.
              </p>
            )}
          </div>
        </div>

        <div className="delete-confirm-actions" style={{ marginTop: 16, flexShrink: 0 }}>
          <button type="button" className="delete-confirm-cancel" onClick={onFechar} disabled={salvando}>
            {somenteLeitura ? 'Fechar' : 'Cancelar'}
          </button>
          {!somenteLeitura && (
            <button type="button" className="delete-confirm-ok" disabled={salvando}
              style={{ background: 'var(--yellow)', color: 'var(--on-yellow)' }}
              onClick={onSalvar}>
              {salvando ? 'Salvando…' : rascunho.id ? 'Salvar' : 'Criar tarefa'}
            </button>
          )}
        </div>

      </div>
    </div>,
    document.body,
  );
}
