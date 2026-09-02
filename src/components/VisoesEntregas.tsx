// ─────────────────────────────────────────────────────────────────────────────
//  As três leituras de uma lista de entregas: lista, quadro e calendário.
//
//  Mora aqui, e não numa das telas, porque as duas superfícies que a mostram -
//  o painel do projeto e a página do cliente - precisam do mesmo desenho. Duas
//  cópias divergiriam no primeiro ajuste, e quem olha os dois lados veria dois
//  quadros diferentes da mesma coisa.
//
//  A lista continua sendo de cada tela: lá ela carrega edição, detalhe expandido
//  e árvore de grupo, que não são iguais dos dois lados. O que se repetia era o
//  quadro e o calendário, e é isso que está aqui.
//
//  Nada deste arquivo importa de `src/admin`: ele é usado pela página pública,
//  que não pode arrastar o portal junto.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconCalendario, IconVisaoLista, IconVisaoQuadro } from './icons';

/** A entrega achatada para o que estas duas visões precisam. Cada tela traduz
 *  o formato dela para este - no painel os responsáveis são ids que viram nome
 *  e foto, e na página do cliente já chegam resolvidos. */
export interface ItemVisao {
  id: number;
  titulo: string;
  categoria: string | null;
  status: string;
  prazo: string | null;
  progresso: number;
  donos: { nome: string; foto: string | null }[];
}

export const VISOES = [
  { valor: 'lista', label: 'Lista', Icone: IconVisaoLista },
  { valor: 'quadro', label: 'Quadro', Icone: IconVisaoQuadro },
  { valor: 'calendario', label: 'Calendário', Icone: IconCalendario },
] as const;

export type Visao = typeof VISOES[number]['valor'];

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const NEUTRO = '#8A8B84';

const fmtData = (v: string | null) => {
  if (!v) return null;
  const [a, m, d] = v.slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : null;
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2)
  .map(p => p[0]?.toUpperCase() ?? '').join('');

/** Retrato próprio, e não o de nenhuma das duas telas: importar o do portal
 *  traria o portal junto para a página do cliente. */
function Retrato({ nome, foto }: { nome: string; foto: string | null }) {
  const [falhou, setFalhou] = useState(false);
  if (foto && !falhou) {
    return <img className="visao-avatar" src={foto} alt="" referrerPolicy="no-referrer"
      onError={() => setFalhou(true)} />;
  }
  return <span className="visao-avatar visao-avatar-vazio">{iniciais(nome)}</span>;
}

/** O switcher no padrão da casa: pastilha que desliza, um ícone por leitura.
 *
 *  A pastilha se mede pelo botão ativo em vez de assumir uma largura fixa:
 *  assim o mesmo componente serve à página do cliente e ao painel, onde ele é
 *  mais compacto para acompanhar a altura da busca. Com a conta fixa, apertar
 *  o botão por CSS deixava a pastilha fora de lugar. */
