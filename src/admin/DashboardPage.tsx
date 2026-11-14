// ─────────────────────────────────────────────────────────────────────────────
//  O painel da casa, no desenho da identidade de 11/2026.
//
//  Uma tela de relance, de cima para baixo: a faixa com a saudacao e o que a
//  semana pede de quem abriu; quatro numeros da casa; o comercial mes a mes ao
//  lado da semana de quem esta olhando; e os projetos em andamento, cada um com
//  a entrega da vez, o quanto andou e se esta no prazo.
//
//  Tudo aqui vem dos dados do portal - os projetos com as tarefas e as entregas,
//  as etapas das tarefas e o painel comercial. Nada e maquete.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { nomeCurto, useAuth } from './AdminApp';
import { FaixaDaPagina } from '../components/FaixaDaPagina';
import { ContaAnimada } from '../components/ContaAnimada';
import { IconAlert, IconPlus, IconTrendDown, IconTrendUp } from '../components/icons';
import { DicaComposicao, DicaTopo, useDicaRica } from '../components/DicaRica';
import { ConteudoDaDicaDoProjeto, corDoProjeto } from '../components/DicaDoProjeto';
import { COR_ENTREGA } from '../lib/etapasEntrega';
import { Skeleton } from '../components/Skeleton';
import { ETAPAS_PADRAO, indexar, type EtapaTarefa } from './FormularioTarefa';
import type { Projeto, Tarefa } from './ProjetosPage';

/** Um mes da serie comercial, como o servidor devolve - inclusive os vazios. */
interface MesFechado {
  /** `2026-09`. */
  mes: string;
  fechados: number;
  valor: number;
  /** Quem fechou no mes, do maior valor para o menor. */
  projetos?: { id: string; empresa: string; interesse: string | null; valor: number }[];
}
interface PainelComercial {
  serie: MesFechado[];
  emAberto: { quantas: number; valor: number };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-12-19` vira `19 dez`: o prazo de relance, sem o ano que todo mundo sabe. */
function diaCurto(iso: string | null): string {
  if (!iso) return '-';
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${Number(d)} ${MESES_CURTOS[Number(m) - 1] ?? m}`;
}

/** Hoje no formato do banco, no fuso de quem esta olhando. */
function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** O domingo que fecha a semana corrente, no mesmo formato. */
function fimDaSemanaIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dias de `de` ate `ate`, as duas no formato do banco. */
function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(ate.slice(0, 10)).getTime() - new Date(de.slice(0, 10)).getTime()) / 86400000);
}

