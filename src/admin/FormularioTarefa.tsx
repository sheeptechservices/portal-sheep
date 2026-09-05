// ─────────────────────────────────────────────────────────────────────────────
//  Tarefa: tipos, etiquetas e o formulário.
//
//  Mora fora das telas porque duas o abrem: a de Tarefas, onde a tarefa nasce,
//  e o relatório de Gestão, onde ela é aberta a partir do quadro da semana. Um
//  formulário só - dois divergiriam no primeiro campo novo.
//
//  Não importa nada de ProjetosPage em tempo de execução, só tipos: as duas
//  telas importam este arquivo, e um valor vindo de lá fecharia o ciclo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { AtividadeDaTarefa } from './AtividadeDaTarefa';
import { createPortal } from 'react-dom';
import { iniciais, useToast } from './AdminApp';
import {
  IconAlert, IconCheck, IconChevronDown, IconDuplicar, IconPlus, IconTrash, IconUser, IconX,
} from '../components/icons';
import { SelectSistema } from '../components/SelectSistema';
import { DatePicker } from '../components/DatePicker';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { TextoRico } from '../components/TextoRico';
import { EditorRico } from '../components/EditorRico';
import { ChipReuniao } from '../components/VinculoReuniao';
import { ReuniaoModal } from '../components/ReuniaoModal';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { useLarguraPainel } from '../lib/painelLateral';
import { PuxadorDoPainel } from '../components/PuxadorDoPainel';
import { diaCurto as fmtDataCurta } from '../lib/datas';
// Reexportada: ela morava aqui e as telas a importam deste arquivo. O desenho
// saiu para os componentes quando as outras telas passaram a usar a mesma caixa.
export { ConfirmarExclusao } from '../components/Dialogo';
import { DESCRICAO_PRIORIDADE, ICONE_PRIORIDADE, PRIORIDADES } from '../lib/prioridades';
import type { Projeto, Reuniao, Tarefa } from './ProjetosPage';

/** A data da reunião no chip: dia e mês, que é o que cabe ali e o que basta
 *  para situar a conversa. */
// ── Etapas e etiquetas ────────────────────────────────────────────────────────

/** Uma coluna do quadro. Nome, cor e ordem saem de Configurações > Etapas.
 *  `is_entrada` é onde a tarefa nasce e `is_conclusao` é o que conta como
 *  trabalho terminado - o mesmo par que a entrega lê para saber o andamento. */
