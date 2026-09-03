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
  IconAgrupar, IconAlert, IconCalendario, IconCheck, IconChevronDown, IconClip, IconComentario, IconInbox, IconRecolher,
  IconDownload, IconDuplicar, IconOrdenar, IconPlus, IconSearch, IconTrash, IconUser,
  IconVisaoLista, IconVisaoQuadro,
  IconVisaoTabela, IconX,
} from '../components/icons';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';
import FilterDropdown from '../components/FilterDropdown';
import { SkeletonCards, SkeletonTabela } from '../components/Skeleton';
import { CartaoKpi, CartoesKpiEsqueleto } from '../components/CartaoKpi';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import {
  exportar, type ComentarioExport, type Formato as FormatoExport, type Pacote as PacoteExport,
} from '../lib/exportarTarefas';
// Só tipos: um valor vindo daqui fecharia um ciclo com ProjetosPage, que
// importa o formulário de tarefa.
import type { Projeto, Tarefa } from './ProjetosPage';
import {
  COR_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES, PRIORIDADE_PADRAO,
} from '../lib/prioridades';
// O formulário e o vocabulário de tarefa moram fora desta tela: o relatório de
// Gestão abre o mesmo modal, e duas cópias divergiriam no primeiro campo novo.
import {
  Avatar, AvatarVazio, ChipEtiqueta, ConfirmarExclusao, ETAPAS_PADRAO, FormularioTarefa,
  etiquetasParaOPapel, indexar, indexarEtiquetas, tarefaGravada, TITULO_PADRAO, type EtapaTarefa,
  type Etapario, type EtiquetaTarefa, type Etiquetario, type Pessoa, type Rascunho,
} from './FormularioTarefa';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
export { ETAPAS_PADRAO, etiquetasParaOPapel, type EtapaTarefa, type EtiquetaTarefa } from './FormularioTarefa';


type TarefaComProjeto = Tarefa & { projeto: Projeto };


const VAZIO: Omit<Rascunho, 'status'> = {
  projeto_id: '', entrega_id: '', titulo: '', descricao: '',
  prioridade: PRIORIDADE_PADRAO, responsavel_id: '', prazo: '', etiquetas: [],
};

/** Os quatro formatos, na ordem em que se usa: planilha, planilha de verdade,
 *  documento e contexto para IA. */
const FORMATOS = [
  { valor: 'csv', label: 'CSV (planilha)' },
  { valor: 'xlsx', label: 'Excel (.xlsx)' },
  { valor: 'pdf', label: 'PDF (impressão)' },
  { valor: 'md', label: 'Markdown (contexto para IA)' },
] as const;

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
  etapaId?: number;
  /** O que a etapa quer dizer, escrito em Configurações. Vira a dica do
   *  cabeçalho da coluna: ler o critério onde ele é aplicado poupa a viagem
   *  até a tela de configuração. */
  descricao?: string | null;
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
    etapaId: e.id,
    descricao: e.descricao ?? null,
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


/** O que a tarefa carrega além do título: conversa e arquivos.
 *
 *  Só aparece havendo algo - zero comentário não é uma informação, é a
 *  ausência dela, e um "0" em cada cartão de uma coluna cheia vira sujeira. */
