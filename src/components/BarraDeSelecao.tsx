// ─────────────────────────────────────────────────────────────────────────────
//  A barra do que está selecionado.
//
//  Aparece no pé da tela quando há uma ou mais peças marcadas e reúne o que se
//  faz com todas de uma vez: mover, trocar a prioridade, trocar o dono, excluir.
//  Fica fixa no rodapé, fora do quadro, porque a seleção atravessa colunas e
//  grupos - presa a um deles, ela sumiria ao rolar para o outro.
//
//  Ela não decide nada sobre o que está marcado: quem monta diz quais ações
//  existem e o que cada uma faz. A barra cuida só do desenho, da entrada, da
//  saída e das listas que abrem a partir dela.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { useRevelar } from '../lib/useRevelar';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

export function BarraDeSelecao({ total, singular, plural, onLimpar, children }: {
  total: number;
  /** "tarefa selecionada" / "tarefas selecionadas". */
  singular: string;
  plural: string;
  onLimpar: () => void;
  children: ReactNode;
}) {
  // Montada um quadro antes de aparecer e desmontada depois de sair: sem isso
  // a barra nasceria e sumiria de estalo, justo no gesto de marcar e desmarcar.
  const { montado, aberto } = useRevelar(total > 0, 200);
  // Na saída o total já é zero; a barra que está indo embora continua dizendo
  // o número que tinha, em vez de mostrar "0 selecionadas" por um instante.
  const ultimo = useRef(total);
  if (total > 0) ultimo.current = total;
  if (!montado) return null;
  const n = ultimo.current;

  return createPortal(
    <div className={`barra-selecao${aberto ? ' aberta' : ''}`} role="toolbar"
      aria-label={`Ações para ${n} ${n === 1 ? singular : plural}`}>
      <span className="barra-selecao-conta">
        <strong>{n}</strong> {n === 1 ? singular : plural}
      </span>
      <span className="barra-selecao-divisor" aria-hidden="true" />
      {children}
      <span className="barra-selecao-divisor" aria-hidden="true" />
      <button type="button" className="barra-selecao-fechar" onClick={onLimpar}
        title="Limpar a seleção (Esc)" aria-label="Limpar a seleção">
        <IconX size={13} />
      </button>
    </div>,
    document.body,
  );
}

/** A caixa de marcar de um card ou de uma linha. O clique para nela: chegando
 *  ao card, ele abriria a ficha junto. */
export function CaixaDeMarcar({ marcada, rotulo, onMarcar }: {
  marcada: boolean;
  /** O nome da peça, para o leitor de tela dizer o que está marcando. */
  rotulo: string;
  onMarcar: (intervalo: boolean) => void;
}) {
  return (
    <label className="tarefa-marcar" title="Selecionar (Shift marca o intervalo)"
      onClick={e => e.stopPropagation()}>
      <input type="checkbox" className="form-checkbox" checked={marcada}
        aria-label={`Selecionar "${rotulo}"`}
        onClick={e => { e.stopPropagation(); onMarcar(e.shiftKey); }}
        onChange={() => { /* o clique já marcou */ }} />
    </label>
  );
}

export interface OpcaoDaBarra {
  valor: string;
  label: string;
  icone?: ReactNode;
}

/** Um botão da barra. Com `opcoes`, abre uma lista para cima - a barra mora no
 *  pé da tela, e abrir para baixo jogaria a lista para fora dela. Sem opções, é
 *  uma ação direta. */
export function AcaoDaBarra({ rotulo, icone, opcoes, onEscolher, onClick, perigo }: {
  rotulo: string;
  icone: ReactNode;
  opcoes?: OpcaoDaBarra[];
  onEscolher?: (valor: string) => void;
  onClick?: () => void;
  perigo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState({ bottom: 0, left: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  // A mesma régua das listas da casa: acima de sete opções entra a busca.
  const buscando = (opcoes?.length ?? 0) > 7;
  const semAcento = (t: string) =>
    t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
  const q = semAcento(busca.trim());
  const filtradas = (opcoes ?? []).filter(o => !q || semAcento(o.label).includes(q));

  function clicar() {
    if (!opcoes) { onClick?.(); return; }
    const r = gatilho.current!.getBoundingClientRect();
    // Ancorada pela base, no topo do botão: a lista cresce para cima, e
    // filtrar a encolhe sem tirá-la de perto do gatilho.
    setPos({
      bottom: window.innerHeight - r.top + 6,
      left: Math.max(8, Math.min(r.left, window.innerWidth - 228)),
    });
    setBusca('');
    setAberto(a => !a);
  }

  function escolher(valor: string) {
    setAberto(false);
    onEscolher?.(valor);
  }

  return (
    <>
      <button ref={gatilho} type="button"
        className={`barra-selecao-acao${perigo ? ' perigo' : ''}`}
        onClick={clicar} title={rotulo} aria-label={rotulo}
        aria-expanded={opcoes ? aberto : undefined}
        aria-haspopup={opcoes ? 'listbox' : undefined}>
        {icone}
        <span className="barra-selecao-rotulo">{rotulo}</span>
      </button>
      {aberto && opcoes && createPortal(
        <div ref={lista} className="status-select-dropdown" role="listbox" aria-label={rotulo}
          style={{ bottom: pos.bottom, left: pos.left, top: 'auto', minWidth: 220, zIndex: 10050 }}>
          {buscando && (
            <input autoFocus className="form-input" value={busca} placeholder="Buscar"
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { e.stopPropagation(); setAberto(false); }
                if (e.key === 'Enter' && filtradas.length === 1) { e.preventDefault(); escolher(filtradas[0].valor); }
              }}
              style={{ height: 32, fontSize: 12.5, marginBottom: 4 }} />
          )}
          {filtradas.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, padding: '6px 8px' }}>
              Nada com esse nome.
            </p>
          )}
          {filtradas.map(o => (
            <div key={o.valor} role="option" aria-selected={false} className="status-select-option"
              onClick={() => escolher(o.valor)}>
              {o.icone && <span style={{ display: 'inline-flex' }}>{o.icone}</span>}
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
