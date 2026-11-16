// ─────────────────────────────────────────────────────────────────────────────
//  O diário: as tarefas de quem está olhando, para hoje e para a semana.
//
//  Mora no canto da tela, ao lado do Reportar, por cima de qualquer página: um
//  botão de vidro com o número do que vence hoje, que abre um cartão nascendo
//  dele. Dentro, duas abas - Hoje (o que vence hoje e o que já passou do prazo)
//  e Semana (de segunda a domingo, com a faixa dos dias em cima).
//
//  É lista de relance, não tela de trabalho: marcar como feita grava na hora,
//  e clicar no título leva à ficha da tarefa.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { useAuth } from './AdminApp';
import { useToast } from '../lib/toast';
import { ContaAnimada } from '../components/ContaAnimada';
import { corDoProjeto } from '../components/DicaDoProjeto';
import { ICONE_PRIORIDADE, posicaoDaPrioridade } from '../lib/prioridades';
import {
  IconArrowRight, IconCheck, IconCheckCircle, IconChevronRight, IconDiario, IconX,
} from '../components/icons';
import { ETAPAS_PADRAO, indexar, type EtapaTarefa } from './FormularioTarefa';

/** Uma tarefa como o diário precisa dela - o que a lista mostra e o que a
 *  gravação de etapa leva junto. */
interface ItemDoDiario {
  id: number;
  titulo: string;
  projeto_id: string;
  projeto_nome: string;
  entrega_id: number | null;
  status: string;
  prioridade: string;
  /** O prazo como veio do servidor, que é como ele volta na gravação. */
  prazoBruto: string | null;
  /** Só o dia, `2026-11-16`. */
  prazo: string;
  concluida_em: string | null;
  responsaveis: string[];
  etiquetas: string[];
}

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const isoDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataDe = (iso: string) => new Date(`${iso}T12:00:00`);
const diasEntre = (de: string, ate: string) =>
  Math.round((dataDe(ate).getTime() - dataDe(de).getTime()) / 86400000);

/** Os sete dias da semana corrente, de segunda a domingo. */
function semanaDe(hoje: string): string[] {
  const d = dataDe(hoje);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return isoDe(x);
  });
}

/** "Hoje", "Amanhã" ou "quarta, 18 nov". */
function nomeDoDia(iso: string, hoje: string): string {
  const dif = diasEntre(hoje, iso);
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Amanhã';
  if (dif === -1) return 'Ontem';
  const d = dataDe(iso);
  return `${DIAS_LONGOS[d.getDay()]}, ${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`;
}

/** A ordem dentro de um grupo: a mais urgente primeiro, e o título desempata.
 *  Feita ou não, a tarefa fica onde estava - marcar não faz a lista pular. */
const porUrgencia = (a: ItemDoDiario, b: ItemDoDiario) =>
  posicaoDaPrioridade(a.prioridade) - posicaoDaPrioridade(b.prioridade)
  || a.titulo.localeCompare(b.titulo, 'pt-BR');

