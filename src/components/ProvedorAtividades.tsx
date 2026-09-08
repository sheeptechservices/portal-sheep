// ─────────────────────────────────────────────────────────────────────────────
//  O provedor das atividades em segundo plano, e o balão que as mostra.
//
//  Fica acima das páginas, então a ação sobrevive a fechar a gaveta, a fechar o
//  modal e a trocar de página dentro do portal. O balão mora no canto superior
//  direito - o oposto dos toasts, que ficam embaixo: um conta o que está
//  acontecendo, o outro o que acabou de acontecer, e misturar os dois cantos
//  faria um empurrar o outro.
//
//  Ao concluir, o balão sai e o toast entra. É a mesma notícia em dois tempos:
//  enquanto corre, ela mora no canto de cima; quando termina, vira confirmação.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AtividadesContext, type Atividade, type Trabalho } from '../lib/atividades';
import { useToast } from '../lib/toast';
import { Dialogo } from './Dialogo';
import { IconSpinner, IconX } from './icons';

/** O tempo que o balão fica na lista depois de mandado embora. É maior que a
 *  transição de saída (240ms) de propósito: tirá-lo da lista antes do fim
 *  cortaria os últimos quadros, e o sumiço voltaria a ser um corte. */
const SAIDA_MS = 300;

export function ProvedorAtividades({ children, navegar }: {
  children: React.ReactNode;
  /** Leva à página onde a ação nasceu. Vem da casca, que é quem sabe navegar. */
  navegar?: (pagina: string) => void;
}) {
  const { toast } = useToast();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  /** Os controles de aborto e as marcas de cancelamento, por id. Em ref, e não
   *  em estado: mexer neles não redesenha nada. */
  const controles = useRef(new Map<string, AbortController>());
  const canceladas = useRef(new Set<string>());

  const tirar = useCallback((id: string) => {
    setAtividades(l => l.map(a => (a.id === id ? { ...a, saindo: true } : a)));
    window.setTimeout(() => {
      setAtividades(l => l.filter(a => a.id !== id));
      controles.current.delete(id);
    }, SAIDA_MS);
  }, []);

  const cancelar = useCallback((id: string) => {
    canceladas.current.add(id);
    controles.current.get(id)?.abort();
    tirar(id);
  }, [tirar]);

  const [perguntando, setPerguntando] = useState<Atividade | null>(null);

  const abrirOrigem = useCallback((a: Atividade) => {
    if (a.pagina) navegar?.(a.pagina);
    a.abrir?.();
  }, [navegar]);

  const iniciar = useCallback((
    { titulo, onde, pagina, abrir, aviso }: {
      titulo: string; onde?: string; pagina?: string; abrir?: () => void; aviso?: string;
    },
  ): Trabalho => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const controle = new AbortController();
    controles.current.set(id, controle);
    setAtividades(l => [...l, { id, titulo, onde, pagina, abrir, aviso, detalhe: null, progresso: null }]);

    const encerrar = (tipo: 'success' | 'error', t: string, m?: string) => {
      // Cancelada por quem clicou não vira aviso nenhum: a pessoa acabou de
      // ver o balão sumir, e um toast depois disso seria o sistema dando
      // notícia de uma decisão dela.
      if (canceladas.current.has(id)) { canceladas.current.delete(id); return; }
      tirar(id);
      toast(tipo, t, m);
    };

    return {
      id,
      sinal: controle.signal,
      foiCancelada: () => canceladas.current.has(id),
      andar: (progresso, detalhe) => setAtividades(l => l.map(a => (
        a.id === id ? { ...a, progresso, detalhe: detalhe === undefined ? a.detalhe : detalhe } : a
      ))),
      mostrarBalao: (v) => setAtividades(l => l.map(a => (a.id === id ? { ...a, oculta: !v } : a))),
      concluir: (t, m) => encerrar('success', t, m),
      falhar: (t, m) => encerrar('error', t, m),
    };
  }, [tirar, toast]);

  const valor = useMemo(() => ({ atividades, iniciar, cancelar }), [atividades, iniciar, cancelar]);

  return (
    <AtividadesContext.Provider value={valor}>
      {children}
      <BalaoAtividades atividades={atividades} onAbrir={abrirOrigem}
        onPedirCancelamento={setPerguntando} />

      {/* Cancelar é sem volta: o que já foi feito do outro lado fica feito, e o
          que estava em curso se perde. Por isso a pergunta antes. */}
      {perguntando && (
        <Dialogo
          titulo="Cancelar esta atividade?"
          descricao={perguntando.aviso
            ?? 'O que já estiver gravado do outro lado continua gravado; o que estava em curso se perde.'}
          rotuloOk="Cancelar a atividade"
          rotuloCancelar="Deixar rodando"
          zIndex={100001}
          onFechar={() => setPerguntando(null)}
          onConfirmar={() => { cancelar(perguntando.id); setPerguntando(null); }}
        />
      )}
    </AtividadesContext.Provider>
  );
}

