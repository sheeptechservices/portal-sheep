// ─────────────────────────────────────────────────────────────────────────────
//  Filtro de período: de um dia a outro, na fileira dos filtros.
//
//  O gatilho é o mesmo botão dos outros filtros, para a barra ler como uma
//  coisa só; o que abre é um calendário. O primeiro clique marca o começo, o
//  segundo marca o fim - e se o segundo vier antes do primeiro, os dois trocam
//  de lugar, em vez de recusar o gesto. Os atalhos de cima resolvem os pedidos
//  de todo dia sem andar pelo calendário.
// ─────────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { IconChevronLeft, IconChevronRight } from './icons';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_DA_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/** A data em `YYYY-MM-DD`, no fuso de quem está na tela. */
const chave = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "12/10", ou "12/10/2027" quando o ano não é o corrente. */
function curta(iso: string): string {
  const [a, m, d] = iso.split('-');
  return a === String(new Date().getFullYear()) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

/**
 * A data cai dentro do período. Sem período, tudo passa; com período, a tarefa
 * sem data fica de fora - quem pede "o que vence esta semana" não quer as que
 * não vencem nunca.
 */
export function dentroDoPeriodo(iso: string | null | undefined, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!iso) return false;
  const dia = iso.slice(0, 10);
  return (!de || dia >= de) && (!ate || dia <= ate);
}

/** Os atalhos: o período de pedidos que se repetem, calculado no clique. */
function atalhos(): { rotulo: string; de: string; ate: string }[] {
  const hoje = new Date();
  const somar = (d: Date, dias: number) => { const x = new Date(d); x.setDate(x.getDate() + dias); return x; };
  // A semana da casa começa na segunda.
  const segunda = somar(hoje, -((hoje.getDay() + 6) % 7));
  const primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  const proxPrimeiro = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const proxUltimo = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0);
  return [
    { rotulo: 'Hoje', de: chave(hoje), ate: chave(hoje) },
    { rotulo: 'Esta semana', de: chave(segunda), ate: chave(somar(segunda, 6)) },
    { rotulo: 'Próximos 7 dias', de: chave(hoje), ate: chave(somar(hoje, 6)) },
    { rotulo: 'Este mês', de: chave(primeiro), ate: chave(ultimo) },
    { rotulo: 'Próximo mês', de: chave(proxPrimeiro), ate: chave(proxUltimo) },
  ];
}