function SinaisDaTarefa({ t }: { t: Tarefa }) {
  const conversa = t.comentarios ?? 0;
  const arquivos = t.anexos ?? 0;
  if (conversa === 0 && arquivos === 0) return null;
  return (
    <span className="tarefa-sinais">
      {conversa > 0 && (
        <span title={`${conversa} comentário${conversa > 1 ? 's' : ''}`}>
          <IconComentario size={12} />
          {conversa}
        </span>
      )}
      {arquivos > 0 && (
        <span title={`${arquivos} anexo${arquivos > 1 ? 's' : ''}`}>
          <IconClip size={12} />
          {arquivos}
        </span>
      )}
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

/** De onde a tela abre já estreitada. Vem da contagem de tarefas de uma entrega,
 *  na tela de Projetos: o `nonce` faz a mesma entrega reabrir o filtro quando
 *  se volta a ela depois de tê-lo limpado. */
export interface FiltroInicialTarefas {
  projeto: string;
  entrega: number;
  nonce: number;
}

export default function TarefasPage({ token, filtroInicial, onFiltroAplicado }: {
  token: string;
  filtroInicial?: FiltroInicialTarefas;
  onFiltroAplicado?: () => void;
}) {
  const { pode, usuario, onSessionExpired } = useAuth();
  const { toast } = useToast();

  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [etapas, setEtapas] = useState<EtapaTarefa[]>(ETAPAS_PADRAO);
  const [etiquetas, setEtiquetas] = useState<EtiquetaTarefa[]>([]);
  const [etiquetaPorPapel, setEtiquetaPorPapel] = useState(false);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<TarefaComProjeto | null>(null);
  const [view, setView] = useState<'quadro' | 'lista' | 'tabela'>('quadro');

  const [fProjeto, setFProjeto] = useState<string[]>([]);
  const [fStatus, setFStatus] = useState<string[]>([]);
  const [fResponsavel, setFResponsavel] = useState<string[]>([]);
  const [fEtiqueta, setFEtiqueta] = useState<string[]>([]);
  // Guardado por id: dois projetos podem ter entregas de mesmo nome.
  const [fEntrega, setFEntrega] = useState<string[]>([]);
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

  /** Só a listagem, depois de uma ação. Etapas, etiquetas e usuários não mudam
   *  porque uma tarefa mudou de coluna, e refazer as quatro chamadas era
   *  metade da espera. */
  /** Conta as mudanças pintadas na tela. A resposta que sai daqui é uma foto do
   *  servidor no instante do pedido: se alguém mexeu enquanto ela vinha, ela já
   *  nasceu velha, e aplicá-la desfaria o gesto na cara da pessoa. */
  /** Enquanto a gravação automática está em curso. O painel mostra "Gravando…"
   *  em vez de um botão. */
  const [salvando, setSalvando] = useState(false);

  const mudancasRef = useRef(0);

  const recarregar = useCallback(async () => {
    const marca = mudancasRef.current;
    const p = await api('?action=projetos');
    if (marca !== mudancasRef.current) return;
    if (p?.projetos) setProjetos(p.projetos);
  }, [api]);

  // A aba fica aberta o dia inteiro, e o quadro muda pelas mãos do time. Sem
  // isto ele mostra o estado do momento em que foi aberto e só se atualiza
  // depois de uma ação sua. Volta a olhar a aba e ele se reconcilia.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') void recarregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', aoVoltar);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', aoVoltar);
    };
  }, [recarregar]);

  /** Junta rajadas: mover três cards em sequência reconcilia uma vez. */
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
  /** Põe na tela a tarefa que acabou de nascer, com o id que veio do servidor. */
  const inserirTarefa = useCallback((nova: Tarefa) => {
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => (p.id !== nova.projeto_id
      ? p : { ...p, tarefas: [...(p.tarefas ?? []), nova] })));
  }, []);

  const pintarTarefa = useCallback((id: number, mudancas: Partial<Tarefa>) => {
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p,
      tarefas: (p.tarefas ?? []).map(t => (t.id === id ? { ...t, ...mudancas } : t)),
    })));
  }, []);

  // Chegou de uma entrega: entra com o projeto e a entrega já escolhidos, e a
  // tabela aberta, que é onde os detalhes cabem lado a lado.
  useEffect(() => {
    if (!filtroInicial) return;
    setFProjeto([]);
    setFStatus([]);
    setFResponsavel([]);
    setFEtiqueta([]);
    setFEntrega([String(filtroInicial.entrega)]);
    setView('tabela');
    onFiltroAplicado?.();
  }, [filtroInicial?.nonce]);

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
      (fEntrega.length === 0 || fEntrega.includes(String(t.entrega_id))) &&
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
  }, [tarefas, fProjeto, fStatus, fResponsavel, fEtiqueta, fEntrega, busca, ordem]);

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
      // A opção guarda o id e mostra o título: nomes se repetem entre projetos.
      entrega: [...new Map(tarefas
        .filter(t => t.entrega_id != null)
        .map(t => [String(t.entrega_id), t.projeto.entregas?.find(e => e.id === t.entrega_id)?.titulo ?? '']))
        .entries()]
        .filter(([, label]) => label)
        .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
        .map(([value, label]) => ({ value, label })),
    };
  }, [tarefas]);

  const temFiltro = fProjeto.length + fStatus.length + fResponsavel.length
    + fEtiqueta.length + fEntrega.length > 0 || !!busca.trim();

  function limparFiltros() {
    setFProjeto([]); setFStatus([]); setFResponsavel([]); setFEtiqueta([]); setFEntrega([]);
    setBusca('');
  }

  async function salvar(r: Rascunho) {
    if (!r.projeto_id) { toast('error', 'Falta o projeto', 'Escolha a que projeto a tarefa pertence.'); return; }
    if (!r.titulo.trim()) { toast('error', 'Falta o título', 'A tarefa precisa de um título.'); return; }
    // O painel não fecha ao gravar: quem está escrevendo continua escrevendo, e
    // a gravação acontece por baixo. O que aparece na lista é pintado na hora;
    // se o servidor recusar, ela volta ao que era.
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
    // Rascunho sem id com uma criação em curso: espera o id e grava por cima,
    // em vez de criar uma segunda tarefa com o mesmo conteúdo.
    const jaCriada = !r.id && criando.current ? await criando.current : null;
    const alvo = r.id ?? jaCriada ?? undefined;
    const resposta = await api('', 'POST', {
      action: 'salvar_tarefa', ...r, id: alvo,
      entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
    }).finally(() => setSalvando(false));
    if (resposta?.error) {
      setProjetos(antes);
      toast('error', 'Não foi possível salvar', resposta.error);
      return;
    }
    // A regra de uma etiqueta pode ter mudado a etapa e o responsável na
    // gravação. O servidor devolve os dois, e a tela repinta com o que de fato
    // ficou - senão o card mostraria o que foi pedido, e não o que valeu.
    // `alvo`, e não `r.id`: a tarefa criada há instantes já tem id, mas o
    // rascunho que disparou esta gravação ainda não o carregava.
    if (alvo) {
      const dono = pessoas.find(x => x.id === resposta?.responsavel_id);
      pintarTarefa(alvo, {
        titulo: r.titulo,
        status: String(resposta?.status ?? r.status),
        responsavel_id: resposta?.responsavel_id ?? null,
        responsavel_nome: dono?.nome ?? null,
        responsavel_foto: dono?.foto_url ?? null,
      });
    }
    // Tarefa nova: o id nasce no servidor, então ela entra na coluna agora -
    // montada do que a pessoa escreveu, sem recarregar a listagem inteira.
    if (!alvo && resposta?.id) {
      inserirTarefa(tarefaGravada(r, resposta, pessoas));
      // O painel continua aberto e passa a editar a tarefa que acabou de
      // nascer: sem o id, a gravação seguinte criaria outra.
      setForm(f => (f && !f.id ? { ...f, id: Number(resposta.id) } : f));
      toast('success', 'Tarefa criada');
    }
    // A explicação da etiqueta já virou comentário: mantê-la no rascunho a
    // reenviaria na gravação seguinte.
    if (r.comentario_etiqueta) setForm(f => (f ? { ...f, comentario_etiqueta: '' } : f));
    reconciliar();
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
    if (r?.error) {
      // Desfaz só o campo movido: `t` carrega o projeto junto e devolvê-lo
      // inteiro sujaria a tarefa com um campo que não é dela.
      pintarTarefa(t.id, { [campo]: t[campo] });
      toast('error', 'Não foi possível mover', r.error);
      return;
    }
    reconciliar();
  }

  async function excluir(t: Tarefa) {
    setExcluindo(null);
    // Fecha o painel se a tarefa apagada for a que está aberta: deixá-lo no ar
    // mostrando uma tarefa que não existe mais convida a salvar de volta.
    setForm(f => (f?.id === t.id ? null : f));
    const antes = projetos;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p, tarefas: (p.tarefas ?? []).filter(x => x.id !== t.id),
    })));
    const r = await api('', 'POST', { action: 'excluir_tarefa', id: t.id });
    if (r?.error) { setProjetos(antes); toast('error', 'Não foi possível excluir', r.error); return; }
    toast('success', 'Tarefa excluída');
    reconciliar();
  }

  /** Marca ou desmarca a etapa como recolhida por padrão, direto do quadro.
   *  Pinta na hora e grava: é ajuste de um clique, e esperar a resposta para a
   *  coluna reagir faria o botão parecer travado. */
  async function fixarRecolhida(etapaId: number) {
    setEtapas(es => es.map(e => (e.id === etapaId
      ? { ...e, always_collapsed: e.always_collapsed ? 0 : 1 } : e)));
    const r = await api('', 'POST', { action: 'toggle_collapsed_tarefa_status', id: etapaId });
    if (r?.error) {
      setEtapas(es => es.map(e => (e.id === etapaId
        ? { ...e, always_collapsed: e.always_collapsed ? 0 : 1 } : e)));
      toast('error', 'Não foi possível mudar a etapa', r.error);
    }
  }

  /** Monta o pacote de exportação a partir do que está na tela. Sai o recorte
   *  filtrado, e não a base inteira: quem acabou de filtrar não quer o resto.
   *  Projeto entra com o diretório dele - ficha, equipe e entregas -, porque
   *  tarefa fora do contexto do projeto não serve nem para planilha nem para
   *  alimentar uma IA. */
  function montarPacote(conversas: Map<number, ComentarioExport[]>): PacoteExport {
    const porProjeto = new Map<string, TarefaComProjeto[]>();
    for (const t of filtradas) {
      const lista = porProjeto.get(t.projeto.id);
      if (lista) lista.push(t); else porProjeto.set(t.projeto.id, [t]);
    }
    const recorte = [
      fProjeto.length && `projeto: ${fProjeto.join(', ')}`,
      fStatus.length && `etapa: ${fStatus.join(', ')}`,
      fResponsavel.length && `responsável: ${fResponsavel.join(', ')}`,
      fEtiqueta.length && `etiqueta: ${fEtiqueta.join(', ')}`,
      busca.trim() && `busca: "${busca.trim()}"`,
    ].filter(Boolean).join(' · ');

    return {
      gerado_em: new Date(),
      filtro: recorte || null,
      projetos: [...porProjeto.entries()].map(([id, tarefas]) => {
        const p = projetos.find(x => x.id === id)!;
        const gestor = p.equipe.find(m => m.papel === 'Gestor');
        return {
          codigo: p.codigo ?? null,
          nome: p.nome,
          cliente: p.cliente_nome ?? null,
          descricao: p.descricao ?? null,
          status: p.status,
          prioridade: p.prioridade ?? null,
          gestor: gestor?.nome ?? null,
          data_inicio: p.data_inicio ?? null,
          previsao_entrega: p.previsao_entrega ?? null,
          equipe: p.equipe.map(m => ({ nome: m.nome, papel: m.papel })),
          entregas: (p.entregas ?? []).map(e => ({
            titulo: e.titulo, status: e.status, prazo: e.prazo,
            marcador: e.marcador, submarcador: e.submarcador,
          })),
          tarefas: tarefas.map(t => ({
            titulo: t.titulo,
            descricao: t.descricao ?? null,
            status: t.status,
            prioridade: t.prioridade ?? null,
            responsavel_nome: t.responsavel_nome ?? null,
            prazo: t.prazo ?? null,
            etiquetas: t.etiquetas ?? [],
            concluida_em: t.concluida_em ?? null,
            entrega_titulo: (p.entregas ?? []).find(e => e.id === t.entrega_id)?.titulo ?? null,
            comentarios: conversas.get(t.id) ?? [],
          })),
        };
      }),
    };
  }

  /** A conversa de todas as tarefas do recorte, numa chamada só. O card carrega
   *  a dele quando é aberto; aqui seria uma requisição por tarefa. Se a busca
   *  falhar, a exportação continua sem os comentários: perder o arquivo inteiro
   *  por causa deles seria pior do que entregá-lo incompleto. */
  async function buscarConversas(ids: number[]): Promise<Map<number, ComentarioExport[]>> {
    const mapa = new Map<number, ComentarioExport[]>();
    if (ids.length === 0) return mapa;
    try {
      const r = await api(`?action=tarefas_comentarios&ids=${ids.join(',')}`);
      if (!r.ok) return mapa;
      const dados = await r.json();
      for (const c of (dados.comentarios ?? []) as any[]) {
        const id = Number(c.tarefa_id);
        const lista = mapa.get(id) ?? [];
        lista.push({
          autor: String(c.usuario_nome ?? 'Alguém'),
          em: String(c.criado_em ?? ''),
          texto: String(c.texto ?? ''),
          resposta: c.pai_id != null,
        });
        mapa.set(id, lista);
      }
    } catch { /* segue sem a conversa */ }
    return mapa;
  }

  async function exportarComo(formato: FormatoExport) {
    if (filtradas.length === 0) {
      toast('error', 'Nada para exportar', 'O recorte atual não tem nenhuma tarefa.');
      return;
    }
    const conversas = await buscarConversas(filtradas.map(t => t.id));
    exportar(formato, montarPacote(conversas));
    if (formato === 'pdf') {
      toast('info', 'Escolha "Salvar como PDF"', 'O PDF sai pela caixa de impressão do navegador.');
    }
  }

  /** Rascunho de tarefa nova. Nasce com quem está criando como responsável: é
   *  quem vai tocar a tarefa na maioria das vezes, e deixar o campo vazio
   *  produzia uma fila de tarefas sem dono que ninguém revisava depois. Continua
   *  sendo um padrão, não uma regra - o campo está aberto para trocar ou para
   *  deixar sem responsável antes de salvar. */
  const tarefaNova = (): Rascunho => ({
    ...VAZIO,
    status: entrada,
    projeto_id: projetos[0]?.id ?? '',
    responsavel_id: usuario?.id ?? '',
  });

  /** O estado em que a tarefa foi criada. Serve para saber, ao fechar, se
   *  alguém chegou a mexer nela. */
  const nasceuAssim = useRef<string | null>(null);

  /** A criação em curso, enquanto o id não voltou. Quem precisar do id espera
   *  por ela em vez de criar uma segunda tarefa. */
  const criando = useRef<Promise<number | null> | null>(null);

  /** "Nova tarefa" cria de verdade, e não abre um formulário em branco: daqui em
   *  diante tudo o que se digita grava sozinho, e um rascunho que só existe na
   *  tela seria a única coisa do sistema que ainda dependeria de alguém apertar
   *  um botão.
   *
   *  O painel abre no clique, e a criação corre por baixo: esperar a ida e a
   *  volta para abrir punha meio segundo de nada entre o clique e o cursor no
   *  campo do título. */
  function novaTarefa(status?: string) {
    // Vindo do "+" de uma coluna, a tarefa nasce naquela etapa: quem pede uma
    // tarefa dali já disse em que ponto do fluxo ela entra, e abrir na etapa de
    // entrada obrigaria a corrigir logo em seguida.
    const base = { ...tarefaNova(), titulo: TITULO_PADRAO, status: status || entrada };
    nasceuAssim.current = JSON.stringify(base);
    setForm(base);
    criando.current = api('', 'POST', { action: 'salvar_tarefa', ...base, entrega_id: null })
      .then(r => {
        if (r?.error) { toast('error', 'Não foi possível criar', r.error); return null; }
        const id = Number(r.id);
        inserirTarefa(tarefaGravada({ ...base, id }, r, pessoas));
        // O id chega depois da abertura: sem ele no rascunho, a gravação
        // seguinte criaria outra tarefa.
        setForm(f => (f && !f.id ? { ...f, id } : f));
        reconciliar();
        return id;
      });
  }

  /** Fechar o painel. A tarefa que ninguém tocou não fica: abrir e desistir não
   *  deveria deixar "Sem título" no quadro de todo mundo. Qualquer alteração,
   *  por menor que seja, já a torna trabalho de alguém - e aí ela permanece. */
  async function fecharTarefa() {
    const atual = form;
    setForm(null);
    if (!atual || nasceuAssim.current === null) return;
    const intacta = JSON.stringify({ ...atual, id: undefined }) === nasceuAssim.current;
    nasceuAssim.current = null;
    if (!intacta) return;
    // Fechou antes de o id chegar: espera, senão a tarefa nasceria logo depois
    // e ficaria no quadro justamente por ter sido abandonada.
    const id = atual.id ?? (criando.current ? await criando.current : null);
    if (!id) return;
    mudancasRef.current++;
    setProjetos(ps => ps.map(p => ({
      ...p, tarefas: (p.tarefas ?? []).filter(x => x.id !== id),
    })));
    await api('', 'POST', { action: 'excluir_tarefa', id });
  }

  /** Cria uma cópia da tarefa, igual em tudo: mesma etapa, mesmo responsável,
   *  mesmo prazo, mesmas etiquetas - e a mesma data de conclusão, quando há uma,
   *  para a cópia nascer na mesma coluna e no mesmo dia da original. Só o título
   *  ganha " (cópia)", senão ficam duas linhas idênticas no quadro. */
  async function duplicar(t: Tarefa) {
    const r = await api('', 'POST', {
      action: 'salvar_tarefa',
      projeto_id: t.projeto_id, entrega_id: t.entrega_id,
      titulo: `${t.titulo} (cópia)`, descricao: t.descricao,
      status: t.status, prioridade: t.prioridade,
      responsavel_id: t.responsavel_id, prazo: t.prazo, etiquetas: t.etiquetas,
      concluida_em: t.concluida_em,
    });
    if (r?.error) { toast('error', 'Não foi possível duplicar', r.error); return; }
    // A cópia entra na coluna com o id que acabou de voltar, e não depois de
    // uma listagem inteira.
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
    <div className="admin-content-wrap pagina-tarefas">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Tarefas</h1>
          <p className="admin-page-desc">O trabalho dos projetos, e o que move as entregas</p>
        </div>
        {/* Só "Nova tarefa" fica no cabeçalho. Buscar, agrupar, ordenar e
            exportar desceram para a linha da busca: são o mesmo momento - achar
            o que se procura e escolher como olhar. */}
        <div className="admin-page-acoes">
          {podeEditar && projetos.length > 0 && (
            <button className="btn btn-primary" style={{ height: 38, padding: '0 18px', fontSize: 13, flexShrink: 0 }}
              onClick={() => void novaTarefa()}>
              + Nova tarefa
            </button>
          )}
        </div>
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
            <FilterDropdown label="Entrega" values={fEntrega} options={opcoes.entrega} onChange={setFEntrega} />
            <FilterDropdown label="Etiqueta" values={fEtiqueta} options={opcoes.etiqueta} onChange={setFEtiqueta} />
            {temFiltro && (
              <button
                style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray2)', background: 'none', border: 'none', cursor: 'pointer' }}
                onClick={limparFiltros}>
                Limpar
              </button>
            )}
            <div className="admin-toolbar-spacer" />

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

          {/* A busca fica à vista, e não atrás de um botão: com dezenas de
              tarefas, procurar uma é o primeiro gesto de quem abre a tela. É a
              mesma faixa do painel de projeto e da página do cliente - campo de
              um lado, controles da tela do outro. */}
          <div className="secao-busca">
            <span className="secao-busca-campo">
              <IconSearch size={13} />
              <input value={busca} aria-label="Buscar tarefa"
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por título ou descrição"
                onKeyDown={e => { if (e.key === 'Escape') setBusca(''); }} />
              {busca && (
                <button type="button" aria-label="Limpar a busca" onClick={() => setBusca('')}>
                  <IconX size={12} />
                </button>
              )}
            </span>
            <SeletorLista valor={agrupamento} onChange={setAgrupamento} opcoes={AGRUPAMENTOS}
              icone={IconAgrupar} rotulo="Agrupar tarefas" />
            <SeletorLista valor={ordem} onChange={setOrdem} opcoes={ORDENS}
              icone={IconOrdenar} rotulo="Ordenar tarefas" />
            {/* Exporta o que está filtrado. O `.md` existe para virar contexto
                de uma IA; os outros três, para planilha e para mandar adiante. */}
            <SeletorLista valor="" onChange={v => void exportarComo(v as FormatoExport)}
              opcoes={FORMATOS} icone={IconDownload} rotulo="Exportar" />
          </div>
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
          onAbrir={abrirEdicao} onMover={mover}
          onCriarNaEtapa={podeEditar ? novaTarefa : undefined}
          onFixarRecolhida={pode('configuracoes:etapas') ? fixarRecolhida : undefined}
          onExcluir={podeExcluir ? setExcluindo : undefined}
          onDuplicar={podeEditar ? (x => void duplicar(x)) : undefined} />
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
          podeComentar={pode('tarefas:comentar')}
          api={api}
          onMudar={setForm}
          onFechar={() => void fecharTarefa()}
          onSalvar={() => void salvar(form)}
          onExcluir={podeExcluir && form.id ? () => {
            const alvo = tarefas.find(x => x.id === form.id);
            if (alvo) setExcluindo(alvo);
          } : undefined}
          onDuplicar={podeEditar && form.id ? () => {
            const alvo = tarefas.find(x => x.id === form.id);
            if (alvo) void duplicar(alvo);
          } : undefined}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao titulo={excluindo.titulo}
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
function Coluna({ grupo, et, etq, podeEditar, arrastando, isOver, onAbrir, onDragOver, onDragLeave,
  onDrop, onArrastar, onSoltar, onCriarNaEtapa, onFixarRecolhida, onExcluir, onDuplicar }: {
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
  /** Cria uma tarefa já nesta etapa. Só no agrupamento por status: nas outras
   *  dimensões a coluna não é uma etapa, e "criar aqui" não teria significado. */
  onCriarNaEtapa?: (status: string) => void;
  /** Ausente para quem não configura etapas, e fora do agrupamento por status. */
  onFixarRecolhida?: (etapaId: number) => void;
  /** Ausentes para quem não pode excluir / criar tarefa. */
  onExcluir?: (t: TarefaComProjeto) => void;
  onDuplicar?: (t: TarefaComProjeto) => void;
}) {
  const [aberta, setAberta] = useState(false);
  /** O corpo esmaece no pé enquanto há card abaixo. A barra de rolagem da
   *  coluna é escondida, então sem este sinal o card cortado no fim lê como
   *  defeito da tela em vez de "role para ver o resto". */
  const corpo = useRef<HTMLDivElement>(null);
  const [noFim, setNoFim] = useState(true);
  const conferirFim = useCallback(() => {
    const el = corpo.current;
    if (!el) return;
    setNoFim(el.scrollTop + el.clientHeight >= el.scrollHeight - 2);
  }, []);
  // Confere ao montar e a cada mudança na lista: card que entra ou sai muda o
  // que há para rolar.
  useEffect(conferirFim, [conferirFim, grupo.tarefas.length, aberta]);
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
        <div className="kanban-column-title" title={grupo.descricao ?? undefined}>
          {grupo.icone
            ? <span style={{ display: 'inline-flex', color: grupo.cor }}>{grupo.icone}</span>
            : <span className="kanban-dot" style={{ background: grupo.cor }} />}
          {grupo.rotulo}
        </div>
        {/* O subtotal colado no titulo: e a contagem daquela etapa, e no canto
            direito ele lia como um numero solto da coluna. */}
        <span className="kanban-conta-bolha">{tarefas.length}</span>
        {/* Manter a etapa recolhida é decisão sobre o quadro, e agora se toma
            olhando para ele. Só aparece no agrupamento por status: nas outras
            dimensões a coluna não é uma etapa configurável. */}
        {onFixarRecolhida && grupo.etapaId != null && (
          <button
            type="button"
            className="kanban-column-fixar"
            aria-pressed={!!grupo.recolhida}
            title={grupo.recolhida
              ? 'Etapa recolhida por padrão. Clique para mantê-la aberta.'
              : 'Manter esta etapa recolhida, mesmo com tarefas dentro'}
            aria-label={grupo.recolhida ? 'Manter a etapa aberta' : 'Manter a etapa recolhida'}
            onClick={e => { e.stopPropagation(); onFixarRecolhida(grupo.etapaId!); }}
          >
            <IconRecolher size={12} aberta={!grupo.recolhida} />
          </button>
        )}
        {/* Criar já na coluna. O quadro é onde se decide em que ponto do fluxo a
            tarefa entra, e ter de abrir o painel para corrigir a etapa logo
            depois de criar era um passo a mais em todo cadastro. */}
        {onCriarNaEtapa && grupo.etapaId != null && (
          <button
            type="button"
            className="kanban-column-fixar"
            title={`Nova tarefa em "${grupo.rotulo}"`}
            aria-label={`Nova tarefa em ${grupo.rotulo}`}
            onClick={e => { e.stopPropagation(); onCriarNaEtapa(grupo.chave); }}
          >
            <IconPlus size={12} />
          </button>
        )}
      </div>

      <div ref={corpo} onScroll={conferirFim}
        className={`kanban-column-body${noFim ? ' no-fim' : ''}`}>
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
              {/* Aparece com o ponteiro no card. Sempre visível seria um lixo
                  por cartão numa coluna cheia, e o clique que interessa no card
                  é o de abrir. */}
              <span className="kanban-card-acoes">
                {onDuplicar && (
                  <button
                    type="button"
                    className="kanban-card-acao"
                    title="Duplicar tarefa"
                    aria-label={`Duplicar "${t.titulo}"`}
                    onClick={e => { e.stopPropagation(); onDuplicar(t); }}
                  >
                    <IconDuplicar size={12} />
                  </button>
                )}
                {onExcluir && (
                  <button
                    type="button"
                    className="kanban-card-acao perigo"
                    title="Excluir tarefa"
                    aria-label={`Excluir "${t.titulo}"`}
                    onClick={e => { e.stopPropagation(); onExcluir(t); }}
                  >
                    <IconTrash size={12} />
                  </button>
                )}
              </span>
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
              <SinaisDaTarefa t={t} />
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

function Quadro({ grupos, agrupamento, et, etq, podeEditar, onAbrir, onMover, onCriarNaEtapa,
  onFixarRecolhida, onExcluir, onDuplicar }: {
  grupos: Grupo[];
  agrupamento: string;
  et: Etapario;
  etq: Etiquetario;
  podeEditar: boolean;
  onAbrir: (t: Tarefa) => void;
  onMover: (t: TarefaComProjeto, campo: 'status' | 'prioridade', valor: string) => void;
  /** Cria uma tarefa já na etapa da coluna. Ausente para quem não edita. */
  onCriarNaEtapa?: (status: string) => void;
  onFixarRecolhida?: (etapaId: number) => void;
  onExcluir?: (t: TarefaComProjeto) => void;
  onDuplicar?: (t: TarefaComProjeto) => void;
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
          onCriarNaEtapa={onCriarNaEtapa}
          onFixarRecolhida={onFixarRecolhida}
          onExcluir={onExcluir}
          onDuplicar={onDuplicar}
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
          {/* A `key` é a assinatura do bloco: quando a busca ou o filtro muda
              o resultado, os itens remontam e a entrada toca. */}
          <div className="admin-file-list lista-anima"
            key={grupo.tarefas.map(t => t.id).join(',')}>
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
                <SinaisDaTarefa t={t} />
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