function BalaoAtividades({ atividades, onAbrir, onPedirCancelamento }: {
  atividades: Atividade[];
  onAbrir: (a: Atividade) => void;
  onPedirCancelamento: (a: Atividade) => void;
}) {
  if (!atividades.length) return null;
  // Todas entram na árvore, inclusive as escondidas e as que estão saindo: quem
  // decide aparecer é cada balão, porque é ele que tem de animar a ida e a
  // volta. Filtrar aqui faria a peça sumir de estalo.
  return createPortal(
    <div className="atividades-cais">
      {atividades.map(a => (
        <Balao key={a.id} atividade={a} onAbrir={onAbrir} onPedirCancelamento={onPedirCancelamento} />
      ))}
    </div>,
    document.body,
  );
}

function Balao({ atividade: a, onAbrir, onPedirCancelamento }: {
  atividade: Atividade;
  onAbrir: (a: Atividade) => void;
  onPedirCancelamento: (a: Atividade) => void;
}) {
  // O balão fica montado enquanto a atividade existir, e o que entra e sai é a
  // classe: assim esconder e mostrar de novo - fechar e reabrir a gaveta - é uma
  // transição que se inverte no meio do caminho, e não um corte seguido de outro.
  //
  // A classe entra um quadro depois da montagem, para o navegador ter o estado
  // inicial pintado e ter o que interpolar. O `setTimeout` é a rede: em aba
  // escondida o `requestAnimationFrame` não roda, e sem ele o balão ficaria
  // invisível para sempre - justamente na aba de onde a pessoa saiu.
  const visivel = !a.oculta && !a.saindo;
  const [dentro, setDentro] = useState(false);
  useEffect(() => {
    if (!visivel) { setDentro(false); return; }
    let segundo = 0;
    const primeiro = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setDentro(true));
    });
    const rede = window.setTimeout(() => setDentro(true), 250);
    return () => {
      cancelAnimationFrame(primeiro);
      if (segundo) cancelAnimationFrame(segundo);
      window.clearTimeout(rede);
    };
  }, [visivel]);

  return (
    <div className={`atividade-balao${dentro ? ' aberta' : ''}`} aria-hidden={!dentro}>
      {/* O balão inteiro é o caminho de volta: clicar leva ao lugar onde a
          ação está acontecendo. */}
      <button type="button" className="atividade-abre" onClick={() => onAbrir(a)}
        title="Ir para onde isto está acontecendo">
        <span className="atividade-girinho"><IconSpinner size={13} /></span>
        <span className="atividade-texto">
          <strong>{a.titulo}</strong>
          <small className="troca" key={a.detalhe ?? a.onde ?? ''}>
            {a.detalhe ?? a.onde ?? 'Em andamento'}
          </small>
          {/* Sem fração conhecida, a barra anda sozinha: ela diz "estou viva",
              que é verdade, em vez de uma porcentagem inventada. */}
          <span className={`atividade-trilho${a.progresso == null ? ' indefinida' : ''}`}>
            <span className="atividade-tinta"
              style={a.progresso == null ? undefined : { width: `${Math.round(a.progresso * 100)}%` }} />
          </span>
        </span>
      </button>
      <button type="button" className="atividade-cancelar" onClick={() => onPedirCancelamento(a)}
        aria-label={`Cancelar: ${a.titulo}`} title="Cancelar">
        <IconX size={11} />
      </button>
    </div>
  );
}
