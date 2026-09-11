// ─────────────────────────────────────────────────────────────────────────────
//  A fila de relatos, aberta pelo cartão do menu.
//
//  Ela existe pelo mesmo motivo da tabela: e-mail não é registro. Quem reportou
//  não tinha como saber se aquilo tinha chegado, e quem cuida do portal não
//  tinha lista nenhuma - só uma caixa de entrada onde o relato de ontem já
//  desceu para baixo de outra coisa.
//
//  A ordem é por urgência, e é fixa: a fila responde "o que atacar primeiro", e
//  ordenada por chegada ela devolveria a caixa de entrada. Quem ordena é o
//  servidor; aqui só se desenha o que veio.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconAlert, IconBug, IconChevronRight, IconDoc, IconEdit, IconImage, IconImagemSem,
  IconSparkles, IconSpinner, IconTrash, IconUndo, IconX,
} from './icons';
import { Dialogo } from './Dialogo';
import { PreviaArquivo } from './PreviaArquivo';
import FilterDropdown from './FilterDropdown';
import { SelectSistema } from './SelectSistema';
import { Avatar } from '../admin/FormularioTarefa';
import { Chave } from './Chave';
import { ICONE_PRIORIDADE, PRIORIDADES } from '../lib/prioridades';
import { instante, tempoRelativo } from '../lib/datas';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useToast } from '../lib/toast';

/**
 * Andamento do relato. Quatro estados e nada de "reaberto": se voltou, volta
 * para Aberto - estado a mais numa fila pequena só cria dúvida sobre qual usar.
 *
 * A cor sai de token, e não de hex: é ela que tinge o ponto e o fundo do chip
 * nos dois temas.
 */
export const STATUS_DO_RELATO = [
  { valor: 'aberto', label: 'Aberto', cor: 'var(--gray2)' },
  { valor: 'em_analise', label: 'Em análise', cor: 'var(--amber)' },
  { valor: 'resolvido', label: 'Resolvido', cor: 'var(--green-light)' },
  // Descartado é vermelho porque é decisão, e não esquecimento: alguém olhou e
  // disse que não vai ser feito. Em cinza ele lia como "some da fila".
  { valor: 'descartado', label: 'Descartado', cor: 'var(--red)' },
];
const ROTULO_STATUS: Record<string, { label: string; cor: string }> =
  Object.fromEntries(STATUS_DO_RELATO.map(s => [s.valor, s]));

/**
 * O que o chamado e. Sao dois, e de proposito: a pergunta que a fila responde e
 * uma so - isto esta quebrado? -, e uma terceira gaveta viraria o deposito de
 * quem nao quis escolher.
 *
 * Vermelho para o defeito e verde para o pedido, porque e a mesma leitura de
 * toda a casa: vermelho e o que esta errado agora, verde e o que se ganha.
 */
export const TIPOS_DO_RELATO = [
  { valor: 'bug', label: 'Bug', cor: 'var(--red)', Icone: IconBug },
  { valor: 'melhoria', label: 'Melhoria', cor: 'var(--green-light)', Icone: IconSparkles },
];
const ROTULO_TIPO: Record<string, { label: string; cor: string; Icone: (p: { size?: number }) => JSX.Element }> =
  Object.fromEntries(TIPOS_DO_RELATO.map(t => [t.valor, t]));

/** Uma nota do chamado: o recado que acompanhou uma mudanca de andamento. */
export interface NotaDoRelato {
  texto: string;
  /** O andamento que a nota acompanhou. */
  status: string | null;
  autor_nome: string;
  criado_em: string;
}

export interface ReporteNaLista {
  id: number;
  texto: string;
  urgencia: string;
  /** 'bug' | 'melhoria'. Nulo no chamado gravado antes de a classificacao
   *  existir: a fila o mostra como sem classificacao ate alguem escolher. */
  tipo: string | null;
  pagina: string | null;
  autor_nome: string;
  autor_email: string | null;
  /** Vem de `usuarios` na hora da leitura: relato antigo mostra a foto de hoje. */
  autor_foto: string | null;
  print_nome: string | null;
  tem_print: boolean;
  /** Os arquivos do chamado. O print antigo entra aqui com `id` nulo - e e por
   *  isso que a tela nao precisa saber que existiram dois formatos. */
  anexos?: { id: number | null; nome: string; tipo: string; tamanho: number }[];
  status: string;
  criado_em: string;
  /** Quando voltou para a fila depois de ter sido resolvido. Nulo e o normal.
   *  Carimbo, e nao um quinto status: reaberto esta `aberto` de novo. */
  reaberto_em?: string | null;
  /** Se este chamado e de quem esta olhando. Vem decidido do servidor, que e
   *  onde a regra tambem recusa - a tela so escolhe o que desenhar. */
  meu?: boolean;
  /** As notas ja escritas, da mais antiga para a mais nova. */
  notas?: NotaDoRelato[];
}