export default function FiltroPeriodo({ label, de, ate, onChange }: {
  /** O nome do filtro, que é também o da data filtrada: "Prazo". */
  label: string;
  /** `YYYY-MM-DD`, ou vazio. */
  de: string;
  ate: string;
  onChange: (de: string, ate: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [visto, setVisto] = useState(() => {
    const d = de ? new Date(`${de}T12:00:00`) : new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  /** O começo já escolhido, esperando o fim. Nulo: o próximo clique começa. */
  const [comeco, setComeco] = useState<string | null>(null);
  /** O dia sob o mouse enquanto o fim é escolhido: o trecho até ele acende. */
  const [sob, setSob] = useState<string | null>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  useDropdownDismiss(aberto, [gatilho, lista], () => fechar());

  function fechar() {
    setAberto(false);
    setComeco(null);
    setSob(null);
  }

  function alternar() {
    if (aberto) { fechar(); return; }
    const r = gatilho.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
    const d = de ? new Date(`${de}T12:00:00`) : new Date();
    setVisto({ ano: d.getFullYear(), mes: d.getMonth() });
    setAberto(true);
  }

  // Preso à janela, como os outros filtros: sem espaço embaixo, abre para cima.
  useLayoutEffect(() => {
    if (!aberto || !gatilho.current || !lista.current) return;
    const MARGEM = 8;
    const g = gatilho.current.getBoundingClientRect();
    const r = lista.current.getBoundingClientRect();
    const cabeAbaixo = window.innerHeight - g.bottom - MARGEM >= r.height + 4;
    const top = Math.max(MARGEM, cabeAbaixo || g.top < r.height + 4
      ? Math.min(g.bottom + 4, window.innerHeight - MARGEM - r.height)
      : g.top - r.height - 4);
    const left = Math.max(MARGEM, Math.min(g.left, window.innerWidth - r.width - MARGEM));
    setPos(p => (Math.abs(p.top - top) < 1 && Math.abs(p.left - left) < 1 ? p : { top, left }));
  });

  function escolher(dia: string) {
    if (!comeco) {
      // O primeiro clique já filtra pelo dia: quem quer um dia só não precisa
      // clicar duas vezes nele.
      setComeco(dia);
      onChange(dia, dia);
      return;
    }
    const [a, b] = dia < comeco ? [dia, comeco] : [comeco, dia];
    onChange(a, b);
    fechar();
  }

  function andar(passo: number) {
    setVisto(v => {
      const m = v.mes + passo;
      return { ano: v.ano + Math.floor(m / 12), mes: ((m % 12) + 12) % 12 };
    });
  }

  // A grade do mês: seis semanas, começando no domingo, com as pontas dos
  // meses vizinhos em cinza para a forma não pular de mês para mês.
  const primeiroDia = new Date(visto.ano, visto.mes, 1);
  const inicioDaGrade = new Date(visto.ano, visto.mes, 1 - primeiroDia.getDay());
  const dias = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioDaGrade);
    d.setDate(inicioDaGrade.getDate() + i);
    return { iso: chave(d), dia: d.getDate(), doMes: d.getMonth() === visto.mes };
  });
  const hoje = chave(new Date());

  // O trecho aceso: o período escolhido, ou, no meio da escolha, do começo até
  // o dia sob o mouse.
  const [ini, fim] = comeco
    ? (sob ? (sob < comeco ? [sob, comeco] : [comeco, sob]) : [comeco, comeco])
    : [de, ate];

  const ativo = !!(de || ate);
  const rotulo = !ativo ? label
    : de === ate ? `${label}: ${curta(de)}`
      : `${label}: ${de ? curta(de) : '...'} a ${ate ? curta(ate) : '...'}`;

  return (
    <>
      <button ref={gatilho} type="button"
        className={`filter-dropdown-btn${ativo ? ' active' : ''}`}
        aria-haspopup="dialog" aria-expanded={aberto}
        onClick={alternar}>
        <span>{rotulo}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {aberto && createPortal(
        <div ref={lista} className="filter-dropdown-list filtro-periodo" role="dialog"
          aria-label={`${label}: escolher o período`}
          style={{ top: pos.top, left: pos.left }}
          onMouseLeave={() => setSob(null)}>
          <div className="filtro-periodo-atalhos">
            {atalhos().map(a => (
              <button key={a.rotulo} type="button"
                className={`filtro-periodo-atalho${!comeco && a.de === de && a.ate === ate ? ' ativo' : ''}`}
                onClick={() => { onChange(a.de, a.ate); fechar(); }}>
                {a.rotulo}
              </button>
            ))}
          </div>

          <div className="filtro-periodo-mes">
            <button type="button" className="filtro-periodo-nav" aria-label="Mês anterior"
              onClick={() => andar(-1)}>
              <IconChevronLeft size={14} />
            </button>
            <span>{MESES[visto.mes]} de {visto.ano}</span>
            <button type="button" className="filtro-periodo-nav" aria-label="Próximo mês"
              onClick={() => andar(1)}>
              <IconChevronRight size={14} />
            </button>
          </div>

          <div className="filtro-periodo-grade">
            {DIAS_DA_SEMANA.map((d, i) => <span key={i} className="filtro-periodo-semana">{d}</span>)}
            {dias.map(d => {
              const dentro = !!ini && !!fim && d.iso >= ini && d.iso <= fim;
              const ponta = d.iso === ini || d.iso === fim;
              return (
                <button key={d.iso} type="button"
                  className={[
                    'filtro-periodo-dia',
                    d.doMes ? '' : 'fora',
                    dentro ? 'dentro' : '',
                    ponta && dentro ? 'ponta' : '',
                    d.iso === ini && dentro ? 'inicio' : '',
                    d.iso === fim && dentro ? 'fim' : '',
                    d.iso === hoje ? 'hoje' : '',
                  ].filter(Boolean).join(' ')}
                  aria-label={d.iso.split('-').reverse().join('/')}
                  aria-pressed={dentro}
                  onMouseEnter={() => comeco && setSob(d.iso)}
                  onClick={() => escolher(d.iso)}>
                  {d.dia}
                </button>
              );
            })}
          </div>

          <div className="filtro-periodo-pe">
            <span className="filtro-periodo-dica">
              {comeco ? 'Agora o último dia' : 'Clique no primeiro dia, depois no último'}
            </span>
            {ativo && (
              <button type="button" className="filtro-periodo-limpar"
                onClick={() => { onChange('', ''); fechar(); }}>
                Limpar
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
