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
import { useAuth } from './AdminApp';
import { IconAlert, IconMedalha } from '../components/icons';
import { Skeleton } from '../components/Skeleton';
import { SegSwitch } from '../components/SegSwitch';

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
    <div className="admin-content-wrap">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Dashboard</h1>
          <p className="admin-page-desc">Os números da casa, por assunto.</p>
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
