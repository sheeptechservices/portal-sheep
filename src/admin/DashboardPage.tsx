// ─────────────────────────────────────────────────────────────────────────────
//  O painel da casa.
//
//  Começa pelo comercial, que é a pergunta que se faz toda segunda-feira: o
//  quanto está fechando, e se está fechando mais ou menos do que vinha
//  fechando. O funil responde isso card a card; aqui ele responde de uma vez.
//
//  A página é um empilhado de painéis, e não uma grade de números soltos: cada
//  painel tem um assunto e se explica sozinho. O comercial é o primeiro; os
//  próximos entram embaixo, na mesma moldura.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from './AdminApp';
import { IconAlert, IconMedalha, IconTrendDown, IconTrendUp } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { SegSwitch } from '../components/SegSwitch';
import { CartaoKpi } from '../components/CartaoKpi';
import { Donut } from '../components/Donut';
import { COR_ENTREGA } from '../lib/etapasEntrega';

/** Um projeto fechado no mês, para o detalhe que o clique na coluna abre. */
interface ProjetoFechado {
  id: string;
  empresa: string;
  interesse: string | null;
  valor: number;
}

/** Um mês da série, como o servidor devolve - inclusive os vazios. */
interface MesFechado {
  /** `2026-09`. */
  mes: string;
  fechados: number;
  valor: number;
  /** Quem fechou no mês, do maior valor para o menor. */
  projetos?: ProjetoFechado[];
}

interface PainelComercial {
  serie: MesFechado[];
  emAberto: { quantas: number; valor: number };
}

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** `2026-09` vira `set`, e `set/26` quando o ano vira - é o único ponto em que
 *  o ano precisa aparecer, e escrevê-lo em todo rótulo encheria o eixo. */
function rotuloDoMes(mes: string, mostrarAno: boolean): string {
  const [ano, m] = mes.split('-');
  const nome = MESES_CURTOS[Number(m) - 1] ?? m;
  return mostrarAno ? `${nome}/${ano.slice(2)}` : nome;
}

function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split('-');
  const nome = MESES_CURTOS[Number(m) - 1] ?? m;
  return `${nome} de ${ano}`;
}

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** O mesmo dinheiro, curto, para caber em cima de uma barra: `R$ 187.500` nao
 *  cabe numa coluna de 58px, e menos ainda numa janela longa. */
const dinheiroCurto = (v: number) =>
  v.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** O que a altura da barra mede. */
const METRICAS = [
  { valor: 'quantidade', label: 'Projetos' },
  { valor: 'faturamento', label: 'Faturamento' },
] as const;
type Metrica = (typeof METRICAS)[number]['valor'];

/** Quantos meses vao de janeiro de 2023 ate o mes corrente. O historico da casa
 *  comeca ali, e e ate onde o filtro deixa voltar. */
function mesesDesde2023(): number {
  const hoje = new Date();
  return (hoje.getFullYear() - 2023) * 12 + hoje.getMonth() + 1;
}

/** As janelas do filtro. A ultima nao e um numero fixo: ela cresce sozinha a
 *  cada mes que passa, senao viraria "desde 2023" mentindo em janeiro. */
const JANELAS = [
  { valor: '6', label: '6 meses' },
  { valor: '12', label: '12 meses' },
  { valor: '24', label: '24 meses' },
  { valor: 'tudo', label: 'Desde 2023' },
] as const;
type Janela = (typeof JANELAS)[number]['valor'];
const mesesDaJanela = (j: Janela) => (j === 'tudo' ? mesesDesde2023() : Number(j));

