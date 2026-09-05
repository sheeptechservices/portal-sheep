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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AdminApp';
import { IconAlert } from '../components/icons';
import { Skeleton } from '../components/Skeleton';

/** Um mês da série, como o servidor devolve - inclusive os vazios. */
interface MesFechado {
  /** `2026-09`. */
  mes: string;
  fechados: number;
  valor: number;
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

export default function DashboardPage({ token }: { token: string }) {
  const { onSessionExpired } = useAuth();
  const [dados, setDados] = useState<PainelComercial | null>(null);
  const [erro, setErro] = useState('');

  const api = useCallback(async (busca: string) => {
    const r = await fetch(`/api/admin-data?${busca}`, { headers: { 'x-admin-session': token } });
    if (r.status === 401) { onSessionExpired(); return null; }
    return await r.json().catch(() => null);
  }, [token, onSessionExpired]);

  useEffect(() => {
    let vivo = true;
    api('action=painel_comercial&meses=12')
      .then(d => {
        if (!vivo) return;
        if (!d || d.error) setErro(d?.error ?? 'Não foi possível carregar o painel.');
        else setDados(d as PainelComercial);
      })
      .catch(() => { if (vivo) setErro('Erro de conexão. Tente de novo.'); });
    return () => { vivo = false; };
  }, [api]);

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
            <p className="painel-apoio">Oportunidades fechadas nos últimos 12 meses</p>
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
          <GraficoFechados serie={dados.serie} />
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
 * O desenho é feito por coluna, e não numa tela só: cada célula desenha a sua
 * fatia da curva, do meio do vão anterior ao meio do próximo. As fatias emendam
 * sem emenda visível porque a curva é cortada ao meio pelo algoritmo de
 * Casteljau, que devolve os dois pedaços exatos de uma mesma Bézier - e assim o
 * traçado não depende de medir a largura do painel em JavaScript, que muda com
 * a janela, com a barra lateral e com a rolagem.
 */
function GraficoFechados({ serie }: { serie: MesFechado[] }) {
  const total = serie.reduce((s, m) => s + m.fechados, 0);
  const totalValor = serie.reduce((s, m) => s + m.valor, 0);
  /** O teto do eixo. Nunca zero, senão a divisão que dá a altura do ponto
   *  explode num painel sem nenhum fechamento. */
  const teto = Math.max(1, ...serie.map(m => m.fechados));

  // O ano só aparece no rótulo quando a série atravessa a virada: doze meses
  // dentro do mesmo ano não precisam repeti-lo doze vezes.
  const anos = useMemo(() => new Set(serie.map(m => m.mes.slice(0, 4))), [serie]);
  const mostrarAno = anos.size > 1;

  if (total === 0) {
    return (
      <p className="painel-vazio">
        Nenhuma oportunidade fechada nos últimos 12 meses. O gráfico aparece
        quando a primeira ganhar a data em "Fechado em".
      </p>
    );
  }

  /** A altura do ponto, em porcentagem do topo para baixo - que é como o SVG
   *  conta. Zero fica na base. */
  const alturaY = (v: number) => 100 - (v / teto) * 100;
  /** O y de um mês, com as pontas presas: antes do primeiro e depois do último
   *  a série repete a borda, e é isso que faz a curva chegar plana nas duas
   *  extremidades em vez de disparar para fora do quadro. */
  const yDe = (i: number) => alturaY(serie[Math.min(serie.length - 1, Math.max(0, i))].fechados);
  /**
   * A inclinação em cada mês. É ela que dá à curva a direção suave, sem
   * cotovelo em cima do ponto.
   *
   * Não é a média simples dos vizinhos: com ela, um mês de pico entre dois
   * zerados fazia a curva passar do ponto e mergulhar abaixo da base - área
   * desenhada onde não houve venda nenhuma. A regra aqui é a de Fritsch e
   * Carlson: em pico e em vale a inclinação vai a zero, e nos demais ela é
   * limitada pelo menor dos dois degraus. Assim a curva nunca sai do intervalo
   * entre dois meses vizinhos.
   */
  const inclinacao = (i: number) => {
    const antes = yDe(i) - yDe(i - 1);
    const depois = yDe(i + 1) - yDe(i);
    if (antes * depois <= 0) return 0;
    const media = (antes + depois) / 2;
    const teto3 = 3 * Math.min(Math.abs(antes), Math.abs(depois));
    return Math.sign(media) * Math.min(Math.abs(media), teto3);
  };

  /**
   * A Bézier do trecho `i → i+1`, partida ao meio.
   *
   * Cortar ao meio importa porque cada coluna desenha só o pedaço que lhe cabe:
   * a segunda metade do trecho que chega e a primeira do que sai. Casteljau dá
   * as duas partes exatas, então a curva atravessa as colunas como se fosse uma
   * só - e continua passando por cima de cada ponto, que é o que mantém o
   * marcador do mês em cima da linha.
   */
  const metades = (i: number) => {
    const p0 = yDe(i);
    const p1 = yDe(i) + inclinacao(i) / 3;
    const p2 = yDe(i + 1) - inclinacao(i + 1) / 3;
    const p3 = yDe(i + 1);
    const a = (p0 + p1) / 2, b = (p1 + p2) / 2, c = (p2 + p3) / 2;
    const d = (a + b) / 2, e = (b + c) / 2;
    const f = (d + e) / 2;
    // `f` é o ponto do meio do trecho; a primeira metade sai de p0 por a e d,
    // e a segunda chega em p3 por e e c.
    return { meio: f, saida: [a, d] as const, chegada: [e, c] as const };
  };

  return (
    <>
      <div className="grafico-area" role="img"
        aria-label={`${total} oportunidades fechadas nos últimos 12 meses`}>
        {/* O degradê mora aqui, uma vez só, e é apontado por todas as fatias.
            Em `userSpaceOnUse` ele se mede pelo quadro do desenho, e não pela
            caixa de cada polígono - senão cada mês teria a sua própria escala de
            cor e a emenda entre eles apareceria. */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="grafico-area-tinta" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              <stop offset="0%" className="grafico-tinta-topo" />
              <stop offset="100%" className="grafico-tinta-base" />
            </linearGradient>
          </defs>
        </svg>
        {serie.map((m, i) => {
          const y = alturaY(m.fechados);
          const entra = metades(i - 1);
          const sai = metades(i);
          // A fatia: chega pela curva do mês anterior, passa pelo ponto e sai
          // pela curva do próximo.
          const curva = `M 0,${entra.meio}`
            + ` C 16.67,${entra.chegada[0]} 33.33,${entra.chegada[1]} 50,${y}`
            + ` C 66.67,${sai.saida[0]} 83.33,${sai.saida[1]} 100,${sai.meio}`;
          return (
            // `tabIndex` para o teclado alcançar o mês: a dica aparece no
            // hover e no foco, e sem isso ela seria só do mouse.
            <div key={m.mes} className="grafico-coluna" tabIndex={0}
              aria-label={`${mesPorExtenso(m.mes)}: ${m.fechados} fechada${m.fechados === 1 ? '' : 's'}`
                + (m.valor > 0 ? `, ${dinheiro(m.valor)}` : '')}>
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
              </span>
              <div className="grafico-trilho">
                <svg className="grafico-fatia" viewBox="0 0 100 100"
                  preserveAspectRatio="none" aria-hidden="true">
                  <path className="grafico-fatia-tinta" d={`${curva} L 100,100 L 0,100 Z`} />
                  {/* `non-scaling-stroke`: sem ele a linha engrossaria na
                      horizontal junto com o esticão do viewBox. */}
                  <path className="grafico-fatia-linha" vectorEffect="non-scaling-stroke" d={curva} />
                </svg>
                {/* O ponto é elemento, e não círculo no SVG: dentro do desenho
                    esticado ele viraria uma elipse. */}
                <span className={`grafico-ponto${m.fechados === 0 ? ' zero' : ''}`}
                  style={{ bottom: `${(m.fechados / teto) * 100}%` }} />
                {/* O número acompanha o próprio ponto, e não uma fileira fixa no
                    alto do quadro: todos na mesma altura, era preciso contar
                    colunas para saber de que mês era cada valor. Mesma conta do
                    ponto; o afastamento acima dele fica no CSS. */}
                <span className={`grafico-valor${m.fechados === 0 ? ' zero' : ''}`}
                  style={{ bottom: `${(m.fechados / teto) * 100}%` }}>{m.fechados}</span>
              </div>
              <span className="grafico-mes">{rotuloDoMes(m.mes, mostrarAno)}</span>
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