function mesPorExtenso(mes: string): string {
  const d = new Date(`${mes}-01T12:00:00`);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function hojePorExtenso(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    .replace(/\./g, '').replace(/ de /g, ' ');
}

/** O que conta como entrega fechada: ja nao cobra prazo. */
const ENTREGA_FECHADA = ['Entregue', 'Validada', 'Cancelada'];

/** A situacao do projeto pelo prazo: passou e nao fechou e atraso; faltando
 *  duas semanas com menos de 70% andado e atencao; o resto esta no prazo. */
type Situacao = 'prazo' | 'atencao' | 'atrasado' | 'sem';
const ROTULO_SITUACAO: Record<Situacao, string> = {
  prazo: 'No prazo', atencao: 'Atenção', atrasado: 'Atrasado', sem: 'Sem prazo',
};
function situacaoDo(p: Projeto, hoje: string): Situacao {
  if (!p.previsao_entrega) return 'sem';
  const prazo = p.previsao_entrega.slice(0, 10);
  if (prazo < hoje) return 'atrasado';
  const dias = (new Date(prazo).getTime() - new Date(hoje).getTime()) / 86400000;
  return dias <= 14 && p.progresso < 70 ? 'atencao' : 'prazo';
}

const JANELAS = [6, 12] as const;

export default function DashboardPage({ token, onIr, onNovaTarefa }: {
  token: string;
  /** Leva a outra tela do portal: "Ver tarefas", a linha de um projeto. */
  onIr?: (pagina: 'tarefas' | 'projetos') => void;
  /** Abre a tela de Tarefas ja com uma tarefa nova na gaveta. */
  onNovaTarefa?: () => void;
}) {
  const { onSessionExpired, usuario } = useAuth();
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [etapas, setEtapas] = useState<EtapaTarefa[]>(ETAPAS_PADRAO);
  // Os numeros esperam as etapas: contados com as do padrao e recontados com as
  // da casa, eles subiriam ate um valor e desceriam para outro.
  const [etapasProntas, setEtapasProntas] = useState(false);
  const [comercial, setComercial] = useState<PainelComercial | null>(null);
  const [erro, setErro] = useState('');
  const [janela, setJanela] = useState<(typeof JANELAS)[number]>(12);

  const api = useCallback(async (busca: string) => {
    const r = await fetch(`/api/admin-data?${busca}`, { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  // As tres leituras saem juntas: nenhuma espera a outra, e cada bloco da tela
  // aparece quando a sua chega.
  useEffect(() => {
    let vivo = true;
    void api('action=projetos').then(d => {
      if (!vivo) return;
      if (!d || d.error) setErro(d?.error ?? 'Não foi possível carregar os projetos.');
      else setProjetos(d.projetos ?? []);
    });
    void api('action=tarefa_status_configs').then(d => {
      if (!vivo) return;
      if (d?.statuses?.length) setEtapas(d.statuses);
      setEtapasProntas(true);
    });
    void api('action=painel_comercial&meses=12').then(d => {
      if (vivo && d && !d.error) setComercial(d as PainelComercial);
    });
    return () => { vivo = false; };
  }, [api]);

  const et = useMemo(() => indexar(etapas), [etapas]);
  const hoje = hojeIso();
  const fimDaSemana = fimDaSemanaIso();

  /** Toda tarefa uma vez so: a que vale para dois projetos chega nos dois. */
  const tarefas = useMemo(() => {
    const unicas = new Map<number, Tarefa & { projetoNome: string }>();
    for (const p of projetos ?? []) {
      for (const t of p.tarefas ?? []) {
        if (!unicas.has(t.id)) unicas.set(t.id, { ...t, projetoNome: p.nome });
      }
    }
    return [...unicas.values()];
  }, [projetos]);

  const aberta = (t: Tarefa) => !et.fecha(t.status) && !et.desconsidera(t.status);
  const minha = (t: Tarefa) => !usuario || (t.responsaveis ?? []).includes(usuario.id);

  /** A semana de quem abriu: o que esta aberto com ele, o prazo mais perto
   *  primeiro - sem prazo vai para o fim. */
  const semana = useMemo(() => tarefas
    .filter(t => aberta(t) && minha(t))
    .sort((a, b) => String(a.prazo ?? '9999').localeCompare(String(b.prazo ?? '9999')) || a.id - b.id)
    .slice(0, 5), [tarefas, et, usuario]);

  const resumo = useMemo(() => {
    const ativos = (projetos ?? []).filter(p => p.status === 'Em andamento');
    const mes = hoje.slice(0, 7);
    const comecaram = ativos.filter(p => (p.data_inicio ?? '').slice(0, 7) === mes).length;
    const entregasAbertas = (projetos ?? []).flatMap(p => p.entregas ?? [])
      .filter(e => !ENTREGA_FECHADA.includes(e.status) && e.prazo);
    const atrasadas = entregasAbertas.filter(e => String(e.prazo).slice(0, 10) < hoje).length;
    const abertas = tarefas.filter(aberta);
    const tarefasAtrasadas = abertas.filter(t => t.prazo && t.prazo.slice(0, 10) < hoje).length;
    const daSemana = (prazo: string | null) => !!prazo && prazo.slice(0, 10) >= hoje && prazo.slice(0, 10) <= fimDaSemana;
    return {
      ativos: ativos.length,
      comecaram,
      noPrazo: entregasAbertas.length
        ? Math.round(((entregasAbertas.length - atrasadas) / entregasAbertas.length) * 100) : null,
      entregasAbertas: entregasAbertas.length,
      entregasAtrasadas: atrasadas,
      tarefasAbertas: abertas.length,
      tarefasAtrasadas,
      tarefasDaSemana: abertas.filter(t => minha(t) && daSemana(t.prazo)).length,
      entregasDaSemana: (projetos ?? []).flatMap(p => p.entregas ?? [])
        .filter(e => !ENTREGA_FECHADA.includes(e.status) && daSemana(e.prazo)
          && (!usuario || (e.responsaveis ?? []).includes(usuario.id))).length,
    };
  }, [projetos, tarefas, et, usuario, hoje, fimDaSemana]);

  const emAndamento = useMemo(() => (projetos ?? [])
    .filter(p => p.status === 'Em andamento')
    .sort((a, b) => String(a.previsao_entrega ?? '9999').localeCompare(String(b.previsao_entrega ?? '9999'))),
  [projetos]);

  /** O que esta por tras de cada numero: e o que as dicas abrem. */
  const detalhe = useMemo(() => {
    const lista = projetos ?? [];
    const ativos = lista.filter(p => p.status === 'Em andamento')
      .sort((a, b) => b.progresso - a.progresso);
    const contaStatus = (st: string) => lista.filter(p => p.status === st).length;
    const entregas = lista.flatMap(p => (p.entregas ?? []).map(e => ({ ...e, projetoNome: p.nome })))
      .filter(e => !ENTREGA_FECHADA.includes(e.status) && e.prazo);
    const atrasadas = entregas.filter(e => String(e.prazo).slice(0, 10) < hoje)
      .map(e => ({ ...e, dias: diasEntre(String(e.prazo), hoje) }))
      .sort((a, b) => b.dias - a.dias);
    const proximas = entregas.filter(e => String(e.prazo).slice(0, 10) >= hoje)
      .map(e => ({ ...e, dias: diasEntre(hoje, String(e.prazo)) }))
      .sort((a, b) => a.dias - b.dias);
    const abertas = tarefas.filter(aberta);
    const porEtapa = [...etapas].sort((a, b) => a.ordem - b.ordem)
      .map(e => ({ rotulo: e.nome, valor: abertas.filter(t => t.status === e.nome).length, cor: e.cor }))
      .filter(f => f.valor > 0);
    return {
      ativos,
      andamento: contaStatus('Em andamento'),
      pausados: contaStatus('Pausado'),
      concluidos: contaStatus('Concluído'),
      atrasadas,
      proximas,
      porEtapa,
      semDono: abertas.filter(t => !(t.responsaveis ?? []).length).length,
      paraHoje: abertas.filter(t => t.prazo && t.prazo.slice(0, 10) === hoje).length,
    };
  }, [projetos, tarefas, etapas, et, hoje]);

  const carregando = (projetos === null || !etapasProntas) && !erro;
  const primeiroNome = usuario?.nome.trim().split(/\s+/)[0];

  return (
    <div className="admin-content-wrap pagina-cristal pagina-painel">
      <FaixaDaPagina
        secao="Painel da casa"
        titulo={primeiroNome ? `${saudacao()}, ${primeiroNome}` : saudacao()}
        itens={[
          { rotulo: 'Hoje', valor: hojePorExtenso() },
          ...(carregando ? [] : [{
            rotulo: 'Nesta semana',
            valor: `${resumo.tarefasDaSemana} ${resumo.tarefasDaSemana === 1 ? 'tarefa' : 'tarefas'} | ${resumo.entregasDaSemana} ${resumo.entregasDaSemana === 1 ? 'entrega' : 'entregas'}`,
            dica: 'Tarefas e entregas suas com prazo até domingo',
          }]),
        ]}
        acoes={onNovaTarefa && (
          <button type="button" className="btn btn-primary" onClick={onNovaTarefa}>
            <IconPlus size={15} />
            Nova tarefa
          </button>
        )}
      />

      {erro && <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>}

      {/* Os quatro numeros da casa. */}
      <div className="painel-numeros">
        {carregando ? (
          [0, 1, 2, 3].map(i => <Skeleton key={i} h={108} radius="var(--radius-lg)" />)
        ) : (
          <>
            <Numero rotulo="Projetos ativos" valor={resumo.ativos}
              delta={resumo.comecaram ? `+${resumo.comecaram}` : undefined} bom
              detalhe={resumo.comecaram === 1 ? '1 começou neste mês' : `${resumo.comecaram} começaram neste mês`}
              dica={() => (
                <>
                  <DicaTopo rotulo="Carteira de projetos" valor={`${detalhe.andamento} em andamento`} />
                  <DicaComposicao fatias={[
                    { rotulo: 'Em andamento', valor: detalhe.andamento, cor: 'var(--yellow)' },
                    { rotulo: 'Pausados', valor: detalhe.pausados, cor: 'var(--gray2)' },
                    { rotulo: 'Concluídos', valor: detalhe.concluidos, cor: 'var(--green)' },
                  ]} />
                  <p className="dica-secao">Mais adiantados</p>
                  <ul className="dica-lista">
                    {detalhe.ativos.slice(0, 5).map((p, i) => (
                      <li key={p.id} style={{ animationDelay: `${120 + i * 40}ms` }}>
                        <span className="dica-lista-nome">{p.nome}</span>
                        <span className="dica-mini-barra">
                          <span style={{ width: `${Math.min(100, p.progresso)}%`, animationDelay: `${180 + i * 40}ms` }} />
                        </span>
                        <strong>{Math.round(p.progresso)}%</strong>
                      </li>
                    ))}
                  </ul>
                  {detalhe.ativos.length > 5 && <p className="dica-rodape">e mais {detalhe.ativos.length - 5}</p>}
                </>
              )} />
            <Numero rotulo="Entregas no prazo" valor={resumo.noPrazo == null ? '-' : `${resumo.noPrazo}%`}
              delta={resumo.entregasAtrasadas ? `${resumo.entregasAtrasadas} atrasada${resumo.entregasAtrasadas === 1 ? '' : 's'}` : undefined}
              detalhe={`das ${resumo.entregasAbertas} entregas abertas com prazo`}
              dica={() => (
                <>
                  <DicaTopo rotulo="Entregas abertas com prazo" valor={resumo.entregasAbertas}
                    nota={resumo.noPrazo == null ? undefined : `${resumo.noPrazo}% no prazo`} />
                  <DicaComposicao fatias={[
                    { rotulo: 'No prazo', valor: resumo.entregasAbertas - resumo.entregasAtrasadas, cor: 'var(--green)' },
                    { rotulo: 'Atrasadas', valor: resumo.entregasAtrasadas, cor: 'var(--red)' },
                  ]} />
                  {detalhe.atrasadas.length > 0 && (
                    <>
                      <p className="dica-secao">Mais atrasadas</p>
                      <ul className="dica-lista">
                        {detalhe.atrasadas.slice(0, 4).map((e, i) => (
                          <li key={e.id} style={{ animationDelay: `${120 + i * 40}ms` }}>
                            <span className="dica-lista-nome">{e.titulo}<em>{e.projetoNome}</em></span>
                            <strong className="ruim">{e.dias}d</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {detalhe.proximas.length > 0 && (
                    <>
                      <p className="dica-secao">Vencem em seguida</p>
                      <ul className="dica-lista">
                        {detalhe.proximas.slice(0, 3).map((e, i) => (
                          <li key={e.id} style={{ animationDelay: `${200 + i * 40}ms` }}>
                            <span className="dica-lista-nome">{e.titulo}<em>{e.projetoNome}</em></span>
                            <strong>{e.dias === 0 ? 'hoje' : `em ${e.dias}d`}</strong>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )} />
            <Numero rotulo="Tarefas abertas" valor={resumo.tarefasAbertas}
              delta={resumo.tarefasAtrasadas ? `${resumo.tarefasAtrasadas} atrasada${resumo.tarefasAtrasadas === 1 ? '' : 's'}` : undefined}
              detalhe="em todos os projetos"
              dica={() => (
                <>
                  <DicaTopo rotulo="Tarefas na mesa" valor={resumo.tarefasAbertas} nota="por etapa" />
                  <DicaComposicao fatias={detalhe.porEtapa} />
                  <div className="dica-pilulas">
                    <span className={resumo.tarefasAtrasadas ? 'ruim' : ''}><strong>{resumo.tarefasAtrasadas}</strong> atrasadas</span>
                    <span><strong>{detalhe.paraHoje}</strong> vencem hoje</span>
                    <span><strong>{detalhe.semDono}</strong> sem responsável</span>
                  </div>
                </>
              )} />
            <Numero rotulo="Funil em aberto"
              valor={comercial ? comercial.emAberto.valor.toLocaleString('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 }) : '-'}
              detalhe={comercial ? `${comercial.emAberto.quantas} oportunidade${comercial.emAberto.quantas === 1 ? '' : 's'} sem desfecho` : 'carregando o comercial'}
              dica={comercial ? () => {
                const ultimos = comercial.serie.slice(-6);
                const maior = Math.max(1, ...ultimos.map(m => m.fechados));
                const fechados = comercial.serie.reduce((t, m) => t + m.fechados, 0);
                const fechadoValor = comercial.serie.reduce((t, m) => t + m.valor, 0);
                return (
                  <>
                    <DicaTopo rotulo="Funil em aberto" valor={dinheiro(comercial.emAberto.valor)}
                      nota={`${comercial.emAberto.quantas} oportunidades`} />
                    <div className="dica-linhas">
                      <span>Ticket médio em aberto</span>
                      <strong>{comercial.emAberto.quantas ? dinheiro(comercial.emAberto.valor / comercial.emAberto.quantas) : '-'}</strong>
                      <span>Fechados em 12 meses</span>
                      <strong>{fechados} | {dinheiro(fechadoValor)}</strong>
                    </div>
                    <p className="dica-secao">Fechamentos nos últimos 6 meses</p>
                    <div className="dica-barrinhas">
                      {ultimos.map((m, i) => (
                        <span key={m.mes} className="dica-barrinha">
                          <span style={{ height: `${Math.max(6, (m.fechados / maior) * 100)}%`, animationDelay: `${120 + i * 45}ms` }} />
                          <em>{MESES_CURTOS[Number(m.mes.slice(5, 7)) - 1]}</em>
                        </span>
                      ))}
                    </div>
                  </>
                );
              } : undefined} />
          </>
        )}
      </div>

      <div className="painel-meio">
        {/* O comercial mes a mes: o mes corrente aceso, os anteriores em limao
            lavado, e o numero de cada barra aparece com o ponteiro nela. */}
        <section className="painel-cartao">
          <div className="painel-cartao-topo">
            <h2 className="painel-cartao-titulo">Negócios fechados por mês</h2>
            <div className="painel-janelas" role="tablist" aria-label="Período">
              {JANELAS.map(j => (
                <button key={j} type="button" role="tab" aria-selected={janela === j}
                  className={`painel-janela${janela === j ? ' ativa' : ''}`} onClick={() => setJanela(j)}>
                  {j} meses
                </button>
              ))}
            </div>
          </div>
          {comercial ? (
            <BarrasDoMes key={janela} serie={comercial.serie.slice(-janela)} />
          ) : (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          )}
        </section>

        <section className="painel-cartao painel-semana">
          <div className="painel-cartao-topo">
            <h2 className="painel-cartao-titulo">Minha semana</h2>
            {onIr && (
              <button type="button" className="painel-link" onClick={() => onIr('tarefas')}>Ver tarefas</button>
            )}
          </div>
          {carregando ? (
            <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
          ) : semana.length === 0 ? (
            <p className="painel-vazio">Nada aberto com você. Semana livre.</p>
          ) : (
            <div className="lista-anima" key={semana.map(t => t.id).join(',')}>
              {semana.map(t => (
                <button key={t.id} type="button" className="semana-linha" onClick={() => onIr?.('tarefas')}>
                  <span className="semana-icone" style={{ ['--cor' as string]: et.cor(t.status) }} />
                  <span className="semana-texto">
                    <span className="semana-titulo">{t.titulo}</span>
                    <span className="semana-sub">#{t.id} | {t.projetoNome}{t.prazo ? ` | ${diaCurto(t.prazo)}` : ''}</span>
                  </span>
                  <span className="semana-status" style={{ ['--cor' as string]: et.cor(t.status) }}>{t.status}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Os projetos em andamento: a entrega da vez, o quanto andou e o prazo. */}
      <section className="painel-cartao painel-projetos">
        <div className="painel-projetos-cabeca" aria-hidden="true">
          <span>Projeto</span><span>Entrega atual</span><span>Progresso</span><span>Prazo</span><span>Situação</span>
        </div>
        {carregando ? (
          <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
        ) : emAndamento.length === 0 ? (
          <p className="painel-vazio">Nenhum projeto em andamento.</p>
        ) : (
          <div className="painel-projetos-corpo lista-anima">
            {emAndamento.map((p, i) => (
              <LinhaDoProjeto key={p.id} p={p} i={i} hoje={hoje} fecha={et.fecha}
                onAbrir={() => onIr?.('projetos')} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Um numero da casa: rotulo, o valor grande, a variacao colada e a linha de
 *  apoio embaixo. A variacao e verde quando e boa noticia e vermelha quando
 *  cobra alguma coisa. */
function Numero({ rotulo, valor, delta, bom, detalhe, dica }: {
  rotulo: string;
  valor: string | number;
  delta?: string;
  bom?: boolean;
  detalhe: string;
  /** O que o numero resume, aberto ao passar o mouse. */
  dica?: () => ReactNode;
}) {
  const { gatilho, dica: cartao, aberta } = useDicaRica<HTMLDivElement>(dica ?? (() => null), { largura: 300 });
  return (
    <div className={`painel-numero${dica ? ' com-dica' : ''}${aberta ? ' dica-aberta' : ''}`} data-luz
      tabIndex={dica ? 0 : undefined} {...(dica ? gatilho : {})}>
      {cartao}
      <span className="painel-numero-rotulo">{rotulo}</span>
      <span className="painel-numero-linha">
        <span className="painel-numero-valor"><ContaAnimada valor={valor} /></span>
        {delta && <span className={`painel-numero-delta${bom ? ' bom' : ''}`}>{delta}</span>}
      </span>
      <span className="painel-numero-detalhe">{detalhe}</span>
    </div>
  );
}

/** As barras do comercial: a altura e a contagem de negocios fechados no mes,
 *  relativa ao maior mes da janela. O mes corrente e o aceso e mostra o numero;
 *  os outros mostram o seu com o ponteiro em cima. */
function BarrasDoMes({ serie }: { serie: MesFechado[] }) {
  const maior = Math.max(1, ...serie.map(m => m.fechados));
  const vazio = serie.every(m => m.fechados === 0);
  const total = serie.reduce((t, m) => t + m.fechados, 0);
  // A barra sob o ponteiro. A dica e uma so, e desliza de uma barra para a
  // outra em vez de sumir e reaparecer: o olho segue o mes.
  const [foco, setFoco] = useState<number | null>(null);
  const m = foco != null ? serie[foco] : null;
  const anterior = foco != null && foco > 0 ? serie[foco - 1] : null;
  const variacao = m && anterior && anterior.fechados > 0
    ? Math.round(((m.fechados - anterior.fechados) / anterior.fechados) * 100) : null;
  return (
    <div className={`barras-mes${vazio ? ' vazio' : ''}${foco != null ? ' focando' : ''}`}
      onMouseLeave={() => setFoco(null)}>
      {vazio && foco == null && <p className="barras-mes-aviso surge">Nenhum negócio fechado no período.</p>}
      {m && (
        <div className="barras-dica" style={{ ['--x' as string]: `${((foco! + 0.5) / serie.length) * 100}%` }}>
          <div className="barras-dica-conteudo troca" key={m.mes}>
            <span className="dica-rotulo">{mesPorExtenso(m.mes)}</span>
            <span className="barras-dica-valor">
              {m.fechados} {m.fechados === 1 ? 'negócio' : 'negócios'}
              {variacao != null && variacao !== 0 && (
                <span className={`barras-dica-variacao ${variacao > 0 ? 'bom' : 'ruim'}`}>
                  {variacao > 0 ? <IconTrendUp size={12} /> : <IconTrendDown size={12} />}
                  {variacao > 0 ? '+' : ''}{variacao}%
                </span>
              )}
            </span>
            <span className="barras-dica-sub">
              {dinheiro(m.valor)}
              {total > 0 && ` | ${Math.round((m.fechados / total) * 100)}% do período`}
            </span>
            {(m.projetos ?? []).length > 0 ? (
              <ul className="dica-lista">
                {(m.projetos ?? []).slice(0, 3).map((pj, i) => (
                  <li key={pj.id} style={{ animationDelay: `${60 + i * 40}ms` }}>
                    <span className="dica-lista-nome">{pj.empresa}{pj.interesse && <em>{pj.interesse}</em>}</span>
                    <strong>{dinheiro(pj.valor)}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="barras-dica-sub">Nenhum fechamento neste mês.</span>
            )}
          </div>
        </div>
      )}
      <div className="barras-mes-area">
        {serie.map((mes, i) => {
          const atual = i === serie.length - 1;
          return (
            <div key={mes.mes} className={`barras-mes-col${atual ? ' atual' : ''}${foco === i ? ' foco' : ''}`}
              onMouseEnter={() => setFoco(i)}>
              <span className="barras-mes-numero"><ContaAnimada valor={mes.fechados} /></span>
              <span className="barras-mes-barra"
                style={{ height: `${Math.max(3, (mes.fechados / maior) * 100)}%`, animationDelay: `${i * 35}ms` }} />
            </div>
          );
        })}
      </div>
      <div className="barras-mes-eixo">
        {serie.map((mes, i) => (
          <span key={mes.mes} className={foco === i ? 'foco' : undefined}>{MESES_CURTOS[Number(mes.mes.slice(5, 7)) - 1]}</span>
        ))}
      </div>
    </div>
  );
}

/** Uma linha da tabela de projetos, com a dica que abre as entregas dele: em
 *  que etapa cada uma esta, o quanto andou, e quanto falta para o prazo. A dica
 *  acompanha o ponteiro ao longo da linha. */
function LinhaDoProjeto({ p, i, hoje, fecha, onAbrir }: {
  p: Projeto;
  i: number;
  hoje: string;
  fecha: (status: string) => boolean;
  onAbrir: () => void;
}) {
  const entregas = [...(p.entregas ?? [])].sort((a, b) => a.ordem - b.ordem);
  const atual = entregas.find(e => !ENTREGA_FECHADA.includes(e.status));
  const sit = situacaoDo(p, hoje);
  const tarefas = p.tarefas ?? [];
  const feitas = tarefas.filter(t => fecha(t.status)).length;
  const { gatilho, dica, aberta } = useDicaRica<HTMLButtonElement>(
    () => <ConteudoDaDicaDoProjeto p={p} fecha={fecha} />, { largura: 320, seguir: true });

  return (
    <button type="button" className={`projeto-linha cor-projeto-${corDoProjeto(p.id)}${aberta ? ' dica-aberta' : ''}`}
      onClick={onAbrir} {...gatilho}>
      {dica}
      <span className="projeto-nome">
        <span className="projeto-sigla">{p.nome.trim().charAt(0).toUpperCase()}</span>
        <span className="projeto-textos">
          <span className="projeto-titulo">{p.nome}</span>
          <span className="projeto-cliente">{p.cliente_nome ?? 'Sem cliente'}</span>
        </span>
      </span>
      <span className="projeto-entrega">{atual?.titulo ?? '-'}</span>
      <span className="projeto-progresso">
        <span className="projeto-trilho">
          <span className="projeto-barra"
            style={{ width: `${Math.min(100, Math.max(0, p.progresso))}%`, animationDelay: `${120 + i * 70}ms` }} />
        </span>
        <span className="projeto-pct"><ContaAnimada valor={`${Math.round(p.progresso)}%`} /></span>
      </span>
      <span className="projeto-prazo">{diaCurto(p.previsao_entrega)}</span>
      <span><span className={`chip-situacao ${sit}`}>{ROTULO_SITUACAO[sit]}</span></span>
    </button>
  );
}