export default function DashboardPage({ token }: { token: string }) {
  const { onSessionExpired } = useAuth();
  const [dados, setDados] = useState<PainelComercial | null>(null);
  const [erro, setErro] = useState('');
  /** A janela do painel. Trocar nao volta ao esqueleto: o grafico anterior fica
   *  na tela ate o novo chegar, senao a pagina pisca a cada troca de filtro. */
  const [janela, setJanela] = useState<Janela>('12');
  const meses = mesesDaJanela(janela);
  /** Contar projetos e somar dinheiro sao duas leituras do mesmo periodo: um mes
   *  de seis contratos pequenos e um de dois grandes trocam de lugar conforme a
   *  pergunta. A troca e so de leitura - nao vai ao servidor, que ja manda os
   *  dois numeros. */
  const [metrica, setMetrica] = useState<Metrica>('quantidade');

  const api = useCallback(async (busca: string) => {
    const r = await fetch(`/api/admin-data?${busca}`, { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  useEffect(() => {
    let vivo = true;
    api(`action=painel_comercial&meses=${mesesDesde2023()}`)
      .then(d => {
        if (!vivo) return;
        if (!d || d.error) setErro(d?.error ?? 'Não foi possível carregar o painel.');
        else setDados(d as PainelComercial);
      })
      .catch(() => { if (vivo) setErro('Erro de conexão. Tente de novo.'); });
    return () => { vivo = false; };
  }, [api]);

  /**
   * A janela é recorte, e não outra busca.
   *
   * Todas as janelas são o fim da mesma série, então o painel pede uma vez a
   * maior delas e corta o resto aqui. Antes cada clique no filtro ia ao
   * servidor, e o gráfico só trocava quando a resposta voltava - a troca ficava
   * com a cara de lenta que não era do desenho, era da espera.
   */
  const desenhada = useMemo(
    () => (dados ? dados.serie.slice(-meses) : []),
    [dados, meses],
  );
  const apoio = `${metrica === 'faturamento' ? 'Faturamento fechado' : 'Oportunidades fechadas'}`
    + (janela === 'tudo'
      ? ' desde janeiro de 2023'
      : ` nos últimos ${meses} meses`);

  return (
    // A moldura de toda página do painel: é dela que vem a folga das bordas e o
    // vão entre os blocos. Sem ela a página encostava na barra lateral.
    <div className="admin-content-wrap pagina-cristal pagina-painel">
      {/* Os indicadores moram no cabeçalho, à direita do título: é a leitura
          de relance da página, e ela não deve custar uma rolagem. */}
      <div className="admin-page-header painel-cabecalho">
        <div>
          <h1 className="admin-page-title">Dashboard</h1>
          <p className="admin-page-desc">
            Os números da casa, por assunto. O que está marcado como exemplo é
            maquete: o desenho do painel antes dos dados.
          </p>
        </div>
        <div className="admin-stats painel-kpis">
          {EXEMPLO.kpis.map((k, i) => (
            <CartaoKpi key={k.rotulo} rotulo={k.rotulo} valor={k.valor} nota={k.nota}
              cor={k.cor} atraso={i * 0.05} />
          ))}
        </div>
      </div>

      <section className="painel">
        <div className="painel-topo">
          <div>
            <p className="painel-titulo">Comercial</p>
            {/* A frase descreve o que está desenhado, e não o que foi pedido: a
                janela nova só vale quando os dados dela chegam, e trocá-la antes
                deixaria a legenda mentindo por um instante. O `.troca` é o
                padrão da casa para a mesma área mudando de conteúdo - só
                opacidade, porque a peça não nasce nem some, muda de cara. */}
            <p className="painel-apoio troca" key={apoio}>{apoio}</p>
          </div>
          {/* Os dois filtros ficam no painel, e não na página: cada painel
              responde a uma pergunta, e o que se mede e em que período são parte
              da pergunta deste. */}
          <div className="painel-filtros">
            <SegSwitch pequeno valor={metrica} onChange={setMetrica}
              opcoes={METRICAS.map(m => ({ valor: m.valor, label: m.label }))} />
            <SegSwitch pequeno valor={janela} onChange={setJanela}
              opcoes={JANELAS.map(j => ({ valor: j.valor, label: j.label }))} />
          </div>
          {dados && (
            // O que está aberto agora não cabe na série - não tem mês -, mas é
            // o contexto dela: fechar pouco com o funil cheio é outra história
            // de fechar pouco com o funil vazio.
            <p className="painel-contexto">
              <strong>{dados.emAberto.quantas}</strong> em aberto
              {dados.emAberto.valor > 0 && <> · {dinheiro(dados.emAberto.valor)}</>}
            </p>
          )}
        </div>

        {erro ? (
          <p className="ff-vazio ff-erro"><IconAlert size={13} /> {erro}</p>
        ) : !dados ? (
          <Skeleton h={208} radius="var(--radius-md)" />
        ) : (
          // A `key` refaz o gráfico quando a leitura muda - outra métrica, outro
          // período -, e é ela que faz a entrada tocar de novo. Muda no instante
          // em que os dados novos chegam, não no clique: assim o desenho antigo
          // fica na tela até ter o que o substitua.
          <GraficoFechados key={`${metrica}-${desenhada.length}`}
            serie={desenhada} metrica={metrica} />
        )}
      </section>

      <MaqueteDoPainel />
    </div>
  );
}

/**
 * A variação mês a mês, em área.
 *
 * Área, e não barras: o que se lê aqui é o movimento da série - se está subindo
 * ou caindo -, e a linha contínua com o preenchimento embaixo mostra isso de
 * relance. Cada mês continua tendo seu ponto e seu número, então a leitura
 * pontual não se perdeu.
 *
 * Reta, e não suavizada: a curva inventava valores entre dois meses, e num
 * painel de contagem não existe meio de mês. O segmento reto liga o que foi
 * medido ao que foi medido, e o joelho em cima do ponto é a própria virada.
 *
 * O traçado é um desenho só, atravessado por cima das colunas, e não uma fatia
 * por mês. Foi por fatias durante um tempo, e a emenda entre elas nunca fechou:
 * encostadas, as duas bordas antisserrilhadas não somavam um pixel cheio e
 * deixavam um fio claro; sobrepostas, as duas tintas translúcidas somavam alfa
 * e deixavam um fio escuro. Não existe ajuste de meio-termo aí - a única emenda
 * que não aparece é a que não existe.
 *
 * Nada disso depende de medir a largura do painel em JavaScript: o `viewBox` de
 * 0 a 100 se estica sozinho, e o mês `i` fica no centro da coluna `i` por
 * construção - que é onde o ponto dele está.
 */
function GraficoFechados({ serie, metrica }: { serie: MesFechado[]; metrica: Metrica }) {
  const total = serie.reduce((s, m) => s + m.fechados, 0);
  const totalValor = serie.reduce((s, m) => s + m.valor, 0);
  /** O que a barra mede, mes a mes. Trocar a metrica troca a altura, o numero em
   *  cima dela e o podio - tudo o mais continua igual. */
  const medida = (m: MesFechado) => (metrica === 'faturamento' ? m.valor : m.fechados);
  /** O teto do eixo. Nunca zero, senão a divisão que dá a altura da barra
   *  explode num painel sem nenhum fechamento. */
  const teto = Math.max(1, ...serie.map(medida));

  // O ano só aparece no rótulo quando a série atravessa a virada: doze meses
  // dentro do mesmo ano não precisam repeti-lo doze vezes.
  const anos = useMemo(() => new Set(serie.map(m => m.mes.slice(0, 4))), [serie]);
  const mostrarAno = anos.size > 1;

  /**
   * O pódio do período: ouro, prata e bronze para os três melhores meses. Mês que
   * não pontuou fica fora - medalha de zero seria troféu de participação -, e
   * por isso um período magro pode premiar dois ou um só. No empate decide a
   * outra métrica, e depois o mês mais antigo, que chegou lá primeiro.
   */
  /**
   * O pódio muda com a métrica, e é isso que o torna útil: o mês que mais fechou
   * contratos raramente é o que mais faturou, e a medalha responde à pergunta
   * que está na tela. Mês que não pontuou na métrica escolhida fica fora - um mês
   * com três contratos sem valor lançado não é campeão de faturamento.
   */
  const medalhas = useMemo(() => {
    const podio = new Map<string, 1 | 2 | 3>();
    serie
      .filter(m => medida(m) > 0)
      .slice()
      .sort((a, b) => medida(b) - medida(a)
        || (metrica === 'faturamento' ? b.fechados - a.fechados : b.valor - a.valor)
        || a.mes.localeCompare(b.mes))
      .slice(0, 3)
      .forEach((m, i) => podio.set(m.mes, (i + 1) as 1 | 2 | 3));
    return podio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serie, metrica]);
  const LUGAR_POR_EXTENSO = ['melhor mês do período', 'segundo melhor mês', 'terceiro melhor mês'];

  /**
   * O mês aberto no clique. Com um escolhido, a dica dele para de depender do
   * ponteiro e os outros meses recuam: a série continua ali para dar a escala,
   * mas a leitura passa a ser sobre um mês só.
   *
   * Mês sem fechamento nenhum não abre - não há o que listar, e apagar onze
   * colunas para mostrar uma lista vazia seria trocar a informação por nada.
   */
  const [aberto, setAberto] = useState<string | null>(null);
  const area = useRef<HTMLDivElement>(null);
  /** Sufixo dos ids do SVG: dois gráficos na mesma página dariam degradê e
   *  recorte com o mesmo nome, e o navegador fica com o primeiro que achar. */
  const uid = useId().replace(/:/g, '');

  /**
   * Janela longa: com quarenta e cinco colunas, doze rotulos de mes viram uma
   * mancha e os numeros em cima das barras se encavalam. Aqui o eixo passa a
   * marcar de tres em tres - contando do mes mais recente para tras, para o mes
   * atual nunca ficar sem nome -, e o numero fica so nas barras premiadas. O
   * valor de cada mes continua a um passar de mouse.
   */
  const denso = serie.length > 18;

  /** O y de um mês no quadro do desenho: 0 no topo, 100 na base - que é como o
   *  SVG conta. */
  const yDe = (i: number) => 100 - (medida(serie[i]) / teto) * 100;
  /** O x de um mês: o centro da coluna dele, para o traçado passar exatamente
   *  por onde está o ponto. */
  const xDe = (i: number) => ((i + 0.5) / serie.length) * 100;
  /** O traçado inteiro. Começa e termina plano nas bordas do quadro: a série não
   *  sabe o que veio antes nem o que vem depois, e inclinar ali seria inventar. */
  const tracado = `M 0,${yDe(0)} `
    + serie.map((_, i) => `L ${xDe(i)},${yDe(i)}`).join(' ')
    + ` L 100,${yDe(serie.length - 1)}`;
  const preenchimento = `${tracado} L 100,100 L 0,100 Z`;
  /** A coluna aberta, para o recorte que a mantém acesa enquanto o resto recua. */
  const iAberto = serie.findIndex(m => m.mes === aberto);

  // Sai pelo Escape e pelo clique fora, como todo painel do sistema. O clique é
  // ouvido no `mousedown` para fechar no gesto, e não na soltura.
  useEffect(() => {
    if (!aberto) return;
    const naTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(null); };
    const noClique = (e: MouseEvent) => {
      if (!area.current?.contains(e.target as Node)) setAberto(null);
    };
    document.addEventListener('keydown', naTecla);
    document.addEventListener('mousedown', noClique);
    return () => {
      document.removeEventListener('keydown', naTecla);
      document.removeEventListener('mousedown', noClique);
    };
  }, [aberto]);

  if (total === 0) {
    return (
      <p className="painel-vazio">
        Nenhuma oportunidade fechada nos últimos 12 meses. O gráfico aparece
        quando a primeira ganhar a data em "Fechado em".
      </p>
    );
  }

  return (
    <>
      {/* Sem `.troca` aqui: a transicao do grafico e o crescimento do chao, e um
          desvanecer por baixo dele so lavava o comeco. O `.troca` fica na
          legenda, que e texto trocando de conteudo. */}
      <div ref={area} className={`grafico-area${aberto ? ' tem-aberto' : ''}`} role="img"
        aria-label={`${total} oportunidades fechadas nos últimos 12 meses`}>
        {/* O desenho, atravessando as colunas por baixo delas. */}
        <svg className="grafico-desenho" viewBox="0 0 100 100"
          preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${uid}-tinta`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className="grafico-tinta-topo" />
              <stop offset="100%" className="grafico-tinta-base" />
            </linearGradient>
            {/* O recorte do mês aberto: a faixa da coluna dele, de cima a baixo. */}
            {iAberto >= 0 && (
              <clipPath id={`${uid}-recorte`}>
                <rect x={(iAberto / serie.length) * 100} y="0"
                  width={100 / serie.length} height="100" />
              </clipPath>
            )}
          </defs>
          {/* O traçado inteiro. Com um mês aberto ele recua, e a cópia recortada
              abaixo devolve o brilho só ao pedaço escolhido - assim o realce não
              depende de partir o desenho em fatias. */}
          <g className="grafico-base">
            <path className="grafico-tinta" fill={`url(#${uid}-tinta)`} d={preenchimento} />
            <path className="grafico-linha" vectorEffect="non-scaling-stroke" d={tracado} />
          </g>
          {iAberto >= 0 && (
            <g clipPath={`url(#${uid}-recorte)`}>
              <path className="grafico-tinta" fill={`url(#${uid}-tinta)`} d={preenchimento} />
              <path className="grafico-linha" vectorEffect="non-scaling-stroke" d={tracado} />
            </g>
          )}
        </svg>
        {serie.map((m, i) => {
          const lugar = medalhas.get(m.mes);
          // Aberta, a dica sai pelo lado - e pelo lado onde ha espaco. Nos meses
          // da metade direita ela abre para a esquerda, senao encostaria fora do
          // painel.
          const paraEsquerda = i > serie.length / 2 - 1;
          /** A altura do ponto, em porcentagem do quadro. */
          const altura = (medida(m) / teto) * 100;
          return (
            // `tabIndex` para o teclado alcançar o mês: a dica aparece no
            // hover e no foco, e sem isso ela seria só do mouse. Com
            // fechamentos, a coluna também é botão: abre o mês e volta a
            // fechá-lo no segundo toque, como todo gatilho da casa.
            <div key={m.mes}
              className={`grafico-coluna${m.fechados > 0 ? ' abrivel' : ''}`
                + (aberto === m.mes ? ' aberta' : '')
                + (paraEsquerda ? ' abre-esquerda' : '')}
              tabIndex={0}
              role={m.fechados > 0 ? 'button' : undefined}
              aria-pressed={m.fechados > 0 ? aberto === m.mes : undefined}
              onClick={m.fechados > 0 ? () => setAberto(a => (a === m.mes ? null : m.mes)) : undefined}
              onKeyDown={m.fechados > 0
                ? e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setAberto(a => (a === m.mes ? null : m.mes));
                  }
                }
                : undefined}
              aria-label={`${mesPorExtenso(m.mes)}: ${m.fechados} fechada${m.fechados === 1 ? '' : 's'}`
                + (m.valor > 0 ? `, ${dinheiro(m.valor)}` : '')
                + (lugar ? `, ${LUGAR_POR_EXTENSO[lugar - 1]}` : '')}>
              {/* A dica da casa - a mesma pílula escura do donut -, ancorada na
                  coluna em vez de seguir o ponteiro: aqui o alvo é fixo, e uma
                  dica que persegue o mouse sobre doze colunas vizinhas pisca
                  mais do que informa. */}
              <span className="grafico-dica" role="tooltip">
                <span className="grafico-dica-mes">{mesPorExtenso(m.mes)}</span>
                <span className="grafico-dica-linha">
                  <strong>{m.fechados}</strong> fechada{m.fechados === 1 ? '' : 's'}
                  {m.valor > 0 && <span className="grafico-dica-valor">{dinheiro(m.valor)}</span>}
                </span>
                {/* A dica diz por extenso o que a medalha diz por desenho: sobre
                    a coluna cabe o metal, mas não o lugar que ele representa. */}
                {lugar && <span className="grafico-dica-podio">{LUGAR_POR_EXTENSO[lugar - 1]}</span>}
                {/* Aberto o mês, a dica deixa de resumir e passa a listar. Cinco
                    linhas, e o resto vira uma contagem: a lista inteira de um mês
                    forte sairia pelo topo do painel, e quem precisa das doze
                    tem o funil. As maiores vêm primeiro - é o servidor que já
                    manda nessa ordem.

                    A lista fica montada desde sempre e quem decide é a classe:
                    é o `.revelar` da casa, e ele precisa do conteúdo já na
                    árvore para ter de onde animar. Montada só enquanto aberta,
                    ela cresceria de nada para nada. */}
                {!!m.projetos?.length && (
                  <span className={`revelar${aberto === m.mes ? ' aberto' : ''}`}>
                    <span>
                      <span className="grafico-dica-projetos">
                        {m.projetos.slice(0, 5).map(p => (
                          <span key={p.id} className="grafico-dica-projeto">
                            <span className="grafico-dica-empresa">{p.empresa}</span>
                            {p.valor > 0 && <span className="grafico-dica-cifra">{dinheiro(p.valor)}</span>}
                          </span>
                        ))}
                        {m.projetos.length > 5 && (
                          <span className="grafico-dica-resto">e mais {m.projetos.length - 5}</span>
                        )}
                      </span>
                    </span>
                  </span>
                )}
              </span>
              <div className="grafico-trilho">
                {/* O ponto é elemento, e não círculo no SVG: dentro do desenho
                    esticado ele viraria uma elipse. */}
                <span className={`grafico-ponto${medida(m) === 0 ? ' zero' : ''}`}
                  style={{ bottom: `${altura}%` }} />
                {/* O número acompanha o próprio ponto, e não uma fileira fixa no
                    alto do quadro: todos na mesma altura, era preciso contar
                    colunas para saber de que mês era cada valor. */}
                {(!denso || lugar) && (
                  <span className={`grafico-valor${medida(m) === 0 ? ' zero' : ''}`}
                    style={{ bottom: `${altura}%` }}>
                    {lugar && <IconMedalha lugar={lugar} size={15} />}
                    {metrica === 'faturamento' ? dinheiroCurto(m.valor) : m.fechados}
                  </span>
                )}
              </div>
              <span className="grafico-mes">
                {!denso || (serie.length - 1 - i) % 3 === 0 ? rotuloDoMes(m.mes, mostrarAno) : ''}
              </span>
            </div>
          );
        })}
      </div>
      <p className="painel-rodape">
        <strong>{total}</strong> fechada{total === 1 ? '' : 's'} no período
        {totalValor > 0 && <> · {dinheiro(totalValor)} somados</>}
      </p>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  A maquete do painel.
//
//  Os blocos daqui para baixo são exemplo: números inventados, no lugar e no
//  formato que os de verdade vão ocupar quando cada consulta existir. Servem
//  para decidir o desenho do painel - quantos cartões cabem na fileira, que
//  gráfico responde melhor a cada pergunta - sem esperar o servidor.
//
//  Cada um leva a marca "Exemplo" ao lado do título, e ela sai junto com o
//  mock. Número inventado sem aviso num painel é o tipo de coisa que vira
//  decisão errada numa reunião, e o aviso custa uma etiqueta.
// ─────────────────────────────────────────────────────────────────────────────

/** A paleta dos gráficos: o verde da casa, e os tons que as etapas de entrega
 *  já usam. Nada de hex novo - cor de dado no sistema sai daqui. */
const TINTA = {
  principal: 'var(--yellow)',
  apoio: 'var(--gray2)',
  entregue: COR_ENTREGA['Entregue'],
  andamento: COR_ENTREGA['Em andamento'],
  validada: COR_ENTREGA['Validada'],
  parada: COR_ENTREGA['Planejada'],
};

const MESES_EXEMPLO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'];

/** Uma série de barras verticais. Com mais de um valor por grupo elas ficam
 *  lado a lado dentro do mesmo mês, que é o que se lê como comparação. */
function BarrasVerticais({ grupos, series, altura = 148 }: {
  grupos: { rotulo: string; valores: number[] }[];
  series: { nome: string; cor: string }[];
  altura?: number;
}) {
  const teto = Math.max(1, ...grupos.flatMap(g => g.valores));
  return (
    <>
      <div className="mini-grafico" style={{ height: altura }}>
        {grupos.map(g => (
          <div key={g.rotulo} className="mini-grupo">
            <span className="mini-barras">
              {g.valores.map((v, i) => (
                <span key={series[i].nome} className="mini-barra"
                  title={`${series[i].nome}: ${v}`}
                  style={{ height: `${(v / teto) * 100}%`, background: series[i].cor }} />
              ))}
            </span>
            <span className="mini-rotulo">{g.rotulo}</span>
          </div>
        ))}
      </div>
      {series.length > 1 && <Legenda series={series} />}
    </>
  );
}

/** As mesmas barras, uma em cima da outra: aqui a pergunta é de que o total é
 *  feito, e não quanto cada parte deu sozinha. */
function BarrasEmpilhadas({ grupos, series, altura = 148 }: {
  grupos: { rotulo: string; valores: number[] }[];
  series: { nome: string; cor: string }[];
  altura?: number;
}) {
  const soma = (g: { valores: number[] }) => g.valores.reduce((a, b) => a + b, 0);
  const teto = Math.max(1, ...grupos.map(soma));
  return (
    <>
      <div className="mini-grafico" style={{ height: altura }}>
        {grupos.map(g => (
          <div key={g.rotulo} className="mini-grupo">
            <span className="mini-pilha" style={{ height: `${(soma(g) / teto) * 100}%` }}>
              {g.valores.map((v, i) => (
                <span key={series[i].nome} className="mini-fatia"
                  title={`${series[i].nome}: ${v}`}
                  style={{ flexGrow: v, background: series[i].cor }} />
              ))}
            </span>
            <span className="mini-rotulo">{g.rotulo}</span>
          </div>
        ))}
      </div>
      <Legenda series={series} />
    </>
  );
}

/** Barras deitadas: para quando o rótulo é um nome, e não um mês. Em pé, seis
 *  nomes de cliente viram seis textos tombados. */
function BarrasHorizontais({ itens, cor, rotuloDentro }: {
  itens: { rotulo: string; valor: number }[];
  cor: string;
  /** O nome vai dentro da barra, como no painel de referência. Fora dela, a
   *  coluna de nomes come metade da largura num painel de um terço de tela. */
  rotuloDentro?: boolean;
}) {
  const teto = Math.max(1, ...itens.map(i => i.valor));
  return (
    <div className={`mini-linhas${rotuloDentro ? ' com-nome-dentro' : ''}`}>
      {itens.map(i => (
        <div key={i.rotulo} className="mini-linha">
          {!rotuloDentro && <span className="mini-linha-nome">{i.rotulo}</span>}
          <span className="mini-trilho">
            <span className="mini-preenche"
              style={{ width: `${Math.max(6, (i.valor / teto) * 100)}%`, background: cor }}>
              {rotuloDentro && <span className="mini-dentro">{i.rotulo}</span>}
            </span>
          </span>
          <span className="mini-linha-valor">{i.valor}</span>
        </div>
      ))}
    </div>
  );
}

/** A legenda das séries. Só aparece quando há mais de uma: com uma só, ela
 *  repetiria o título do painel. */
function Legenda({ series }: { series: { nome: string; cor: string }[] }) {
  return (
    <div className="mini-legenda">
      {series.map(s => (
        <span key={s.nome} className="mini-legenda-item">
          <span className="mini-legenda-cor" style={{ background: s.cor }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

/**
 * Um bloco do painel: o título do assunto, uma linha dizendo o que se lê ali, e
 * os gráficos embaixo.
 *
 * O bloco é a moldura, e não cada gráfico. Cada um numa caixa própria, a página
 * virava uma parede de cartões iguais onde nada dizia o que estava junto com o
 * quê - e a leitura passa a ser "que assunto é este", que é a pergunta do
 * bloco, não do gráfico.
 */
function Bloco({ titulo, apoio, exemplo, children }: {
  titulo: string;
  apoio: string;
  /** Marca o bloco inteiro como maquete. Uma vez por assunto, e não um selo em
   *  cima de cada gráfico: seis etiquetas iguais na mesma tela viram ruído, e a
   *  primeira já disse o que era preciso dizer. */
  exemplo?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="bloco">
      <div className="bloco-topo">
        <p className="bloco-titulo">
          {titulo}
          {exemplo && <span className="painel-marca">Exemplo</span>}
        </p>
        <p className="bloco-apoio">{apoio}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Um gráfico no cartão da casa: título, o período que ele cobre, o desenho e a
 * linha de leitura embaixo.
 *
 * O cartão é o mesmo `.painel` do Comercial - mesma moldura, mesmo acabamento
 * de cristal. Um gráfico solto sobre a folha lia como sobra da página; dentro
 * do cartão ele é uma peça, e a fileira de três vira uma fileira de peças.
 */
function Quadro({ titulo, periodo, tendencia, caindo, nota, children }: {
  titulo: string;
  periodo: string;
  tendencia: string;
  caindo?: boolean;
  nota: string;
  children: ReactNode;
}) {
  return (
    <section className="painel quadro">
      <div className="quadro-cabeca">
        <p className="quadro-titulo">{titulo}</p>
        <p className="quadro-periodo">{periodo}</p>
      </div>
      {children}
      <p className="quadro-rodape">
        <span className={`painel-tendencia-linha${caindo ? ' caindo' : ''}`}>
          {caindo ? <IconTrendDown size={13} /> : <IconTrendUp size={13} />}
          <strong>{tendencia}</strong>
        </span>
        <span className="painel-tendencia-nota">{nota}</span>
      </p>
    </section>
  );
}

/** Os números inventados da maquete, num lugar só - trocar o mock por consulta
 *  é apagar esta constante e o que a lê. */
const EXEMPLO = {
  kpis: [
    { rotulo: 'Projetos ativos', valor: 12, nota: '3 neste mês', cor: 'var(--yellow)' },
    { rotulo: 'Entregas no prazo', valor: '87%', nota: 'em 6 meses', cor: COR_ENTREGA['Validada'] },
    { rotulo: 'Horas apontadas', valor: '1.248', nota: 'no mês', cor: COR_ENTREGA['Em andamento'] },
    { rotulo: 'Chamados abertos', valor: 5, nota: '2 esperando', cor: 'var(--gray2)' },
  ],
  entregas: [8, 12, 9, 15, 11, 18, 14, 19, 16, 21, 17, 24],
  clientes: [
    { rotulo: 'Grupo 3SA', valor: 9 },
    { rotulo: 'Cheirin Bão', valor: 7 },
    { rotulo: 'J17 Bank', valor: 5 },
    { rotulo: 'Prontomed', valor: 4 },
    { rotulo: 'Orteconte', valor: 2 },
  ],
  planejadoEntregue: [[10, 8], [12, 12], [9, 7], [14, 15], [11, 10], [16, 18]],
  horas: [
    { rotulo: 'Guilherme', valor: 168 },
    { rotulo: 'Thales', valor: 152 },
    { rotulo: 'Equipe dev', valor: 486 },
    { rotulo: 'Parceiros', valor: 210 },
  ],
  tarefas: [[6, 4, 10], [8, 5, 12], [5, 6, 9], [9, 4, 14], [7, 7, 11], [10, 5, 16]],
  chamados: [
    { rotulo: 'Bug', valor: 14 },
    { rotulo: 'Melhoria', valor: 23 },
    { rotulo: 'Dúvida', valor: 8 },
  ],
  receita: [
    { chave: 'projetos', rotulo: 'Projetos', valor: 48, cor: 'var(--yellow)' },
    { chave: 'squad', rotulo: 'Squad alocado', valor: 31, cor: COR_ENTREGA['Entregue'] },
    { chave: 'manutencao', rotulo: 'Manutenção', valor: 14, cor: COR_ENTREGA['Em andamento'] },
    { chave: 'consultoria', rotulo: 'Consultoria', valor: 7, cor: COR_ENTREGA['Planejada'] },
  ],
};

/** Os doze meses do exemplo temporal, do mais antigo para o mais novo. */
const DOZE_MESES = ['out', 'nov', 'dez', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set'];

/** A maquete: um bloco largo em cima e dois de três gráficos embaixo. */
function MaqueteDoPainel() {
  const mes = (i: number) => MESES_EXEMPLO[i];
  return (
    <>
      <Bloco titulo="Entregas" exemplo
        apoio="Quanto a casa entregou por mês, nos últimos doze.">
        {/* Largura cheia: a série temporal é a que mais ganha com espaço - doze
            meses espremidos num terço de tela viram serrilha. */}
        <Quadro titulo="Entregas validadas por mês" periodo="outubro de 2025 a setembro de 2026"
          tendencia="Subindo 5,2% em relação ao mês passado"
          nota="184 entregas validadas no período">
          <BarrasVerticais altura={200}
            series={[{ nome: 'Entregas', cor: TINTA.principal }]}
            grupos={EXEMPLO.entregas.map((v, i) => ({ rotulo: DOZE_MESES[i], valores: [v] }))} />
        </Quadro>
      </Bloco>

      <Bloco titulo="Projetos e time" exemplo
        apoio="De onde vem o trabalho, como ele foi planejado e onde as horas foram parar.">
        <div className="bloco-grade">
          <Quadro titulo="Projetos por cliente" periodo="janeiro a junho de 2026"
            tendencia="Dois clientes novos no semestre" nota="Projetos abertos por conta">
            <BarrasHorizontais itens={EXEMPLO.clientes} cor={TINTA.principal} />
          </Quadro>
          <Quadro titulo="Planejado x entregue" periodo="janeiro a junho de 2026"
            tendencia="Acima do planejado em dois meses" nota="Comparação mês a mês">
            <BarrasVerticais
              series={[
                { nome: 'Planejado', cor: TINTA.apoio },
                { nome: 'Entregue', cor: TINTA.principal },
              ]}
              grupos={EXEMPLO.planejadoEntregue.map((v, i) => ({ rotulo: mes(i), valores: v }))} />
          </Quadro>
          <Quadro titulo="Horas por frente" periodo="setembro de 2026"
            tendencia="Equipe dev com 47% do total" nota="Apontamentos do mês corrente">
            <BarrasHorizontais itens={EXEMPLO.horas} cor={TINTA.entregue} />
          </Quadro>
        </div>
      </Bloco>

      <Bloco titulo="Qualidade e receita" exemplo
        apoio="O que a fila de trabalho mostra, o que o time reportou e de onde vem o dinheiro.">
        <div className="bloco-grade">
          <Quadro titulo="Tarefas por etapa" periodo="janeiro a junho de 2026"
            tendencia="Fila 8% mais curta que em maio" nota="Composição do quadro no fim do mês">
            <BarrasEmpilhadas
              series={[
                { nome: 'A fazer', cor: TINTA.parada },
                { nome: 'Em andamento', cor: TINTA.andamento },
                { nome: 'Concluídas', cor: TINTA.validada },
              ]}
              grupos={EXEMPLO.tarefas.map((v, i) => ({ rotulo: mes(i), valores: v }))} />
          </Quadro>
          <Quadro titulo="Chamados por tipo" periodo="últimos 90 dias" caindo
            tendencia="Bugs caindo 12% no trimestre" nota="O que o time reportou no portal">
            <BarrasHorizontais itens={EXEMPLO.chamados} cor={TINTA.andamento} rotuloDentro />
          </Quadro>
          <Quadro titulo="Composição da receita" periodo="primeiro semestre de 2026"
            tendencia="Recorrente em 45% do total" nota="Participação de cada frente">
            <Donut fatias={EXEMPLO.receita} unidade="por cento" tamanho={118} esticar />
          </Quadro>
        </div>
      </Bloco>
    </>
  );
}