export interface EtapaTarefa {
  id: number;
  nome: string;
  cor: string;
  /** Papéis da equipe a quem a etapa é oferecida. Vazio é "todo mundo". */
  papeis?: string[];
  /** O que a etapa quer dizer, escrito em Configurações. Vira a dica na hora
   *  de escolher. */
  descricao?: string | null;
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
export function indexar(etapas: EtapaTarefa[]) {
  const mapa = new Map(etapas.map(e => [e.nome, e]));
  return {
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    fecha: (nome: string) => Number(mapa.get(nome)?.is_conclusao ?? 0) === 1,
    desconsidera: (nome: string) => Number(mapa.get(nome)?.is_excluded ?? 0) === 1,
  };
}

export type Etapario = ReturnType<typeof indexar>;

/** As duas perguntas que as visões fazem sobre uma etiqueta. Etiqueta que saiu
 *  da configuração e ainda está numa tarefa cai no cinza e não trava nada. */
export function indexarEtiquetas(etiquetas: EtiquetaTarefa[]) {
  const mapa = new Map(etiquetas.map(e => [e.nome, e]));
  return {
    lista: etiquetas,
    cor: (nome: string) => mapa.get(nome)?.cor ?? '#6E6F69',
    trava: (nome: string) => Number(mapa.get(nome)?.bloqueia ?? 0) === 1,
  };
}

export type Etiquetario = ReturnType<typeof indexarEtiquetas>;

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
  /** A regra de fluxo, configurada em Configurações > Etapas > Tarefas. Quem
   *  aplica a etiqueta não escolhe nada disso: já vem decidido. */
  exige_comentario?: number;
  mover_para?: string | null;
  atribuir_para?: string | null;
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
/** Quais etapas oferecer a quem move a tarefa.
 *
 *  Mesma regra da etiqueta, e pelo mesmo motivo: o papel é o daquele projeto, e
 *  quem está de fora da equipe continua vendo tudo. A etapa em que a tarefa
 *  está nunca some da lista - esconder o lugar onde ela se encontra faria o
 *  seletor mentir sobre o estado atual.
 *
 *  Isto governa o que a tela oferece, não o que o servidor aceita, e não mexe
 *  em nenhuma visão: a coluna continua no quadro, com as tarefas que estão
 *  nela. */
export function etapasParaOPapel(
  todas: EtapaTarefa[], projeto: Projeto | undefined, usuarioId: string | undefined,
  atual?: string,
): EtapaTarefa[] {
  if (!projeto || !usuarioId) return todas;
  const papel = projeto.equipe.find(m => m.id === usuarioId)?.papel;
  if (!papel) return todas;
  return todas.filter(e => (
    e.nome === atual || !e.papeis?.length || e.papeis.includes(papel)
  ));
}

export function etiquetasParaOPapel(
  todas: EtiquetaTarefa[], porPapel: boolean, projeto: Projeto | undefined, usuarioId: string | undefined,
): EtiquetaTarefa[] {
  if (!porPapel || !projeto || !usuarioId) return todas;
  const papel = projeto.equipe.find(m => m.id === usuarioId)?.papel;
  if (!papel) return todas;
  return todas.filter(e => e.papeis.length === 0 || e.papeis.includes(papel));
}

// ── Rascunho ──────────────────────────────────────────────────────────────────

export interface Pessoa { id: string; nome: string; email: string; foto_url: string | null }

/** Rascunho de tarefa, antes de virar linha. */
/** Um passo da tarefa. Sem id enquanto a tarefa não existe: aí ele vive no
 *  rascunho e nasce junto com ela. */
export interface Subtarefa {
  id?: number;
  titulo: string;
  feita: number;
}

/** O título com que uma tarefa nasce, antes de alguém escrever o dela. O
 *  servidor exige um título, e a tarefa existe desde o clique em "Nova tarefa" -
 *  então ela precisa de um enquanto ninguém digitou. */
export const TITULO_PADRAO = 'Sem título';

export interface Rascunho {
  id?: number;
  /** A lista montada antes de a tarefa existir. Depois de criada, cada item
   *  grava sozinho e esta lista deixa de ser usada. */
  subtarefas?: Subtarefa[];
  /** A explicação que uma etiqueta com regra exige. Vive no rascunho para
   *  viajar junto na gravação; o servidor a transforma em comentário da tarefa
   *  e não guarda nada aqui. */
  comentario_etiqueta?: string;
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

/** A tarefa como ela fica depois de gravada: o rascunho que a pessoa preencheu
 *  mais o que só o servidor decide - o id da tarefa nova, a posição na coluna e
 *  o carimbo de conclusão. É com ela que a tarefa aparece na tela no mesmo
 *  gesto, em vez de esperar a listagem inteira voltar do servidor. */
export function tarefaGravada(
  r: Rascunho,
  resposta: {
    id?: number; ordem?: number; criado_em?: string; concluida_em?: string | null;
    status?: string; responsavel_id?: string | null;
  },
  pessoas: Pessoa[],
): Tarefa {
  // O responsável que voltou vence o do rascunho: a regra de uma etiqueta pode
  // ter trocado o dono na própria gravação.
  const donoId = resposta.responsavel_id ?? r.responsavel_id;
  const dono = pessoas.find(p => p.id === donoId);
  return {
    id: Number(resposta.id),
    projeto_id: r.projeto_id,
    entrega_id: r.entrega_id ? Number(r.entrega_id) : null,
    titulo: r.titulo,
    descricao: r.descricao || null,
    status: resposta.status ?? r.status,
    prioridade: r.prioridade,
    responsavel_id: donoId || null,
    // O nome e a foto a tela já tem: o servidor recebe só o id de quem cuida.
    responsavel_nome: dono?.nome ?? null,
    responsavel_email: dono?.email ?? null,
    responsavel_foto: dono?.foto_url ?? null,
    prazo: r.prazo || null,
    etiquetas: r.etiquetas,
    ordem: resposta.ordem ?? 0,
    concluida_em: resposta.concluida_em ?? null,
    criado_em: resposta.criado_em ?? new Date().toISOString(),
    comentarios: 0,
    anexos: 0,
  };
}

// ── Checklist ─────────────────────────────────────────────────────────────────

/** O passo a passo já lido de cada tarefa, guardado enquanto a aba viver.
 *
 *  Mesma razão do cache da conversa: reabrir uma tarefa mostrava um vazio de
 *  meio segundo até a lista chegar, e a lista quase sempre é a mesma. Aqui ela
 *  aparece na hora e se corrige por baixo quando o servidor responde. */
const passosLidos = new Map<number, Subtarefa[]>();

/** O passo a passo da tarefa, abaixo da descrição.
 *
 *  Na tarefa que já existe, cada item grava sozinho: marcar um passo é um gesto
 *  completo, e guardá-lo esperando o "Salvar" faria o trabalho de meia hora
 *  depender de alguém lembrar de apertar um botão. Na tarefa que ainda não
 *  nasceu não há onde gravar, então a lista fica no rascunho e vai junto na
 *  criação. */
function Checklist({ tarefaId, api, rascunho, desabilitado, onMudarRascunho }: {
  /** Ausente enquanto a tarefa não foi criada. */
  tarefaId?: number;
  api?: (path: string, method?: string, body?: unknown) => Promise<any>;
  /** A lista do rascunho, usada só antes de a tarefa existir. */
  rascunho: Subtarefa[];
  desabilitado?: boolean;
  onMudarRascunho: (itens: Subtarefa[]) => void;
}) {
  const gravado = tarefaId != null && !!api;
  const [itens, setItens] = useState<Subtarefa[]>(
    () => (gravado ? passosLidos.get(tarefaId!) ?? [] : rascunho));
  const [novo, setNovo] = useState('');
  /** O campo de acrescentar só existe depois do "+". Em repouso a lista termina
   *  no último passo, e não numa caixa vazia esperando alguém. */
  const [escrevendo, setEscrevendo] = useState(false);
  /** Qual passo está sendo reescrito, pela posição na lista, e o texto em
   *  andamento. Um de cada vez: dois campos abertos na mesma lista não têm para
   *  que servir. */
  const [reescrevendo, setReescrevendo] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  /** A edição ainda está de pé. O Enter e o Escape fecham o campo, e o `blur`
   *  que vem logo atrás encontraria a marca já baixada - sem isto, o mesmo
   *  texto iria duas vezes, ou o Escape gravaria o que acabou de descartar. */
  const emEdicao = useRef(false);

  /** Chave provisória do passo que ainda está nascendo, apontando para a
   *  promessa do id verdadeiro. Marcar ou tirar um passo recém-escrito espera
   *  esse id em vez de recusar o gesto. */
  const nascendo = useRef(new Map<number, Promise<number | null>>());
  const proximaChave = useRef(-1);
  /** De que tarefa era a lista que está na tela. */
  const tarefaAnterior = useRef<number | undefined>(undefined);

  // A lista da tarefa que já existe vem do servidor; a da tarefa nova é o
  // próprio rascunho, que o painel já carrega. Já lida antes: abre com o que
  // estava e se atualiza por baixo.
  useEffect(() => {
    if (!gravado) { setItens(rascunho); return; }
    const guardado = passosLidos.get(tarefaId!);
    // A tarefa que acabou de nascer traz a lista do rascunho na tela, e ainda
    // não tem cache: zerar aqui piscaria um vazio no lugar do que a pessoa
    // acabou de escrever. Trocar de tarefa, sim, começa do zero.
    const acabouDeNascer = tarefaAnterior.current == null;
    tarefaAnterior.current = tarefaId;
    if (guardado) setItens(guardado);
    else if (!acabouDeNascer) setItens([]);
    let vivo = true;
    void api!(`?action=tarefa_subtarefas&id=${tarefaId}`).then(r => {
      const lista = (r?.subtarefas ?? []) as Subtarefa[];
      passosLidos.set(tarefaId!, lista);
      // Um passo escrito enquanto a leitura vinha não pode sumir por causa
      // dela: a resposta é velha em relação ao que acabou de ser digitado.
      if (vivo && nascendo.current.size === 0) setItens(lista);
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefaId, gravado]);

  /** Guarda a lista que a tela mostra, para a próxima abertura já nascer com
   *  ela. */
  function lembrar(novos: Subtarefa[]) {
    if (gravado) passosLidos.set(tarefaId!, novos);
  }

  /** Aplica na tela e grava. Sem tarefa, o rascunho é o destino. */
  function aplicar(novos: Subtarefa[], gravar?: () => Promise<any>) {
    const antes = itens;
    setItens(novos);
    lembrar(novos);
    if (!gravado) { onMudarRascunho(novos); return; }
    void gravar?.().then(r => {
      if (r?.error) { setItens(antes); lembrar(antes); }
    });
  }

  /** O id verdadeiro do passo. Para o que acabou de ser escrito, é a espera da
   *  resposta que o criou - e não uma recusa. */
  async function idDoPasso(item: Subtarefa): Promise<number | null> {
    const chave = item.id;
    if (chave == null) return null;
    if (chave > 0) return chave;
    return (await nascendo.current.get(chave)) ?? null;
  }

  /** Abre o passo para reescrita, com o texto que já está nele. */
  function abrirTexto(item: Subtarefa, i: number) {
    emEdicao.current = true;
    setTexto(item.titulo);
    setReescrevendo(i);
  }

  function fecharTexto() {
    emEdicao.current = false;
    setReescrevendo(null);
  }

  /** Grava o texto novo do passo. Texto vazio ou igual ao que já estava não
   *  vira gravação: fechar sem mudar nada não é uma edição, e apagar tudo é
   *  desistir, não excluir - para tirar o passo existe o botão ao lado. */
  function renomear(item: Subtarefa, i: number) {
    if (!emEdicao.current) return;
    fecharTexto();
    const titulo = texto.trim();
    if (!titulo || titulo === item.titulo) return;
    aplicar(
      itens.map((x, j) => (j === i ? { ...x, titulo } : x)),
      async () => {
        const id = await idDoPasso(item);
        if (!id) return { error: 'O passo não chegou a ser gravado.' };
        return api!('', 'POST', { action: 'atualizar_tarefa_subtarefa', id, titulo });
      },
    );
  }

  function adicionar() {
    const titulo = novo.trim();
    if (!titulo) return;
    setNovo('');
    if (!gravado) { aplicar([...itens, { titulo, feita: 0 }]); return; }
    // O passo entra no gesto, com uma chave provisória, e o id do servidor a
    // substitui quando chega. Esperar a resposta para só então mostrar fazia
    // quem escreve uma lista de dez passos esperar dez vezes.
    const chave = proximaChave.current--;
    const provisorio: Subtarefa = { id: chave, titulo, feita: 0 };
    setItens(atual => { const n = [...atual, provisorio]; lembrar(n); return n; });
    const promessa = api!('', 'POST', {
      action: 'add_tarefa_subtarefa', tarefa_id: tarefaId, titulo,
    }).then(r => {
      nascendo.current.delete(chave);
      if (r?.error || !r?.subtarefa) {
        // Não vingou: o passo sai da lista de onde tinha acabado de entrar.
        setItens(atual => { const n = atual.filter(x => x.id !== chave); lembrar(n); return n; });
        return null;
      }
      setItens(atual => {
        const n = atual.map(x => (x.id === chave ? (r.subtarefa as Subtarefa) : x));
        lembrar(n);
        return n;
      });
      return Number(r.subtarefa.id);
    });
    nascendo.current.set(chave, promessa);
  }

  const feitas = itens.filter(i => Number(i.feita) === 1).length;

  return (
    <div className="form-group">
      <label className="form-label">
        Checklist
        {itens.length > 0 && (
          <span className="checklist-conta">{feitas} de {itens.length}</span>
        )}
      </label>

      {itens.length > 0 && (
        <div className="checklist">
          {itens.map((item, i) => (
            <div key={item.id ?? `novo-${i}`}
              className={`checklist-item${Number(item.feita) === 1 ? ' feito' : ''}`}>
              {/* A marca ficou sozinha no rótulo: com o texto dentro dele,
                  clicar na palavra marcava o passo, e é justamente ali que
                  agora se clica para reescrever. */}
              <label className="checklist-marca" title="Marcar como feito">
                <input type="checkbox" className="form-checkbox"
                  checked={Number(item.feita) === 1}
                  disabled={desabilitado}
                  aria-label={`Marcar "${item.titulo}" como feito`}
                  onChange={e => {
                    const feita = e.target.checked ? 1 : 0;
                    aplicar(
                      itens.map((x, j) => (j === i ? { ...x, feita } : x)),
                      async () => {
                        const id = await idDoPasso(item);
                        if (!id) return { error: 'O passo não chegou a ser gravado.' };
                        return api!('', 'POST', {
                          action: 'atualizar_tarefa_subtarefa', id, feita: !!feita,
                        });
                      },
                    );
                  }} />
              </label>
              {/* O texto é lido e escrito no mesmo lugar, então a troca é só de
                  opacidade: um deslocamento aqui leria como se o passo tivesse
                  pulado de linha. */}
              {reescrevendo === i && !desabilitado ? (
                <input className="checklist-texto-campo troca" value={texto} autoFocus
                  aria-label="Texto do passo"
                  onChange={e => setTexto(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); renomear(item, i); }
                    if (e.key === 'Escape') { e.preventDefault(); fecharTexto(); }
                  }}
                  onBlur={() => renomear(item, i)} />
              ) : desabilitado ? (
                <span className="checklist-texto troca">{item.titulo}</span>
              ) : (
                <button type="button" className="checklist-texto troca"
                  title="Clique para editar" onClick={() => abrirTexto(item, i)}>
                  {item.titulo}
                </button>
              )}
              {!desabilitado && (
                <button type="button" className="checklist-tirar"
                  aria-label={`Tirar "${item.titulo}"`} title="Tirar da lista"
                  onClick={() => aplicar(
                    itens.filter((_, j) => j !== i),
                    async () => {
                      const id = await idDoPasso(item);
                      if (!id) return { error: 'O passo não chegou a ser gravado.' };
                      return api!('', 'POST', { action: 'excluir_tarefa_subtarefa', id });
                    },
                  )}>
                  <IconX size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!desabilitado && (escrevendo ? (
        // Enter adiciona e o campo continua ali: quem escreve uma lista escreve
        // vários itens seguidos, e ter de clicar de novo a cada um quebraria o
        // ritmo. Sair com o campo vazio recolhe de volta no "+".
        <input className="checklist-novo troca" value={novo} autoFocus
          placeholder="O que precisa ser feito"
          onChange={e => setNovo(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); adicionar(); }
            if (e.key === 'Escape') { setNovo(''); setEscrevendo(false); }
          }}
          onBlur={() => { adicionar(); setEscrevendo(false); }} />
      ) : (
        <button type="button" className="checklist-add troca" onClick={() => setEscrevendo(true)}>
          <IconPlus size={12} />
          {itens.length ? 'Outro passo' : 'Adicionar um passo'}
        </button>
      ))}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

export function Avatar({ nome, foto, size = 22 }: { nome: string; foto?: string | null; size?: number }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return (
      // `lazy` e `async`: numa lista longa - a fila de chamados, o quadro de
      // tarefas - sao dezenas de fotos remotas, e busca-las e decodifica-las
      // todas de uma vez trava a rolagem enquanto elas chegam.
      <img src={foto} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async"
        onError={() => setFalhou(true)} title={nome}
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
export function AvatarVazio({ size = 20 }: { size?: number }) {
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

/** Altura da lista de etiquetas: cabe o conjunto inteiro, até um teto. Rolar
 *  para achar a última é atrito num campo que se usa muito. */
const alturaDaLista = (n: number) => Math.min(8 + n * 38, 420);

export function ChipEtiqueta({ etiqueta, cor = '#6E6F69' }: { etiqueta: string; cor?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '.03em',
      color: cor, background: `${cor}1F`, padding: '2px 7px',
      borderRadius: 'var(--radius-pill)', whiteSpace: 'nowrap',
    }}>{etiqueta}</span>
  );
}

// ── Seleção de etiquetas ──────────────────────────────────────────────────────

export function SeletorEtiquetas({ valor, opcoes, etq, onChange, desabilitado }: {
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

/** A etapa como pílula no cabeçalho do painel, e não como campo no meio do
 *  formulário. É o mesmo desenho do status no painel de projeto: a etapa é o
 *  estado da tarefa, a coisa que mais se olha e mais se troca, e ela se perde
 *  quando vira um seletor entre outros quatro. */
function PilulaEtapa({ valor, etapas, desabilitado, onChange }: {
  valor: string;
  etapas: EtapaTarefa[];
  desabilitado: boolean;
  onChange: (v: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  // Etapa que saiu da configuração continua sendo o estado da tarefa: cai no
  // cinza em vez de sumir do gatilho.
  const cor = etapas.find(e => e.nome === valor)?.cor ?? '#6E6F69';

  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  return (
    <>
      <button
        ref={gatilho}
        type="button"
        className="status-select-trigger sem-contorno"
        style={{ ['--sc' as string]: cor, cursor: desabilitado ? 'default' : 'pointer' }}
        disabled={desabilitado}
        title={etapas.find(e => e.nome === valor)?.descricao ?? undefined}
        aria-label={`Etapa: ${valor || 'sem etapa'}`}
        onClick={() => {
          if (desabilitado || !gatilho.current) return;
          setPos(ancorar(gatilho.current, etapas.length, 200));
          setAberto(a => !a);
        }}
      >
        <span className="status-select-dot" style={{ background: cor }} />
        <span>{valor || 'Sem etapa'}</span>
        {!desabilitado && <IconChevronDown size={10} />}
      </button>

      {aberto && createPortal(
        <div ref={lista} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width }}>
          {etapas.map(e => {
            const ativo = e.nome === valor;
            return (
              // A descrição da etapa vira a dica: o nome cabe em duas
              // palavras, e o critério de quando usar cada uma nem sempre cabe.
              // Quem configura escreve em Configurações; quem escolhe lê aqui.
              <div key={e.id} className={`status-select-option${ativo ? ' active' : ''}`}
                title={e.descricao ?? undefined}
                onClick={() => { onChange(e.nome); setAberto(false); }}>
                <span className="status-select-dot" style={{ background: e.cor }} />
                <span>{e.nome}</span>
                {ativo && (
                  <span style={{ marginLeft: 'auto', color: e.cor, display: 'inline-flex' }}>
                    <IconCheck size={12} />
                  </span>
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

// ── O formulário ──────────────────────────────────────────────────────────────

export function FormularioTarefa({ rascunho, projetos, etapas, etiquetas, etiquetaPorPapel,
  usuarioId, etq, pessoas, salvando, somenteLeitura, podeComentar, api,
  onMudar, onFechar, onSalvar, onExcluir, onDuplicar }: {
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
  /** Sem isto o diário e a conversa não aparecem: tarefa que ainda não existe
   *  não tem histórico, e a tela que não passa `api` não sabe buscá-lo. */
  podeComentar?: boolean;
  api?: (path: string, method?: string, body?: unknown) => Promise<any>;
  onMudar: (r: Rascunho) => void;
  onFechar: () => void;
  /** Grava o rascunho. Devolve `false` quando o servidor recusou, para o painel
   *  continuar tratando a alteração como pendente. */
  onSalvar: () => void | Promise<boolean | void>;
  /** Ausente para quem não pode excluir, e em tarefa que ainda não existe. */
  onExcluir?: () => void;
  /** Cria uma cópia da tarefa. Ausente para quem não pode criar. */
  onDuplicar?: () => void;
}) {
  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => onMudar({ ...rascunho, [k]: v });
  const projeto = projetos.find(p => p.id === rascunho.projeto_id);
  /** As reuniões da entrega a que esta tarefa pertence. Tarefa solta não herda
   *  nada: não há entrega de onde. */
  const reunioesDaEntrega = rascunho.entrega_id
    ? (projeto?.reunioes ?? []).filter(r =>
        (r.entregas ?? []).includes(Number(rascunho.entrega_id)))
    : [];
  const { toast } = useToast();
  const { saindo, fechar } = useSaidaSuave(onFechar);
  // Fechar clicando no fundo passa pela mesma porta do botão Fechar: era o
  // caminho que perdia o que estava na pausa da digitação.
  const fundo = useFecharNoFundo(() => fecharGravando());
  // Mesma gaveta do painel de projeto, com largura e modo tela cheia próprios.
  const { largura, arrastando, setArrastando, porTecla } = useLarguraPainel('tarefa');
  const trava = rascunho.etiquetas.some(e => etq.trava(e));

  /** As etiquetas que a tarefa já tinha quando o painel abriu. Regra é sobre
   *  pôr a etiqueta, não sobre carregá-la: reabrir uma tarefa que já é "pm: bug"
   *  não cobra explicação de novo. */
  const jaTinha = useRef<string[]>(rascunho.etiquetas);
  useEffect(() => { jaTinha.current = rascunho.etiquetas; }, [rascunho.id]);

  /** As que acabaram de entrar e pedem comentário. */
  const pedemComentario = rascunho.etiquetas.filter(nome => (
    !jaTinha.current.includes(nome)
    && !!etiquetas.find(e => e.nome === nome)?.exige_comentario
  ));
  /** A descrição em modo de escrita. Fora dele, o texto aparece formatado - é o
   *  que faz a marcação valer a pena para quem lê. */
  const [editandoDesc, setEditandoDesc] = useState(false);
  /** A reunião aberta pelo chip: gravação, índice e resumos, num modal central.
   *  Ver a conversa é o que se quer ali - trocar de tela para procurá-la era o
   *  caminho longo para a mesma coisa. */
  const [reuniaoAberta, setReuniaoAberta] = useState<Reuniao | null>(null);

  /** O painel grava sozinho, sem botão.
   *
   *  O que se digita numa tarefa é trabalho, e trabalho não deveria depender de
   *  alguém lembrar de apertar um botão antes de fechar a aba. A gravação sai
   *  depois de uma pausa na digitação, e não a cada tecla: assim uma frase
   *  inteira vira uma gravação, e não trinta.
   *
   *  A comparação ignora o `id` de propósito - ele aparece justamente por causa
   *  da primeira gravação, e sem isso a chegada dele dispararia outra. */
  const impresso = JSON.stringify({ ...rascunho, id: undefined });
  const ultimoGravado = useRef(impresso);
  const podeGravar = !somenteLeitura
    && !!rascunho.titulo.trim()
    // A etiqueta que pede explicação segura a gravação: o servidor recusaria, e
    // recusar sozinho, sem ninguém ter apertado nada, seria um erro do nada.
    && !(pedemComentario.length > 0 && !(rascunho.comentario_etiqueta ?? '').trim());

  /** Grava, e só considera gravado o que o servidor aceitou.
   *
   *  A marca é posta antes da ida - senão duas pausas seguidas mandariam a mesma
   *  coisa duas vezes - e desfeita se a resposta recusar: assim a alteração
   *  volta a contar como pendente, e a pausa seguinte (ou o fechar) tenta de
   *  novo em vez de dar por gravado o que não foi. */
  async function gravar() {
    const marca = impresso;
    ultimoGravado.current = marca;
    const ok = await onSalvar();
    if (ok === false && ultimoGravado.current === marca) ultimoGravado.current = '';
  }

  useEffect(() => {
    if (!podeGravar || impresso === ultimoGravado.current) return;
    const t = window.setTimeout(() => { void gravar(); }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [impresso, podeGravar]);

  /** O estado vivo do rascunho, para a saída de emergência abaixo poder gravar
   *  de fora do render. Guarda os valores, e não a conclusão: se guardasse um
   *  "está sujo" calculado no render, ele continuaria verdadeiro depois de o
   *  fechar já ter gravado, e a mesma alteração iria duas vezes. */
  const agora = useRef({ impresso, podeGravar, gravar });
  agora.current = { impresso, podeGravar, gravar };

  /** As saídas que não passam por botão nenhum.
   *
   *  O painel pode sumir sem que ninguém tenha clicado em Fechar: a página é
   *  recarregada, a aba é fechada, o computador dorme, ou o próprio pai
   *  desmonta o painel. Em qualquer um desses casos, o que estava na pausa da
   *  digitação ia junto. Aqui ele é despachado antes.
   *
   *  `visibilitychange` é o gancho que o navegador garante ao fechar a aba; o
   *  desmonte cobre o resto. */
  useEffect(() => {
    const despachar = () => {
      const e = agora.current;
      if (e.podeGravar && e.impresso !== ultimoGravado.current) void e.gravar();
    };
    const aoEsconder = () => { if (document.visibilityState === 'hidden') despachar(); };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('pagehide', despachar);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('pagehide', despachar);
      despachar();
    };
  }, []);

  /** Despacha agora o que estava esperando a pausa. Sair de um campo é o fim
   *  de um pensamento, e o que ficou escrito não deveria depender de mais nada
   *  acontecer depois. Gravar duas vezes não acontece: `gravar` marca o que
   *  mandou antes de ir, e o fechar em seguida encontra tudo já gravado. */
  function gravarPendente() {
    if (podeGravar && impresso !== ultimoGravado.current) void gravar();
  }

  /** Fechar com alteração ainda na pausa grava na hora: a pausa é uma
   *  conveniência para não gravar letra a letra, não uma licença para perder o
   *  que foi escrito. */
  function fecharGravando() {
    if (impresso !== ultimoGravado.current) {
      if (podeGravar) void gravar();
      // Fechar com alteração que não pode ser gravada perdia tudo em silêncio.
      // Não dá para gravar - o servidor recusaria -, mas dá para dizer, e dizer
      // o motivo, que é o que a pessoa precisa para decidir se volta.
      else {
        toast('error', 'Alterações não gravadas',
          !rascunho.titulo.trim()
            ? 'A tarefa precisa de um título, e o que você escreveu agora não foi gravado.'
            : `A etiqueta "${pedemComentario[0]}" pede um comentário explicando o porquê.`);
      }
    }
    fechar();
  }

  // A lista muda com o projeto escolhido: é lá que a pessoa tem um papel.
  const etiquetasVisiveis = etiquetasParaOPapel(etiquetas, etiquetaPorPapel, projeto, usuarioId);
  const escondidas = etiquetas.length - etiquetasVisiveis.length;

  return createPortal(
    <div className={`admin-modal-overlay${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10000 }} {...fundo}>
      <PuxadorDoPainel largura={largura} arrastando={arrastando}
        setArrastando={setArrastando} porTecla={porTecla} />
      <div className="admin-modal painel-tarefa"
        style={{ width: `min(${largura}px, 96vw)` }}
        onClick={e => e.stopPropagation()}>

        {/* Grudento: rolando a conversa lá embaixo, o título da tarefa e o
            botão de salvar continuam à vista. */}
        <div className="admin-modal-header">
          {/* `flex: 1` porque sem ele o bloco encolhe para o tamanho natural de
              um input (~20 caracteres) e o título corta muito antes da borda,
              deixando um vão até os botões. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 11, color: 'var(--gray2)', fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {rascunho.id ? 'Tarefa' : 'Nova tarefa'}
            </p>
            {/* O título é editado onde ele é lido, e não num campo lá embaixo.
                Cresce em várias linhas quando é comprido: cortar com reticências
                o texto que a pessoa está escrevendo esconde o que ela digitou. */}
            {somenteLeitura ? (
              <h3 className="painel-titulo">{rascunho.titulo || 'Sem título'}</h3>
            ) : (
              <input
                className="painel-titulo painel-titulo-campo"
                value={rascunho.titulo}
                // Nasce em foco e com o texto marcado quando ainda é o título
                // de partida: a primeira tecla substitui, em vez de escrever
                // depois de "Sem título".
                autoFocus={rascunho.titulo === TITULO_PADRAO}
                onFocus={e => { if (e.target.value === TITULO_PADRAO) e.target.select(); }}
                placeholder="Título da tarefa"
                aria-label="Título da tarefa"
                title={rascunho.titulo}
                onChange={e => set('titulo', e.target.value)}
                // Enter sai do campo, que é o que a mão espera depois de
                // escrever o nome de uma coisa.
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              />
            )}
            <div style={{ marginTop: 6 }}>
              <PilulaEtapa valor={rascunho.status}
                etapas={etapasParaOPapel(etapas, projeto, usuarioId, rascunho.status)}
                desabilitado={somenteLeitura} onChange={v => set('status', v)} />
            </div>
          </div>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button type="button" className="admin-modal-close" aria-label="Fechar"
              onClick={fecharGravando}>
              <IconX size={16} />
            </button>
          </span>
        </div>

        <div className="admin-modal-body">

          <div className="form-group">
            <label className="form-label">Descrição</label>
            {/* Em repouso o texto aparece formatado; clicar devolve o campo. A
                marcação continua sendo texto puro no banco - é ela que sai em
                exportação, relatório e prompt de IA sem ninguém ter de desmontar
                HTML. */}
            {/* `editandoDesc` entra no cálculo por causa do cursor, e não só
                por causa do clique na caixa de leitura: sem isso, a descrição
                que começa vazia mostrava o campo, e a primeira letra digitada
                já a deixava "não vazia" - a condição virava falsa, o campo
                sumia no meio da frase e o resto do que se escrevia caía fora
                da tela. */}
            {!somenteLeitura && (editandoDesc || !rascunho.descricao.trim()) ? (
              /* Cresce com o texto até 260px. Altura fixa escondia o que já
                 estava escrito - quem abria uma tarefa de dez linhas via três, e
                 rolava dentro de uma caixa dentro de um painel que também rola.
                 O teto existe pelo motivo oposto: descrição longa não pode
                 empurrar o resto do formulário para fora da tela. */
              <EditorRico
                className="form-input troca"
                valor={rascunho.descricao}
                autoFocus={editandoDesc}
                ariaLabel="Descrição da tarefa"
                placeholder="O que precisa ser feito"
                onMudar={v => set('descricao', v)}
                onFoco={() => setEditandoDesc(true)}
                onBlur={() => { setEditandoDesc(false); gravarPendente(); }}
              />
            ) : (
              <div className="form-input texto-rico-caixa troca"
                role={somenteLeitura ? undefined : 'button'}
                tabIndex={somenteLeitura ? undefined : 0}
                title={somenteLeitura ? undefined : 'Clique para editar'}
                onClick={() => { if (!somenteLeitura) setEditandoDesc(true); }}
                onKeyDown={e => {
                  if (somenteLeitura) return;
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditandoDesc(true); }
                }}>
                {rascunho.descricao.trim()
                  ? <TextoRico texto={rascunho.descricao} />
                  : <span className="texto-rico-vazio">Sem descrição</span>}
              </div>
            )}
          </div>

          {/* O passo a passo, logo abaixo do que a tarefa é: um é o enunciado,
              o outro é o caminho. */}
          <Checklist
            tarefaId={rascunho.id}
            api={api}
            rascunho={rascunho.subtarefas ?? []}
            desabilitado={somenteLeitura}
            onMudarRascunho={v => set('subtarefas', v)}
          />

          {/* `minmax(0, 1fr)` e não `1fr`: item de grade não encolhe abaixo do
              próprio conteúdo por padrão, e o rótulo comprido de uma entrega
              esticava a coluna para fora do modal. */}
          <div className="campos-2" style={{ display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
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
          {/* Três campos desde que a etapa subiu para o cabeçalho, em fila que
              quebra, e não em grade: numa grade de duas colunas o terceiro campo
              cai sozinho e deixa um buraco do lado, e a largura da janela ainda
              forçava duas colunas mesmo com espaço para as três. Aqui quem sobra
              estica e ocupa a linha inteira. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div className="form-group" style={{ flex: '1 1 190px', minWidth: 0 }}>
              <label className="form-label">Prioridade</label>
              {/* Com o desenho da prioridade, como no cadastro de projeto: as
                  quatro se reconhecem pelo ícone antes da palavra. */}
              <SelectSistema valor={rascunho.prioridade} onChange={v => set('prioridade', v)}
                opcoes={PRIORIDADES.map(x => ({
                  valor: x as string,
                  label: x,
                  icone: ICONE_PRIORIDADE[x]?.({ size: 15 }),
                  descricao: DESCRICAO_PRIORIDADE[x],
                }))} />
            </div>
            <div className="form-group" style={{ flex: '1 1 190px', minWidth: 0 }}>
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
            <div className="form-group" style={{ flex: '1 1 190px', minWidth: 0 }}>
              <label className="form-label">Prazo</label>
              <DatePicker compact allowPast value={rascunho.prazo} onChange={v => set('prazo', v)} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Etiquetas</label>
            <SeletorEtiquetas valor={rascunho.etiquetas} opcoes={etiquetasVisiveis} etq={etq}
              desabilitado={somenteLeitura} onChange={v => set('etiquetas', v)} />

            {/* A etiqueta que pede explicação cobra na hora de pôr, e não
                depois: o campo nasce aqui, colado nela, e o que se escreve vira
                comentário da tarefa. */}
            {pedemComentario.length > 0 && !somenteLeitura && (
              <div className="surge" style={{ marginTop: 8 }}>
                <label className="form-label" htmlFor="comentario-etiqueta">
                  {pedemComentario.length > 1
                    ? `${pedemComentario.join(' e ')} pedem uma explicação *`
                    : `${pedemComentario[0]} pede uma explicação *`}
                </label>
                <textarea id="comentario-etiqueta" className="form-input" rows={2}
                  value={rascunho.comentario_etiqueta ?? ''}
                  onChange={e => set('comentario_etiqueta', e.target.value)}
                  placeholder="O que aconteceu, em uma ou duas linhas" />
                {pedemComentario.length > 0 && !(rascunho.comentario_etiqueta ?? '').trim() ? (
                  <p className="form-error" style={{ marginTop: 4 }}>
                    A tarefa só volta a gravar depois desta explicação.
                  </p>
                ) : (
                  <p className="form-hint" style={{ marginTop: 4 }}>
                    Entra na conversa da tarefa, com o seu nome.
                  </p>
                )}
              </div>
            )}
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

          {/* As reuniões vêm da entrega, e não da tarefa: é na entrega que a
              conversa acontece, e a tarefa é um pedaço dela. Aqui só se lê -
              vincular é do lado da entrega ou da própria reunião. */}
          {reunioesDaEntrega.length > 0 && (
            <section>
              <div className="admin-section-head">
                <p className="admin-section-title">
                  Reuniões da entrega
                  <span style={{ marginLeft: 6, fontWeight: 600 }}>({reunioesDaEntrega.length})</span>
                </p>
              </div>
              <div className="vinculo-chips">
                {reunioesDaEntrega.map(r => (
                  <ChipReuniao key={r.id}
                    assunto={r.assunto}
                    data={fmtDataCurta(r.data)}
                    fireflies={!!r.fireflies_id}
                    titulo={`Abrir "${r.assunto}"`}
                    onAbrir={() => setReuniaoAberta(r)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Só em tarefa que já existe: diário de tarefa não gravada não é
              nada, e o comentário não teria onde pendurar. */}
          {rascunho.id != null && api && (
            <AtividadeDaTarefa
              tarefaId={rascunho.id}
              pessoas={pessoas}
              usuarioId={usuarioId}
              podeComentar={!!podeComentar}
              api={api}
            />
          )}
        </div>

        <div className="painel-rodape">
          {/* Longe de Salvar de propósito: excluir e duplicar são ações sobre a
              tarefa inteira, e ficar ao lado do botão que se aperta o tempo
              todo convida ao clique errado. */}
          <span className="painel-rodape-lado">
            {rascunho.id != null && onExcluir && (
              <button type="button" className="rodape-icone perigo"
                title="Excluir tarefa" aria-label="Excluir tarefa" onClick={onExcluir}>
                <IconTrash size={15} />
              </button>
            )}
            {rascunho.id != null && onDuplicar && (
              <button type="button" className="rodape-icone"
                title="Duplicar tarefa" aria-label="Duplicar tarefa"
                disabled={salvando} onClick={onDuplicar}>
                <IconDuplicar size={15} />
              </button>
            )}
          </span>
          {/* Sem Salvar: a tarefa já está gravada. O que fica é o aviso do que
              acabou de acontecer - e ele diz a verdade, inclusive quando ainda
              falta alguma coisa para poder gravar. */}
          {!somenteLeitura && (
            <span className="painel-estado" aria-live="polite">
              {/* Só fala quando há o que dizer: a gravação acontecendo e a
                  alteração que ainda não foi. Em repouso o rodapé fica calado -
                  "tudo gravado" é o estado normal, e anunciar o normal a cada
                  pausa é ruído. */}
              {!rascunho.titulo.trim() ? ''
                : salvando ? 'Gravando…'
                  : impresso !== ultimoGravado.current ? 'Alterações não gravadas'
                    : ''}
            </span>
          )}
          <button type="button" className="delete-confirm-cancel" onClick={fecharGravando}>
            Fechar
          </button>
        </div>

      </div>

      {/* A reunião aberta pelo chip. Fora da gaveta porque é modal central: ela
          cobre a tela, e não o painel. */}
      {reuniaoAberta && api && (
        <ReuniaoModal
          reuniao={reuniaoAberta}
          buscarGravacao={async id => (
            await api(`?action=fireflies_gravacao&id=${encodeURIComponent(id)}`)
              ?? { error: 'Sessão expirada.' }
          )}
          buscarTranscricao={async id => (
            await api(`?action=fireflies_transcricao&id=${encodeURIComponent(id)}`)
              ?? { error: 'Sessão expirada.' }
          )}
          onFechar={() => setReuniaoAberta(null)}
        />
      )}
    </div>,
    document.body,
  );
}