export function ListaReportes({
  carregar, carregarPrint, mudarStatus, mudarTipo, editar, excluir, reabrir,
  admin, expandir, onFechar,
}: {
  carregar: () => Promise<{ reportes?: ReporteNaLista[]; error?: string }>;
  /** O conteúdo do print vem um por vez: na lista ele não viaja. */
  carregarPrint: (id: number, anexo?: number) => Promise<{ nome: string; tipo: string; base64: string } | null>;
  mudarStatus?: (id: number, status: string, avisar: boolean, comentario: string) => Promise<{ error?: string; aviso?: string | null } | null>;
  /** Corrigir a gaveta do chamado. Sem e-mail e sem pergunta: trocar o tipo nao
   *  muda nada para quem reportou, e a fila e do dono do painel. */
  mudarTipo?: (id: number, tipo: string) => Promise<{ error?: string } | null>;
  /** Corrigir e apagar o proprio chamado. Quem pode e o autor, e quem confere e
   *  o servidor: aqui elas so nao sao oferecidas onde `meu` e falso. */
  editar?: (id: number, texto: string, urgencia: string) => Promise<{ error?: string } | null>;
  excluir?: (id: number) => Promise<{ error?: string } | null>;
  /** Trazer de volta o proprio chamado ja resolvido. So o autor, e so a partir
   *  de resolvido - as duas coisas conferidas no servidor. */
  reabrir?: (id: number, comentario: string) => Promise<{ error?: string; aviso?: string | null; reaberto_em?: string } | null>;
  /**
   * O dono do painel: vê a fila inteira e muda o andamento. Quem não é vê só o
   * que escreveu, e sem o campo de status.
   *
   * Aqui isto muda o que a tela oferece; a trava de verdade é o servidor - a
   * ação de status está marcada `SO_ADMIN`, e a consulta da fila já devolve só
   * os relatos de quem pergunta.
   */
  admin?: boolean;
  /** O chamado que deve nascer expandido - o inbox abre a fila mirando um. */
  expandir?: number | null;
  onFechar: () => void;
}) {
  const [lista, setLista] = useState<ReporteNaLista[] | null>(null);
  const [erro, setErro] = useState('');
  /** O chamado aberto no visualizador, e em qual dos anexos dele se está. A
   *  posição, e não o arquivo: é por ela que se folheia. */
  const [vendo, setVendo] = useState<{ reporte: ReporteNaLista; indice: number } | null>(null);
  const [erroStatus, setErroStatus] = useState('');
  /** O andamento escolhido, esperando a resposta sobre o e-mail. A troca só
   *  acontece depois: perguntar depois de aplicar deixaria a pergunta sem efeito
   *  sobre o que já tinha acontecido. */
  const [confirmando, setConfirmando] = useState<{ id: number; status: string } | null>(null);
  /** O recado que acompanha a mudança. Opcional, e some junto com a pergunta. */
  const [comentario, setComentario] = useState('');
  const campoNota = useRef<HTMLTextAreaElement>(null);
  const limparPergunta = () => { setConfirmando(null); setComentario(''); };
  /** Uma linha aberta por vez: a fila é para varrer, e três detalhes abertos
   *  juntos empurram o resto para fora da tela. */
  /** Resolvido sai da fila por padrão: o que se abre a lista para ver é o que
   *  ainda não aconteceu. A chave traz de volta quem quer conferir o histórico,
   *  e vale para todo mundo - não é ajuste de administrador. */
  const [verResolvidos, setVerResolvidos] = useState(false);
  /** Quais tipos ficam a vista. Lista vazia quer dizer todos, que e como o
   *  filtro da casa trabalha: escolher nada e nao filtrar, e nao um estado
   *  "Todos" que precisa ser clicado de volta.
   *
   *  `sem` e o chamado que ninguem classificou ainda. Ele e uma escolha como as
   *  outras porque tambem e uma fila: e a dos que precisam de triagem. */
  const [filtroTipos, setFiltroTipos] = useState<string[]>([]);
  const [aberta, setAberta] = useState<number | null>(null);
  /** O chamado em edicao, com o rascunho dentro. Um por vez: dois formularios
   *  abertos na mesma fila e o comeco de gravar um achando que era o outro. */
  const [editando, setEditando] = useState<{ id: number; texto: string; urgencia: string } | null>(null);
  const [gravando, setGravando] = useState(false);
  /** O chamado que a pergunta de excluir esta mirando. */
  const [apagando, setApagando] = useState<ReporteNaLista | null>(null);
  /** O chamado que esta sendo reaberto, e o motivo que vai junto. */
  const [reabrindo, setReabrindo] = useState<ReporteNaLista | null>(null);
  const [motivo, setMotivo] = useState('');
  const campoMotivo = useRef<HTMLTextAreaElement>(null);
  const limparReabertura = () => { setReabrindo(null); setMotivo(''); };

  /** Quantos estão fora da fila agora - o número que a chave mostra. */
  const resolvidos = (lista ?? []).filter(r => r.status === 'resolvido').length;
  /** O que a tabela desenha. Filtrar aqui, e não esconder por CSS: linha
   *  escondida continua no caminho do teclado e da leitura de tela. */
  const visiveis = (lista ?? []).filter(r =>
    (verResolvidos || r.status !== 'resolvido')
    && (filtroTipos.length === 0 || filtroTipos.includes(r.tipo ?? 'sem')));
  /** As opcoes do filtro, com a conta de cada uma: um filtro que nao diz o
   *  tamanho do que oferece faz quem clica descobrir por tentativa.
   *
   *  A conta e sobre a fila que a chave de resolvidos deixa passar - dizer "3
   *  bugs" e mostrar um so, porque dois estao resolvidos, e pior que nao dizer
   *  nada. E `Sem tipo` so aparece quando existe algum: opcao que sempre
   *  devolve lista vazia e so mais uma linha para ler. */
  const opcoesDeTipo = useMemo(() => {
    const naFila = (lista ?? []).filter(r => verResolvidos || r.status !== 'resolvido');
    const quantos = (t: string) => naFila.filter(r => (r.tipo ?? 'sem') === t).length;
    const semTipo = quantos('sem');
    return [
      ...TIPOS_DO_RELATO.map(t => ({ value: t.valor, label: `${t.label} (${quantos(t.valor)})` })),
      ...(semTipo ? [{ value: 'sem', label: `Sem tipo (${semTipo})` }] : []),
    ];
  }, [lista, verResolvidos]);
  const { toast } = useToast();
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  useEffect(() => {
    let vivo = true;
    carregar()
      .then(r => { if (!vivo) return; if (r.error) setErro(r.error); else setLista(r.reportes ?? []); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar os relatos.'); });
    return () => { vivo = false; };
  }, []);

  /**
   * O chamado que o inbox mirou nasce aberto, e a fila rola ate ele.
   *
   * Depois da lista chegar, e nao no primeiro quadro: a linha so existe quando
   * os relatos chegam, e mandar rolar ate ela antes disso e rolar ate nada.
   * Quem chega pela lista, sem mira, nao tem nenhuma aberta - e a fila e para
   * varrer, e tres detalhes abertos ja sao mais texto do que fila.
   */
  useEffect(() => {
    if (!expandir || !lista?.length) return;
    if (!lista.some(r => r.id === expandir)) return;
    setAberta(expandir);
    // O resolvido so aparece com a chave ligada: mirado pelo inbox, ele tem de
    // aparecer de qualquer jeito, senao a fila abre sem o chamado do aviso.
    if (lista.find(r => r.id === expandir)?.status === 'resolvido') setVerResolvidos(true);
    // Um quadro depois, para a linha ja estar desenhada quando a rolagem sair.
    const t = setTimeout(() => {
      document.getElementById(`reporte-${expandir}`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(t);
  }, [expandir, lista]);

  // Modal em portal não recebe tecla por si: o Esc é escutado na janela. Com a
  // prévia ou a pergunta do e-mail abertas, o Esc é delas - senão duas caixas
  // fechavam no mesmo toque, e a fila sumia junto com a pergunta.
  useEffect(() => {
    const sair = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !vendo && !confirmando) fechar();
    };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [fechar, vendo, confirmando]);

  /** Pinta primeiro e desfaz no erro: ninguém espera a ida e a volta para ver o
   *  próprio gesto. */
  async function trocar(id: number, status: string, avisar: boolean, texto = '') {
    if (!mudarStatus) return;
    const antes = lista;
    const recado = texto.trim();
    setErroStatus('');
    // A nota entra na hora com o que a pessoa acabou de escrever; do servidor
    // só viria o carimbo de data, e esperá-lo para ver o próprio texto seria
    // esperar a ida e a volta por nada.
    const provisoria: NotaDoRelato | null = recado
      ? { texto: recado, status, autor_nome: 'Você', criado_em: new Date().toISOString() }
      : null;
    setLista(l => l?.map(x => (x.id === id
      ? { ...x, status, notas: provisoria ? [...(x.notas ?? []), provisoria] : x.notas }
      : x)) ?? l);
    const r = await mudarStatus(id, status, avisar, recado);
    if (r?.error) {
      setLista(antes);
      setErroStatus(r.error);
      return;
    }
    // Gravou, mas o e-mail não saiu: não é erro - o andamento mudou -, e mesmo
    // assim precisa ser dito, senão quem clicou acha que avisou alguém. Fica na
    // linha de aviso, e não no balão: isso é ressalva a resolver, e ressalva que
    // some sozinha em quatro segundos é ressalva perdida.
    if (r?.aviso) { setErroStatus(r.aviso); return; }
    // Deu tudo certo: o balão confirma o que aconteceu, inclusive quando a
    // escolha foi não avisar ninguém. Sem ele, "Não enviar" fechava a caixa e
    // não acontecia nada visível fora a cor do chip mudando lá na linha.
    const quem = antes?.find(x => x.id === id)?.autor_nome;
    const rotulo = ROTULO_STATUS[status]?.label ?? status;
    toast(
      'success',
      `Chamado marcado como ${rotulo.toLowerCase()}`,
      avisar
        ? `${quem ?? 'Quem reportou'} recebeu o aviso por e-mail.`
        : 'Ninguém foi avisado por e-mail.',
    );
  }

  /** Troca a gaveta do chamado. Como toda gravacao da casa, a tela muda no
   *  gesto e volta atras se o servidor recusar. */
  async function trocarTipo(id: number, tipo: string) {
    if (!mudarTipo) return;
    const antes = lista;
    setErroStatus('');
    setLista(l => l?.map(x => (x.id === id ? { ...x, tipo } : x)) ?? l);
    const r = await mudarTipo(id, tipo);
    if (r?.error) { setLista(antes); setErroStatus(r.error); }
  }

  /** Grava a correcao. Aqui a tela espera, ao contrario do resto: o formulario
   *  esta aberto na frente de quem escreveu, e fecha-lo antes da resposta
   *  deixaria o texto antigo de volta na linha por um instante, como se a
   *  correcao nao tivesse pegado. */
  async function gravarEdicao() {
    if (!editar || !editando) return;
    const texto = editando.texto.trim();
    if (!texto || !editando.urgencia || gravando) return;
    setGravando(true);
    setErroStatus('');
    const r = await editar(editando.id, texto, editando.urgencia);
    setGravando(false);
    if (r?.error) { setErroStatus(r.error); return; }
    setLista(l => l?.map(x => (x.id === editando.id
      ? { ...x, texto, urgencia: editando.urgencia } : x)) ?? l);
    setEditando(null);
    toast('success', 'Chamado corrigido');
  }

  /** Apaga, pintando primeiro: a linha sai da fila no gesto e volta se o
   *  servidor recusar. */
  async function apagar(alvo: ReporteNaLista) {
    if (!excluir) return;
    const antes = lista;
    setApagando(null);
    setErroStatus('');
    setLista(l => l?.filter(x => x.id !== alvo.id) ?? l);
    const r = await excluir(alvo.id);
    if (r?.error) { setLista(antes); setErroStatus(r.error); return; }
    toast('success', 'Chamado excluído');
  }

  /** Traz o chamado de volta para a fila. Espera a resposta, como a correcao:
   *  a caixa esta aberta na frente de quem clicou, e o motivo que ela carrega e
   *  o que o servidor grava como nota. */
  async function reabrirAgora() {
    if (!reabrir || !reabrindo) return;
    const texto = motivo.trim();
    if (!texto || gravando) return;
    setGravando(true);
    setErroStatus('');
    const alvo = reabrindo;
    const r = await reabrir(alvo.id, texto);
    setGravando(false);
    if (r?.error) { setErroStatus(r.error); return; }
    const quando = r?.reaberto_em ?? new Date().toISOString();
    // A nota entra na hora com o que a pessoa acabou de escrever; do servidor
    // so viria o carimbo, e espera-lo para ver o proprio texto e esperar a ida
    // e a volta por nada.
    setLista(l => l?.map(x => (x.id === alvo.id
      ? {
        ...x,
        status: 'aberto',
        reaberto_em: quando,
        notas: [...(x.notas ?? []), {
          texto, status: 'aberto', autor_nome: 'Você', criado_em: quando,
        }],
      }
      : x)) ?? l);
    limparReabertura();
    // O aviso que falhou nao e erro: o chamado voltou para a fila. Ele fica na
    // linha de ressalva, e nao no balao, porque some sozinho em quatro segundos
    // e ressalva que some e ressalva perdida.
    if (r?.aviso) { setErroStatus(r.aviso); return; }
    toast('success', 'Chamado reaberto', 'Quem cuida da fila foi avisado por e-mail.');
  }

  // O cursor ja no motivo quando a caixa abre: escrever e o que se faz ali. Por
  // efeito, e nao por `autoFocus` - o campo vive dentro de uma caixa animada.
  useEffect(() => { if (reabrindo) campoMotivo.current?.focus(); }, [reabrindo]);

  /** Quem o e-mail iria avisar, para a pergunta dizer o nome em vez de "a
   *  pessoa". */
  const alvoDoAviso = confirmando ? lista?.find(x => x.id === confirmando.id) : null;

  // O cursor já no comentário quando a pergunta abre: escrever é o que se faz
  // ali, e as duas saídas estão a um Tab. Por efeito, e não por `autoFocus` -
  // o campo vive dentro de uma caixa que entra animada.
  useEffect(() => { if (confirmando) campoNota.current?.focus(); }, [confirmando]);

  /**
   * Abrir é trocar um estado, e mais nada.
   *
   * Antes o detalhe só era montado no primeiro clique, e a classe `aberto`
   * vinha dois quadros depois, para a animação ter de onde sair. O preço era
   * alto demais: numa janela encoberta o Chrome para de entregar quadro sem
   * marcar a aba como escondida - `document.hidden` continua falso -, e os
   * dois quadros nunca chegavam. A linha montava o detalhe de altura zero, dava
   * o tremido, e não abria. Voltar à janela soltava tudo de uma vez.
   *
   * Agora o detalhe nasce montado com a lista, que é o que a regra da casa já
   * pedia: conteúdo montado antes de abrir e mantido montado. São algumas
   * linhas de texto por chamado, e em troca a abertura não depende de o
   * navegador estar com vontade de desenhar.
   */
  function alternar(id: number) {
    setAberta(a => (a === id ? null : id));
  }

  return createPortal(
    <>
      <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`} style={{ zIndex: 10040 }} {...fundo}>
        <div className="modal-central reportes-modal" onClick={e => e.stopPropagation()}>
          <div className="gravacao-topo">
            {/* `com-descricao` porque o que acompanha o título aqui é uma
                frase, e não a data curta que a entrega e a reunião põem nesse
                mesmo lugar. */}
            <p className="gravacao-titulo com-descricao">
              <span className="gravacao-nome">Chamados</span>
              <span className="gravacao-meta">
                {admin
                  ? 'O que o time reportou, do mais urgente para o menos'
                  : 'O que você reportou, do mais urgente para o menos'}
              </span>
            </p>
            <div className="reportes-acoes">
              {/* O filtro do tipo antes da chave: ele recorta a fila, e a chave
                  so decide se o que ja acabou continua aparecendo. */}
              <FilterDropdown
                label="Tipo"
                values={filtroTipos}
                options={opcoesDeTipo}
                onChange={setFiltroTipos}
              />
              <Chave
                ligada={verResolvidos}
                onChange={setVerResolvidos}
                rotulo={`Mostrar resolvidos${resolvidos ? ` (${resolvidos})` : ''}`}
                dica="Chamados resolvidos ficam fora da fila por padrão"
              />
              <button type="button" className="admin-modal-close" onClick={fechar} aria-label="Fechar">
                <IconX size={16} />
              </button>
            </div>
          </div>

          <div className="reportes-corpo">
            {erroStatus && (
              <p className="ff-vazio ff-erro surge"><IconAlert size={13} /> {erroStatus}</p>
            )}
            {erro ? (
              <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
            ) : !lista ? (
              <div className="dux-spinner-row" style={{ padding: 48 }}><span className="dux-spinner" /></div>
            ) : visiveis.length === 0 ? (
              <p className="reportes-vazio">
                {lista.length === 0
                  ? 'Nada reportado ainda. O que for enviado pelo cartão do menu aparece aqui.'
                  : `Nada em aberto. ${resolvidos === 1 ? 'Há um chamado resolvido' : `Há ${resolvidos} chamados resolvidos`} - ligue a chave acima para vê-${resolvidos === 1 ? 'lo' : 'los'}.`}
              </p>
            ) : (
              <table className="reportes-tabela">
                <thead>
                  <tr>
                    <th>Urgência</th>
                    <th>Tipo</th>
                    <th>Relato</th>
                    <th>Print</th>
                    <th>Status</th>
                    {/* Quem só vê os próprios chamados não precisa da coluna:
                        ela diria o nome dele em toda linha. */}
                    {admin && <th>Solicitado por</th>}
                    <th>Quando</th>
                  </tr>
                </thead>
                {/* A chave remonta o corpo da tabela, e é a troca da chave que
                    faz a entrada das linhas tocar - o padrão da casa para lista
                    que responde a filtro. Ela é feita das duas escolhas de
                    filtro, e não da assinatura das linhas: assim resolver ou
                    reclassificar um chamado não reanima a fila inteira, e só
                    quem mexeu num filtro vê a entrada tocar. */}
                <tbody className="lista-anima" key={`${verResolvidos}|${filtroTipos.join(',')}`}>
                  {visiveis.map(r => {
                    const Icone = ICONE_PRIORIDADE[r.urgencia];
                    const abertaAqui = aberta === r.id;
                    const editandoAqui = editando?.id === r.id;
                    // Resolvido sai do caminho sem sair da lista: fica riscado e
                    // apagado, do jeito que um item feito fica numa lista de
                    // tarefas. Some da fila ele nao pode - a fila tambem serve
                    // para ver que aquilo ja foi tratado, e para desfazer.
                    const resolvido = r.status === 'resolvido';
                    return (
                      <Fragment key={r.id}>
                      <tr id={`reporte-${r.id}`}
                        className={`reportes-linha${abertaAqui ? ' aberta' : ''}${resolvido ? ' resolvida' : ''}`}
                        role="button" tabIndex={0} aria-expanded={abertaAqui}
                        onClick={() => alternar(r.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(r.id); }
                        }}>
                        <td>
                          {/* O selo vai num `span`, e não na própria célula: uma
                              célula com `display: flex` deixa de ser célula de
                              tabela, e a borda de baixo dela para de acompanhar
                              a linha - era o traço torto embaixo da urgência. */}
                          <span className="reportes-urgencia">
                            {Icone && <Icone size={13} />} {r.urgencia}
                          </span>
                        </td>
                        {/* Mesma regra das outras celulas com algo dentro: so
                            engole o clique quem tem o que fazer com ele. Para
                            quem nao reclassifica, o tipo e um chip, e o clique
                            volta a ser da linha. */}
                        <td onClick={admin && mudarTipo ? (e => e.stopPropagation()) : undefined}>
                          {admin && mudarTipo ? (
                            <div style={{ width: 124 }}>
                              <SelectSistema
                                valor={r.tipo ?? ''}
                                onChange={v => void trocarTipo(r.id, v)}
                                placeholder="Classificar"
                                minWidth={124}
                                estiloGatilho={{ height: 30, fontSize: 12, padding: '0 10px' }}
                                opcoes={TIPOS_DO_RELATO.map(t => ({
                                  valor: t.valor,
                                  label: t.label,
                                  icone: <t.Icone size={13} />,
                                }))}
                              />
                            </div>
                          ) : (
                            <ChipDoTipo tipo={r.tipo} />
                          )}
                        </td>
                        <td className="reportes-col-relato">
                          {/* A linha mostra o começo; o resto abre no detalhe.
                              Numa fila, o que se lê de relance é a primeira
                              frase, e um relato de dez linhas empurrava todos os
                              outros para fora da tela. */}
                          <div className="reportes-relato">
                            <span className={`entrega-seta${abertaAqui ? ' aberta' : ''}`}>
                              <IconChevronRight size={12} />
                            </span>
                            {/* A marca vem antes do relato, e nao junto do
                                status: o status ja voltou a dizer "Aberto", e o
                                que ele nao conta e que este aqui ja tinha sido
                                dado como feito uma vez. */}
                            {r.reaberto_em && (
                              <span className="reportes-reaberto"
                                title={`Reaberto em ${instante(r.reaberto_em)}`}>
                                <IconUndo size={10} /> Reaberto
                              </span>
                            )}
                            <p className="reportes-texto">{r.texto}</p>
                          </div>
                        </td>
                        {/* Só a célula que TEM algo para clicar engole o clique:
                            ver o print não é abrir o detalhe. Sem print, ela
                            volta a ser parte da linha - engolir o clique de uma
                            célula vazia deixa um pedaço morto no meio da fila, e
                            quem clicasse ali acharia que a linha não abre. */}
                        <td onClick={(r.anexos?.length ?? 0) > 0 ? (e => e.stopPropagation()) : undefined}>
                          {r.anexos?.length ? (
                            <button type="button" className="reportes-print"
                              onClick={() => setVendo({ reporte: r, indice: 0 })}
                              title={r.anexos.map(a => a.nome).join(', ')}>
                              <IconImage size={13} /> Ver
                              {r.anexos.length > 1 && <span className="reportes-print-conta">{r.anexos.length}</span>}
                            </button>
                          ) : (
                            <span className="reportes-sem" title="Sem anexo">
                              <IconImagemSem size={14} />
                            </span>
                          )}
                        </td>
                        {/* Mesma coisa aqui: o campo de status engole o clique
                            para escolher um status não abrir o detalhe junto.
                            Para quem só lê, a célula é um chip, e o clique volta
                            a ser da linha - expandir é de todo mundo. */}
                        <td onClick={admin && mudarStatus ? (e => e.stopPropagation()) : undefined}>
                          {admin && mudarStatus ? (
                            <div style={{ width: 138 }}>
                              <SelectSistema
                                valor={r.status}
                                // Escolher o andamento abre a pergunta do
                                // e-mail; a troca acontece na resposta dela.
                                onChange={v => setConfirmando({ id: r.id, status: v })}
                                opcoes={STATUS_DO_RELATO.map(st => ({
                                  valor: st.valor,
                                  label: st.label,
                                  icone: <PontoStatus cor={st.cor} />,
                                }))}
                                estiloGatilho={{
                                  height: 30, padding: '0 10px', fontSize: 12,
                                  borderRadius: 'var(--radius-pill)',
                                }}
                              />
                            </div>
                          ) : (
                            <ChipStatus status={r.status} />
                          )}
                        </td>
                        {admin && (
                          <td>
                            {/* O nome fica: a foto reconhece de relance, mas
                                quem entrou ontem ainda não sabe de quem é a
                                cara. O e-mail vai no `title`. */}
                            <span className="reportes-quem" title={r.autor_email ?? undefined}>
                              <Avatar nome={r.autor_nome} foto={r.autor_foto} size={22} />
                              {r.autor_nome}
                            </span>
                          </td>
                        )}
                        <td className="reportes-quando">
                          {instante(r.criado_em)}
                          <span className="reportes-relativo">{tempoRelativo(r.criado_em)}</span>
                        </td>
                      </tr>
                      {/* O detalhe: o relato inteiro, sem corte, e de onde ele
                          veio. Nasce montado e assim fica - é dele que a
                          animação tira a altura de destino, e montar só ao
                          abrir faria o bloco animar de nada para nada. */}
                      <tr className={`reportes-detalhe${resolvido ? ' resolvida' : ''}`}>
                        <td colSpan={admin ? 7 : 6}>
                          <div className={`revelar${abertaAqui ? ' aberto' : ''}`}>
                            <div>
                              <div className="reportes-detalhe-corpo">
                                {/* Ler vira corrigir na mesma area, e por isso
                                    o `.troca`: a peca nao nasce nem some, ela
                                    muda de cara. */}
                                {editandoAqui ? (
                                  <div className="reportes-editar troca">
                                    <textarea
                                      className="form-input"
                                      rows={4}
                                      autoFocus
                                      value={editando.texto}
                                      maxLength={4000}
                                      onChange={e => setEditando(v => v && { ...v, texto: e.target.value })}
                                      onKeyDown={e => {
                                        if (e.key === 'Escape') { e.preventDefault(); setEditando(null); }
                                        // Ctrl+Enter grava, como em toda caixa
                                        // de texto longo da casa.
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                          e.preventDefault(); void gravarEdicao();
                                        }
                                      }}
                                    />
                                    <div className="reportes-editar-linha">
                                      <div style={{ width: 150 }}>
                                        <SelectSistema
                                          valor={editando.urgencia}
                                          onChange={v => setEditando(x => x && { ...x, urgencia: v })}
                                          opcoes={PRIORIDADES.map(nivel => ({
                                            valor: nivel as string,
                                            label: nivel,
                                            icone: ICONE_PRIORIDADE[nivel]({ size: 13 }),
                                          }))}
                                          estiloGatilho={{ height: 30, fontSize: 12, padding: '0 10px' }}
                                        />
                                      </div>
                                      <button type="button" className="delete-confirm-cancel"
                                        onClick={() => setEditando(null)}>
                                        Cancelar
                                      </button>
                                      <button type="button" className="btn btn-primary btn-sm"
                                        disabled={!editando.texto.trim() || gravando}
                                        onClick={() => void gravarEdicao()}>
                                        {gravando ? <><IconSpinner size={12} /> Gravando</> : 'Gravar'}
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="reportes-detalhe-texto troca">{r.texto}</p>
                                )}
                                <p className="reportes-detalhe-meta">
                                  {r.pagina && <>Reportado em <strong>{r.pagina}</strong></>}
                                  {r.pagina && r.autor_email ? ' · ' : ''}
                                  {r.autor_email}
                                </p>
                                {/* Todos os anexos, um a um: a célula da fila
                                    abre o primeiro, e o resto se alcança aqui,
                                    que é onde o chamado se lê inteiro. */}
                                {!!r.anexos?.length && (
                                  <ul className="reportes-anexos">
                                    {r.anexos.map((a, i) => (
                                      <li key={a.id ?? `antigo-${i}`}>
                                        <button type="button" className="reportes-anexo"
                                          onClick={() => setVendo({ reporte: r, indice: i })}>
                                          {a.tipo === 'application/pdf'
                                            ? <IconDoc size={12} /> : <IconImage size={12} />}
                                          <span>{a.nome}</span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {/* O que foi dito ao mudar o andamento, da nota
                                    mais antiga para a mais nova - é a história
                                    do chamado, e ela se lê na ordem em que
                                    aconteceu. */}
                                {!!r.notas?.length && (
                                  <ul className="reportes-notas">
                                    {r.notas.map((n, i) => (
                                      <li key={i} className="reportes-nota">
                                        <p className="reportes-nota-texto">{n.texto}</p>
                                        <p className="reportes-nota-quem">
                                          {n.autor_nome}
                                          {n.status && <> · {ROTULO_STATUS[n.status]?.label ?? n.status}</>}
                                          {' · '}{instante(n.criado_em)}
                                        </p>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {/* As duas acoes de quem escreveu, e so para
                                    ela: corrigir o que contou e desistir do
                                    chamado. Ficam no pe do detalhe, e nao na
                                    linha da fila - a fila e para varrer, e um
                                    botao de apagar em toda linha e um convite
                                    ao clique errado. Somem enquanto o
                                    formulario de correcao esta aberto, que ja
                                    tem as saidas dele. */}
                                {r.meu && !editandoAqui && (editar || excluir || reabrir) && (
                                  <div className="reportes-detalhe-acoes">
                                    {/* Reabrir so existe onde faz sentido: no
                                        chamado que foi dado como resolvido.
                                        Descartado nao entra - aquilo foi uma
                                        decisao de alguem, e se discute falando
                                        com a pessoa, nao clicando. */}
                                    {reabrir && r.status === 'resolvido' && (
                                      <button type="button" className="reportes-acao"
                                        onClick={() => setReabrindo(r)}>
                                        <IconUndo size={12} /> Reabrir
                                      </button>
                                    )}
                                    {editar && (
                                      <button type="button" className="reportes-acao"
                                        onClick={() => setEditando({ id: r.id, texto: r.texto, urgencia: r.urgencia })}>
                                        <IconEdit size={12} /> Editar
                                      </button>
                                    )}
                                    {excluir && (
                                      <button type="button" className="reportes-acao perigo"
                                        onClick={() => setApagando(r)}>
                                        <IconTrash size={12} /> Excluir
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Reabrir devolve para a fila um chamado que ja tinha sido dado como
          feito, e por isso pede o motivo - sem ele, o que chega em quem cuida da
          fila e so "voltou". O botao de confirmar fica travado ate haver texto:
          e o unico campo obrigatorio de uma caixa do sistema, e e obrigatorio
          porque a caixa existe por causa dele. */}
      {reabrindo && (
        <Dialogo
          titulo="Reabrir este chamado?"
          descricao={
            <>
              <strong>{reabrindo.texto.slice(0, 90)}{reabrindo.texto.length > 90 ? '…' : ''}</strong>
              <br />
              Ele volta para a fila como Aberto, e quem cuida dela recebe um e-mail com o
              que você escrever aqui.
            </>
          }
          perigo={false}
          rotuloOk="Reabrir"
          ocupado={gravando || !motivo.trim()}
          ocupadoRotulo={gravando ? 'Reabrindo' : undefined}
          zIndex={10070}
          largura={460}
          onFechar={limparReabertura}
          onConfirmar={() => void reabrirAgora()}
        >
          <label className="reportes-nota-campo">
            <span>O que continua faltando?</span>
            <textarea
              ref={campoMotivo}
              className="form-input"
              rows={3}
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="O erro voltou a acontecer quando…"
              maxLength={2000}
            />
          </label>
        </Dialogo>
      )}

      {/* Apagar nao tem volta, e por isso pergunta. O texto mostra o comeco do
          relato: numa fila de vinte linhas parecidas, "o chamado" nao diz qual. */}
      {apagando && (
        <Dialogo
          titulo="Excluir este chamado?"
          descricao={
            <>
              <strong>{apagando.texto.slice(0, 90)}{apagando.texto.length > 90 ? '…' : ''}</strong>
              <br />
              Some da fila e não volta. Os anexos e as notas vão junto.
            </>
          }
          rotuloOk="Excluir"
          zIndex={10070}
          onFechar={() => setApagando(null)}
          onConfirmar={() => void apagar(apagando)}
        />
      )}

      {/* Mudar o andamento pergunta se quem reportou deve saber. Três respostas:
          avisar, mudar sem avisar, ou deixar como estava. O Cancelar existe
          porque escolher o andamento errado na lista é fácil, e sem ele a única
          saída era aplicar a mudança e voltar atrás depois.
          Escape e clique no fundo valem por Cancelar: sair de uma caixa nunca
          pode ser o mesmo que responder a ela. */}
      {confirmando && (
        <Dialogo
          titulo="Avisar quem reportou?"
          descricao={
            <>
              O chamado passa para <strong>{ROTULO_STATUS[confirmando.status]?.label ?? confirmando.status}</strong>
              {alvoDoAviso?.autor_email
                ? <> e um e-mail vai para <strong>{alvoDoAviso.autor_nome}</strong>, com o andamento novo.</>
                : <>. Este relato não tem e-mail de quem reportou, então não há para quem avisar.</>}
            </>
          }
          perigo={false}
          rotuloOk="Enviar"
          rotuloMeio="Não enviar"
          rotuloCancelar="Cancelar"
          zIndex={10070}
          largura={460}
          onConfirmar={() => { const c = confirmando, t = comentario; limparPergunta(); void trocar(c.id, c.status, true, t); }}
          onMeio={() => { const c = confirmando, t = comentario; limparPergunta(); void trocar(c.id, c.status, false, t); }}
          onFechar={limparPergunta}
        >
          {/* O recado é opcional, e fica gravado no chamado de qualquer jeito -
              inclusive saindo por "Não enviar". Ele é o motivo da mudança, e o
              motivo continua valendo quando se decide não escrever para
              ninguém. */}
          <label className="reportes-nota-campo">
            <span>Comentário (opcional)</span>
            <textarea
              ref={campoNota}
              className="form-input"
              rows={3}
              value={comentario}
              onChange={e => setComentario(e.target.value)}
              placeholder="O que aconteceu com esse chamado"
              maxLength={2000}
            />
          </label>
        </Dialogo>
      )}

      {/* A prévia é a mesma janela de todo anexo do sistema: imagem abre dentro
          dela, e o download sai de lá. */}
      {vendo && vendo.reporte.anexos?.[vendo.indice] && (
        <PreviaArquivo
          arquivo={{
            nome: vendo.reporte.anexos[vendo.indice].nome,
            // A chave e o id do anexo, e nao o nome: dois prints chamados
            // `image.png` no mesmo chamado nao trocariam de conteudo ao folhear.
            chave: vendo.reporte.anexos[vendo.indice].id ?? `antigo-${vendo.reporte.id}`,
          }}
          onCarregar={() => carregarPrint(vendo.reporte.id, vendo.reporte.anexos![vendo.indice].id ?? undefined)}
          onBaixar={() => {
            void baixarPrint(vendo.reporte, carregarPrint, vendo.reporte.anexos![vendo.indice].id ?? undefined);
          }}
          onFechar={() => setVendo(null)}
          // Anda em roda: do ultimo volta ao primeiro. Numa lista de tres, tanto
          // faz o caminho - o que incomoda e a seta que morre na ponta.
          navegacao={{
            posicao: vendo.indice + 1,
            total: vendo.reporte.anexos.length,
            onAnterior: () => setVendo(v => (v ? {
              ...v,
              indice: (v.indice - 1 + (v.reporte.anexos?.length ?? 1)) % (v.reporte.anexos?.length ?? 1),
            } : v)),
            onProximo: () => setVendo(v => (v ? {
              ...v,
              indice: (v.indice + 1) % (v.reporte.anexos?.length ?? 1),
            } : v)),
          }}
          // Acima da própria janela, que abre em 10040: a prévia foi aberta de
          // dentro dela, e nascer atrás seria abrir e não ver nada.
          camada={10060}
        />
      )}
    </>,
    document.body,
  );
}

/** O ponto de cor do status, na lista e no chip. */
function PontoStatus({ cor }: { cor: string }) {
  return <span className="reportes-ponto" style={{ background: cor }} />;
}

/** O tipo de quem não pode mudá-lo, na mesma pílula do status. Sem tipo ele
 *  fica cinza e diz isso com todas as letras: um traço deixaria a dúvida entre
 *  "ninguém classificou" e "não tem coluna aqui". */
function ChipDoTipo({ tipo }: { tipo: string | null }) {
  const t = tipo ? ROTULO_TIPO[tipo] : undefined;
  if (!t) {
    return (
      <span className="reportes-status" style={{ '--cor': 'var(--gray2)' } as React.CSSProperties}>
        <PontoStatus cor="var(--gray2)" />
        Sem tipo
      </span>
    );
  }
  return (
    <span className="reportes-status" style={{ '--cor': t.cor } as React.CSSProperties}>
      <t.Icone size={12} />
      {t.label}
    </span>
  );
}

/** O status de quem não pode mudá-lo: a mesma pílula de status do resto do
 *  sistema, com o ponto na cor do andamento. */
function ChipStatus({ status }: { status: string }) {
  const st = ROTULO_STATUS[status] ?? { label: status, cor: 'var(--gray2)' };
  return (
    <span className="reportes-status" style={{ '--cor': st.cor } as React.CSSProperties}>
      <PontoStatus cor={st.cor} />
      {st.label}
    </span>
  );
}

/** Salvar o print em arquivo. Blob e não `data:`: um print de tela cheia passa
 *  do teto de endereço de dados do navegador. */
async function baixarPrint(
  r: ReporteNaLista,
  carregarPrint: (id: number, anexo?: number) => Promise<{ nome: string; tipo: string; base64: string } | null>,
  anexo?: number,
) {
  const dados = await carregarPrint(r.id, anexo);
  if (!dados?.base64) return;
  const bytes = Uint8Array.from(atob(dados.base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: dados.tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = dados.nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