export function SwitcherVisao({ valor, onChange }: {
  valor: string;
  onChange: (v: Visao) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);
  const [pastilha, setPastilha] = useState<{ left: number; width: number } | null>(null);

  // Antes da pintura: medida depois, a pastilha apareceria uma vez no lugar
  // errado.
  useLayoutEffect(() => {
    const medir = () => {
      const i = VISOES.findIndex(v => v.valor === valor);
      const btn = botoes.current[i];
      if (btn) setPastilha({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    medir();
    const el = caixa.current;
    if (!el) return;
    const olho = new ResizeObserver(medir);
    olho.observe(el);
    return () => olho.disconnect();
  }, [valor]);

  return (
    <div ref={caixa} className="view-toggle visoes-switch">
      {pastilha && (
        <div className="view-toggle-pill"
          style={{ left: pastilha.left, width: pastilha.width }} />
      )}
      {VISOES.map((v, i) => (
        <button key={v.valor} type="button"
          ref={el => { botoes.current[i] = el; }}
          className={valor === v.valor ? 'active' : ''}
          onClick={() => onChange(v.valor)}
          title={v.label} aria-label={`Ver em ${v.label.toLocaleLowerCase('pt-BR')}`}
          aria-pressed={valor === v.valor}>
          <v.Icone size={14} />
        </button>
      ))}
    </div>
  );
}

/** O cartão da entrega, usado no quadro. É a linha da lista dobrada em duas: a
 *  situação e o título em cima, o resto embaixo. */
function CartaoVisao({ e, cor, icone: Icone, onAbrir }: {
  e: ItemVisao;
  cor: string;
  icone?: (p: { size?: number }) => JSX.Element;
  onAbrir: () => void;
}) {
  return (
    <button type="button" className="visao-cartao" onClick={onAbrir}
      title={`Ver ${e.titulo} na lista`}>
      <span className="visao-cartao-topo">
        <span className="visao-marco" style={{ ['--mc' as string]: cor }}>
          {Icone ? <Icone size={13} /> : null}
        </span>
        <span className="visao-cartao-titulo">{e.titulo}</span>
      </span>
      {e.categoria && <span className="visao-categoria">{e.categoria}</span>}
      <span className="visao-cartao-pe">
        {fmtData(e.prazo) && <span className="visao-prazo">{fmtData(e.prazo)}</span>}
        {e.donos.length > 0 && (
          <span className="visao-donos">
            {e.donos.map(p => (
              <span key={p.nome} title={p.nome}><Retrato nome={p.nome} foto={p.foto} /></span>
            ))}
          </span>
        )}
        <span className="visao-pct">{e.progresso}%</span>
      </span>
    </button>
  );
}

/** Quadro por situação. As colunas vêm na ordem recebida e aparecem mesmo
 *  vazias: coluna que some esconde que não há nada travado. */
export function QuadroEntregas({ itens, situacoes, cores, icones, onAbrir }: {
  itens: ItemVisao[];
  situacoes: string[];
  cores: Record<string, string>;
  icones?: Record<string, (p: { size?: number }) => JSX.Element>;
  onAbrir: (id: number) => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  /** De que lado ainda há coluna fora da tela. O véu só entra desse lado: um
   *  degradê fixo na direita continuaria apagando a última coluna depois de a
   *  pessoa rolar até o fim, e aí ele mente. */
  const [corta, setCorta] = useState({ esq: false, dir: false });

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setCorta({
      esq: el.scrollLeft > 4,
      dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    // O corte também muda quando a caixa muda de tamanho, sem ninguém rolar.
    const olho = new ResizeObserver(medir);
    olho.observe(el);
    return () => { el.removeEventListener('scroll', medir); olho.disconnect(); };
  }, [situacoes.length, itens.length]);

  return (
    <div ref={caixa}
      className={`visao-quadro${corta.esq ? ' corta-esq' : ''}${corta.dir ? ' corta-dir' : ''}`}>
      {situacoes.map(st => {
        const daColuna = itens.filter(e => e.status === st);
        return (
          <div key={st} className="visao-coluna">
            <p className="visao-coluna-topo">
              <span className="visao-coluna-cor" style={{ background: cores[st] ?? NEUTRO }} />
              {st}
              <span>{daColuna.length}</span>
            </p>
            <div className="visao-coluna-corpo">
              {daColuna.map(e => (
                <CartaoVisao key={e.id} e={e} cor={cores[e.status] ?? NEUTRO}
                  icone={icones?.[e.status]} onAbrir={() => onAbrir(e.id)} />
              ))}
              {daColuna.length === 0 && <p className="visao-coluna-vazia">Nada aqui.</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Calendário do mês, pelo prazo de cada entrega. Abre no mês da entrega mais
 *  próxima que ainda não fechou, e não em hoje: um projeto que só tem prazo em
 *  novembro abriria numa grade vazia. */
export function CalendarioEntregas({ itens, cores, fechados, onAbrir }: {
  itens: ItemVisao[];
  cores: Record<string, string>;
  /** Situações que não contam como "ainda por vir" na hora de escolher o mês. */
  fechados: string[];
  onAbrir: (id: number) => void;
}) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const comPrazo = itens.filter(e => e.prazo);
  const primeiro = [...comPrazo]
    .filter(e => (e.prazo ?? '').slice(0, 10) >= iso(hoje) && !fechados.includes(e.status))
    .sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? ''))[0]
    ?? [...comPrazo].sort((a, b) => (b.prazo ?? '').localeCompare(a.prazo ?? ''))[0];
  const inicial = primeiro?.prazo
    ? new Date(`${primeiro.prazo.slice(0, 10)}T00:00:00`)
    : hoje;
  const [mes, setMes] = useState(() => new Date(inicial.getFullYear(), inicial.getMonth(), 1));

  const porDia = new Map<string, ItemVisao[]>();
  for (const e of comPrazo) {
    const k = (e.prazo ?? '').slice(0, 10);
    const l = porDia.get(k);
    if (l) l.push(e); else porDia.set(k, [e]);
  }

  // A grade sempre começa no domingo da semana do dia 1 e fecha a última semana
  // inteira: mês que começa numa quarta não pode abrir com buracos.
  const comeco = new Date(mes);
  comeco.setDate(1 - mes.getDay());
  const dias: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(comeco);
    d.setDate(comeco.getDate() + i);
    dias.push(d);
  }
  // Sexta semana só entra se tiver dia do mês: senão sobra uma faixa vazia.
  const semanas = [0, 1, 2, 3, 4, 5]
    .map(i => dias.slice(i * 7, i * 7 + 7))
    .filter(sem => sem.some(d => d.getMonth() === mes.getMonth()));

  const semPrazo = itens.filter(e => !e.prazo);

  return (
    <div className="visao-calendario">
      <div className="visao-cal-topo">
        <button type="button" aria-label="Mês anterior"
          onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
          <span className="visao-cal-seta esquerda" aria-hidden="true" />
        </button>
        <strong>{MESES[mes.getMonth()]} de {mes.getFullYear()}</strong>
        <button type="button" aria-label="Próximo mês"
          onClick={() => setMes(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
          <span className="visao-cal-seta" aria-hidden="true" />
        </button>
      </div>

      <div className="visao-cal-grade">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map(d => (
          <span key={d} className="visao-cal-cabeca">{d}</span>
        ))}
        {semanas.flat().map(d => {
          const chave = iso(d);
          const doMes = d.getMonth() === mes.getMonth();
          const ehHoje = chave === iso(hoje);
          const doDia = porDia.get(chave) ?? [];
          return (
            <div key={chave} className={`visao-cal-dia${doMes ? '' : ' fora'}${ehHoje ? ' hoje' : ''}`}>
              <span className="visao-cal-numero">{d.getDate()}</span>
              {doDia.map(e => (
                <button key={e.id} type="button" className="visao-cal-chip"
                  onClick={() => onAbrir(e.id)} title={`${e.titulo} - ${e.status}`}>
                  <span className="visao-cal-ponto" style={{ background: cores[e.status] ?? NEUTRO }} />
                  {e.titulo}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {semPrazo.length > 0 && (
        <div className="visao-cal-solta">
          <p className="visao-cal-solta-titulo">
            Sem data definida
            <span>{semPrazo.length}</span>
          </p>
          <div className="visao-cal-solta-lista">
            {semPrazo.map(e => (
              <button key={e.id} type="button" className="visao-cal-chip"
                onClick={() => onAbrir(e.id)} title={`${e.titulo} - ${e.status}`}>
                <span className="visao-cal-ponto" style={{ background: cores[e.status] ?? NEUTRO }} />
                {e.titulo}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