export function DiarioDoDia({ token, onAbrirTarefa, onVerTodas }: {
  token: string;
  onAbrirTarefa: (id: number) => void;
  onVerTodas: () => void;
}) {
  const { onSessionExpired, pode } = useAuth();
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<'hoje' | 'semana'>('hoje');
  const [dia, setDia] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemDoDiario[] | null>(null);
  const [etapas, setEtapas] = useState<EtapaTarefa[]>(ETAPAS_PADRAO);
  /** A etapa em que cada tarefa estava antes de ser marcada: desmarcar a
   *  devolve para lá, e não para o começo do quadro. */
  const etapaAntes = useRef(new Map<number, string>());
  const botao = useRef<HTMLButtonElement>(null);
  const cartao = useRef<HTMLDivElement>(null);
  const podeMarcar = pode('tarefas:editar');

  const [hoje, setHoje] = useState(() => isoDe(new Date()));
  const semana = useMemo(() => semanaDe(hoje), [hoje]);
  const et = useMemo(() => indexar(etapas), [etapas]);

  const api = useCallback(async (busca: string, corpo?: unknown) => {
    const r = await fetch(`/api/admin-data${busca ? `?${busca}` : ''}`, corpo
      ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-session': token }, body: JSON.stringify(corpo) }
      : { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  /** Duas leituras: o que está aberto com prazo até domingo (o atrasado vem
   *  junto) e tudo da semana, feito ou não. A primeira não traz o concluído de
   *  meses atrás; a segunda traz o que já foi riscado nos dias desta semana. */
  const carregar = useCallback(async () => {
    const agora = isoDe(new Date());
    setHoje(agora);
    const dias = semanaDe(agora);
    const ate = `${dias[6]}T23:59:59`;
    const [abertas, daSemana] = await Promise.all([
      api(`action=tarefas_filtradas&responsavel=eu&prazo_ate=${ate}&limite=200`),
      api(`action=tarefas_filtradas&responsavel=eu&prazo_de=${dias[0]}&prazo_ate=${ate}&incluir_concluidas=1&limite=200`),
    ]);
    if (!abertas || abertas.error) return;
    const unicas = new Map<number, ItemDoDiario>();
    for (const l of [...(abertas.tarefas ?? []), ...(daSemana?.tarefas ?? [])]) {
      if (unicas.has(Number(l.id)) || !l.prazo) continue;
      unicas.set(Number(l.id), {
        id: Number(l.id),
        titulo: String(l.titulo ?? ''),
        projeto_id: String(l.projeto_id),
        projeto_nome: String(l.projeto_nome ?? ''),
        entrega_id: l.entrega_id == null ? null : Number(l.entrega_id),
        status: String(l.status ?? ''),
        prioridade: String(l.prioridade ?? 'Média'),
        prazoBruto: String(l.prazo),
        prazo: String(l.prazo).slice(0, 10),
        concluida_em: l.concluida_em ? String(l.concluida_em) : null,
        responsaveis: (l.responsaveis ?? []).map((r: { id: string } | string) => (typeof r === 'string' ? r : r.id)),
        etiquetas: Array.isArray(l.etiquetas) ? l.etiquetas.map(String) : [],
      });
    }
    // O que acabou de ser marcado aqui e o servidor ainda não devolveu (a
    // atrasada riscada hoje, por exemplo, que nenhuma das duas leituras traz)
    // fica na lista até a próxima abertura.
    setItens(antes => {
      const novos = [...unicas.values()];
      if (!antes) return novos;
      const tocadas = antes.filter(t => etapaAntes.current.has(t.id) && !unicas.has(t.id));
      return [...novos, ...tocadas];
    });
  }, [api]);

  // Lê ao montar (o número do botão precisa dele), a cada abertura e quando a
  // aba volta a ficar à vista - o dia pode ter virado com o portal aberto.
  useEffect(() => {
    void carregar();
    void api('action=tarefa_status_configs').then(d => { if (d?.statuses?.length) setEtapas(d.statuses); });
    const aoVoltar = () => { if (document.visibilityState === 'visible') void carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar, api]);
  useEffect(() => { if (aberto) void carregar(); }, [aberto, carregar]);

  // Fecha com Esc e com clique fora - mas não ao rolar a página: o cartão é
  // fixo no canto, não descola de nada.
  useEffect(() => {
    if (!aberto) return;
    const dentro = (n: Node | null) => !!n && (cartao.current?.contains(n) || botao.current?.contains(n));
    const aoClicar = (e: MouseEvent) => { if (!dentro(e.target as Node)) setAberto(false); };
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', aoClicar);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicar);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const feita = useCallback((t: ItemDoDiario) => et.fecha(t.status), [et]);
  const conta = useCallback((t: ItemDoDiario) => !et.desconsidera(t.status), [et]);

  /** O que vence hoje, o que passou do prazo, e a semana dia a dia. */
  const visao = useMemo(() => {
    const lista = (itens ?? []).filter(conta);
    const riscadaHoje = (t: ItemDoDiario) => !!t.concluida_em && isoDe(new Date(t.concluida_em)) === hoje;
    // Atrasada é a que passou do prazo aberta - ou a que foi riscada hoje,
    // para não sumir debaixo do dedo de quem acabou de marcar.
    const atrasadas = lista
      .filter(t => t.prazo < hoje && (!feita(t) || riscadaHoje(t)))
      .sort((a, b) => a.prazo.localeCompare(b.prazo) || porUrgencia(a, b));
    const deHoje = lista.filter(t => t.prazo === hoje).sort(porUrgencia);
    // Os dias que já passaram mostram só o que foi feito neles; o que ficou
    // aberto, ou foi riscado agora, está no grupo das atrasadas.
    const jaNasAtrasadas = new Set(atrasadas.map(t => t.id));
    const porDia = semana.map(d => ({
      dia: d,
      tarefas: lista.filter(t => t.prazo === d && !jaNasAtrasadas.has(t.id)
        && (d >= hoje || feita(t))).sort(porUrgencia),
    }));
    const abertas = (l: ItemDoDiario[]) => l.filter(t => !feita(t)).length;
    return {
      atrasadas,
      deHoje,
      porDia,
      pendentesHoje: abertas(deHoje) + abertas(atrasadas),
      pendentesSemana: porDia.filter(g => g.dia >= hoje).reduce((n, g) => n + abertas(g.tarefas), 0)
        + abertas(atrasadas),
      atrasadasAbertas: abertas(atrasadas),
    };
  }, [itens, conta, feita, hoje, semana]);

  /** O progresso da aba: feitas sobre o total do que ela mostra. */
  const progresso = useMemo(() => {
    const doRecorte = aba === 'hoje'
      ? [...visao.deHoje, ...visao.atrasadas]
      : [...visao.atrasadas, ...visao.porDia.filter(g => !dia || g.dia === dia).flatMap(g => g.tarefas)];
    const unicas = [...new Map(doRecorte.map(t => [t.id, t])).values()];
    return { total: unicas.length, feitas: unicas.filter(feita).length };
  }, [aba, dia, visao, feita]);

  /** Marcar e desmarcar. Pinta na hora e grava por baixo; recusado, volta. */
  async function alternar(t: ItemDoDiario) {
    if (!podeMarcar) return;
    const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
    const fim = ordenadas.find(e => Number(e.is_conclusao) === 1);
    // Sem a etapa de antes (marcada em outra sessão), volta para a primeira
    // que conta: a de entrada costuma ser triagem, que sai da conta.
    const conta = (e: EtapaTarefa) => Number(e.is_conclusao) !== 1 && Number(e.is_excluded) !== 1;
    const entrada = ordenadas.find(e => Number(e.is_entrada) === 1 && conta(e)) ?? ordenadas.find(conta);
    if (!fim || !entrada) return;
    const fechando = !feita(t);
    const novo = fechando ? fim.nome : (etapaAntes.current.get(t.id) ?? entrada.nome);
    if (fechando) etapaAntes.current.set(t.id, t.status);
    const antes = itens;
    setItens(l => (l ?? []).map(x => (x.id === t.id
      ? { ...x, status: novo, concluida_em: fechando ? new Date().toISOString() : null } : x)));
    // Sem `descricao`: o servidor mantém a gravada. A lista traz só o começo
    // do texto, e mandá-lo cortaria a descrição da tarefa.
    const r = await api('', {
      action: 'salvar_tarefa', id: t.id, projeto_id: t.projeto_id, entrega_id: t.entrega_id,
      titulo: t.titulo, status: novo, prioridade: t.prioridade, responsaveis: t.responsaveis,
      prazo: t.prazoBruto, etiquetas: t.etiquetas,
    }).catch(() => null);
    if (!r || r.error) {
      setItens(antes);
      toast('error', fechando ? 'A tarefa não foi marcada' : 'A tarefa não foi reaberta',
        r?.error ?? 'O servidor não respondeu. Tente de novo.');
      return;
    }
    if (r.concluida_em !== undefined) {
      setItens(l => (l ?? []).map(x => (x.id === t.id ? { ...x, concluida_em: r.concluida_em ?? null } : x)));
    }
  }

  function abrirTarefa(id: number) {
    setAberto(false);
    onAbrirTarefa(id);
  }

  const carregando = itens === null;
  const diaHoje = dataDe(hoje);
  // A assinatura do que está na tela: muda a aba, o dia ou o conjunto de
  // tarefas, e a lista remonta tocando a entrada; riscar uma não muda nada.
  const assinatura = aba === 'hoje'
    ? `hoje-${[...visao.atrasadas, ...visao.deHoje].map(t => t.id).join('.')}`
    : `semana-${dia ?? 'toda'}-${visao.porDia.flatMap(g => g.tarefas.map(t => t.id)).join('.')}`;

  const item = (t: ItemDoDiario, i: number, atrasada = false) => (
    <ItemDiario key={t.id} t={t} i={i} feita={feita(t)} cor={et.cor(t.status)}
      atraso={atrasada ? diasEntre(t.prazo, hoje) : 0}
      podeMarcar={podeMarcar} onMarcar={() => void alternar(t)} onAbrir={() => abrirTarefa(t.id)} />
  );

  return (
    <>
      <button type="button" ref={botao} className={`diario-fab${aberto ? ' aberto' : ''}`}
        aria-expanded={aberto} aria-label={aberto ? 'Fechar o diário' : 'Abrir o diário'}
        title={aberto ? undefined : 'Seu diário: o que vence hoje e na semana'}
        onClick={() => {
          // Toda abertura começa em Hoje, sem dia filtrado: é a pergunta de
          // quem abre o diário. A troca é feita na abertura, e não no
          // fechamento, para o cartão não mudar de cara enquanto recolhe.
          if (!aberto) { setAba('hoje'); setDia(null); }
          setAberto(a => !a);
        }}>
        <span className="diario-fab-giro" key={aberto ? 'x' : 'diario'}>
          {aberto ? <IconX size={18} /> : <IconDiario size={19} />}
        </span>
        {/* O que pede atenção hoje, no próprio botão. Vermelho quando há
            atrasada no meio; some quando não há nada. */}
        <span className={`diario-fab-selo${visao.pendentesHoje > 0 && !aberto ? ' visivel' : ''}${visao.atrasadasAbertas > 0 ? ' ruim' : ''}`}
          aria-hidden="true">
          {visao.pendentesHoje > 99 ? '99+' : visao.pendentesHoje}
        </span>
      </button>

      <div ref={cartao} className={`diario-cartao${aberto ? ' aberto' : ''}`} aria-hidden={!aberto}
        role="dialog" aria-label="Seu diário">
        <div className="diario-cabeca">
          <div className="diario-cabeca-textos">
            <span className="diario-rotulo">Seu diário</span>
            <span className="diario-data">
              {DIAS_LONGOS[diaHoje.getDay()]}, {diaHoje.getDate()} {MESES_CURTOS[diaHoje.getMonth()]}
            </span>
          </div>
          <Anel feitas={progresso.feitas} total={progresso.total} />
        </div>

        <div className="diario-abas" role="tablist" aria-label="Período"
          style={{ '--aba': aba === 'hoje' ? 0 : 1 } as CSSProperties}>
          <span className="diario-abas-marca" aria-hidden="true" />
          {(['hoje', 'semana'] as const).map(a => (
            <button key={a} type="button" role="tab" aria-selected={aba === a}
              className={`diario-aba${aba === a ? ' ativa' : ''}`} tabIndex={aberto ? 0 : -1}
              onClick={() => { setAba(a); setDia(null); }}>
              {a === 'hoje' ? 'Hoje' : 'Semana'}
              <span className="diario-aba-conta">
                <ContaAnimada valor={a === 'hoje' ? visao.pendentesHoje : visao.pendentesSemana} />
              </span>
            </button>
          ))}
        </div>

        <div className="diario-corpo">
          {carregando ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : aba === 'hoje' ? (
            <div className="lista-anima diario-lista" key={assinatura}>
              {visao.atrasadas.length > 0 && (
                <GrupoAtrasadas tarefas={visao.atrasadas} abertas={visao.atrasadasAbertas}
                  render={(t, i) => item(t, i, true)} />
              )}
              {visao.deHoje.length > 0 ? (
                <>
                  <p className="diario-grupo-titulo">Para hoje</p>
                  <ul className="diario-itens">{visao.deHoje.map((t, i) => item(t, i))}</ul>
                </>
              ) : visao.atrasadas.length === 0 && (
                <div className="diario-vazio">
                  <span className="diario-vazio-ico"><IconCheckCircle size={22} /></span>
                  <p>Nada com prazo para hoje.</p>
                  <button type="button" className="diario-link" onClick={() => setAba('semana')}>
                    Ver a semana <IconArrowRight size={12} />
                  </button>
                </div>
              )}
              {/* A recompensa de quem riscou tudo o que vencia hoje. */}
              {visao.deHoje.length > 0 && visao.pendentesHoje === 0 && (
                <p className="diario-limpo surge">
                  <IconCheckCircle size={14} /> Dia limpo. Tudo o que vencia hoje está feito.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* A semana em sete casas: o número de cada dia em pontos -
                  cheio o que falta, vazado o que já foi. Clicar num dia mostra
                  só ele; clicar de novo volta à semana toda. */}
              <div className="diario-semana" role="group" aria-label="Dias da semana">
                {visao.porDia.map(g => {
                  const d = dataDe(g.dia);
                  const falta = g.tarefas.filter(t => !feita(t)).length;
                  const foi = g.tarefas.length - falta;
                  return (
                    <button key={g.dia} type="button" aria-pressed={dia === g.dia}
                      className={`diario-dia${g.dia === hoje ? ' hoje' : ''}${g.dia < hoje ? ' passou' : ''}${dia === g.dia ? ' escolhido' : ''}`}
                      tabIndex={aberto ? 0 : -1}
                      title={`${nomeDoDia(g.dia, hoje)}: ${falta} a fazer${foi ? `, ${foi} feita${foi === 1 ? '' : 's'}` : ''}`}
                      onClick={() => setDia(x => (x === g.dia ? null : g.dia))}>
                      <span className="diario-dia-nome">{DIAS_CURTOS[d.getDay()]}</span>
                      <span className="diario-dia-numero">{d.getDate()}</span>
                      <span className="diario-dia-pontos" aria-hidden="true">
                        {Array.from({ length: Math.min(4, g.tarefas.length) }, (_, k) => (
                          <span key={k} className={k < falta ? 'cheio' : ''} />
                        ))}
                        {g.tarefas.length > 4 && <em>+</em>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="lista-anima diario-lista" key={assinatura}>
                {!dia && visao.atrasadas.length > 0 && (
                  <GrupoAtrasadas tarefas={visao.atrasadas} abertas={visao.atrasadasAbertas}
                    render={(t, i) => item(t, i, true)} />
                )}
                {visao.porDia.filter(g => g.tarefas.length > 0 && (!dia || g.dia === dia)).map(g => (
                  <div key={g.dia} className="diario-grupo">
                    <p className="diario-grupo-titulo">
                      {nomeDoDia(g.dia, hoje)}
                      <span>{g.tarefas.filter(t => !feita(t)).length || ''}</span>
                    </p>
                    <ul className="diario-itens">{g.tarefas.map((t, i) => item(t, i))}</ul>
                  </div>
                ))}
                {visao.porDia.every(g => g.tarefas.length === 0 || (dia && g.dia !== dia))
                  && (dia || visao.atrasadas.length === 0) && (
                  <div className="diario-vazio">
                    <span className="diario-vazio-ico"><IconCheckCircle size={22} /></span>
                    <p>{dia ? `Nada com prazo ${dia === hoje ? 'para hoje' : `na ${DIAS_LONGOS[dataDe(dia).getDay()]}`}.` : 'Nada com prazo nesta semana.'}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="diario-rodape">
          <button type="button" className="diario-link" tabIndex={aberto ? 0 : -1}
            onClick={() => { setAberto(false); onVerTodas(); }}>
            Ver todas as tarefas <IconArrowRight size={12} />
          </button>
        </div>
      </div>
    </>
  );
}

/** O anel do progresso: o arco de feitas sobre o total, com o número no meio. */
function Anel({ feitas, total }: { feitas: number; total: number }) {
  const r = 17;
  const volta = 2 * Math.PI * r;
  const fracao = total ? feitas / total : 0;
  return (
    <div className={`diario-anel${total > 0 && feitas === total ? ' completo' : ''}`}
      title={total ? `${feitas} de ${total} feitas` : 'Nada para fazer'}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle className="diario-anel-trilho" cx="22" cy="22" r={r} />
        <circle className="diario-anel-arco" cx="22" cy="22" r={r}
          strokeDasharray={volta} strokeDashoffset={volta * (1 - fracao)} />
      </svg>
      <span className="diario-anel-texto">
        <ContaAnimada valor={feitas} /><em>/{total}</em>
      </span>
    </div>
  );
}

/** As atrasadas, num grupo que recolhe. Abre sozinho quando são poucas; com
 *  muitas, começa fechado para não empurrar o dia de hoje para baixo. */
function GrupoAtrasadas({ tarefas, abertas, render }: {
  tarefas: ItemDoDiario[];
  abertas: number;
  render: (t: ItemDoDiario, i: number) => ReactElement;
}) {
  const [escolha, setEscolha] = useState<boolean | null>(null);
  const aberto = escolha ?? tarefas.length <= 4;
  return (
    <div className="diario-grupo diario-atrasadas">
      <button type="button" className="diario-grupo-titulo diario-grupo-alternar"
        aria-expanded={aberto} onClick={() => setEscolha(!aberto)}>
        <span className={`entrega-seta${aberto ? ' aberta' : ''}`}><IconChevronRight size={12} /></span>
        Atrasadas
        <span className={abertas ? 'ruim' : ''}>{abertas || ''}</span>
      </button>
      <div className={`revelar${aberto ? ' aberto' : ''}`}>
        <div>
          <ul className="diario-itens">{tarefas.map(render)}</ul>
        </div>
      </div>
    </div>
  );
}

/** Uma linha do diário: a caixa de feito, o título com o projeto embaixo, e a
 *  urgência e o atraso à direita. A caixa e o título são dois botões: um marca,
 *  o outro abre a ficha. */
function ItemDiario({ t, i, feita, cor, atraso, podeMarcar, onMarcar, onAbrir }: {
  t: ItemDoDiario;
  i: number;
  feita: boolean;
  cor: string;
  atraso: number;
  podeMarcar: boolean;
  onMarcar: () => void;
  onAbrir: () => void;
}) {
  const Prioridade = ICONE_PRIORIDADE[t.prioridade];
  return (
    <li className={`diario-item cor-projeto-${corDoProjeto(t.projeto_id)}${feita ? ' feita' : ''}`}
      style={{ animationDelay: `${Math.min(i, 6) * 35}ms` }}>
      <button type="button" className="diario-marca" aria-pressed={feita} disabled={!podeMarcar}
        aria-label={feita ? `Reabrir: ${t.titulo}` : `Marcar como feita: ${t.titulo}`}
        title={podeMarcar ? (feita ? 'Reabrir' : 'Marcar como feita') : 'Sem permissão para mudar a tarefa'}
        onClick={onMarcar}>
        <IconCheck size={12} />
      </button>
      <button type="button" className="diario-abrir" onClick={onAbrir} title="Abrir a tarefa">
        <span className="diario-titulo"><span>{t.titulo}</span></span>
        <span className="diario-meta">
          <span className="diario-projeto-ponto" aria-hidden="true" />
          <span className="diario-projeto">{t.projeto_nome}</span>
          <span className="diario-etapa" title={`Etapa: ${t.status}`}>
            <span className="diario-etapa-ponto" style={{ background: cor }} aria-hidden="true" />
            {t.status}
          </span>
        </span>
      </button>
      <span className="diario-lado">
        {atraso > 0 && !feita && <span className="diario-atraso">{atraso}d</span>}
        {Prioridade && <span className="diario-prioridade" title={`Prioridade ${t.prioridade}`}><Prioridade size={13} /></span>}
      </span>
    </li>
  );
}
