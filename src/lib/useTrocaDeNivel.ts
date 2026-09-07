// ─────────────────────────────────────────────────────────────────────────────
//  Troca de nível: o hub, a ferramenta, e o que a ferramenta abre por dentro.
//
//  É o mesmo dois-tempos da troca entre login e painel (`tela-sai` e
//  `tela-entra`, no main.css): quem sai roda a saída e só então quem chega
//  monta com a entrada. A diferença é que aqui a troca tem sentido - descer um
//  nível não é a mesma coisa que voltar -, então a peça sai para um lado e a
//  seguinte chega do outro. Sem isso, ir e voltar teriam a mesma cara e o
//  movimento não diria nada.
//
//  Nem toda troca tem sentido, e forçar um para ela seria mentir: ir do
//  Dashboard para o Funil não é descer nem voltar, é trocar de assunto. Duas
//  páginas de mesma profundidade se substituem de lado, sem deslocamento - a
//  peça não veio de canto nenhum, ela só mudou de cara. Devolver `null` para um
//  valor tira aquela troca da animação de vez.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';

/** Espelhado em `.nivel-sai-*`, no main.css. */
const SAIDA_MS = 130;

export function useTrocaDeNivel<T>(
  valor: T,
  profundidade: (v: T) => number | null,
  ms = SAIDA_MS,
) {
  const [mostrado, setMostrado] = useState(valor);
  const [fase, setFase] = useState<'parado' | 'saindo' | 'entrando'>('parado');
  // Num ref, e não em estado: a direção é lida no mesmo render em que a fase
  // muda, e um segundo `set` faria a saída começar sem ela.
  const direcao = useRef<'fundo' | 'volta' | 'lado'>('fundo');

  useEffect(() => {
    if (valor === mostrado) return;
    const de = profundidade(mostrado);
    const para = profundidade(valor);
    const semMovimento = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (de == null || para == null || semMovimento) {
      setMostrado(valor);
      setFase('parado');
      return;
    }
    direcao.current = de === para ? 'lado' : para > de ? 'fundo' : 'volta';
    setFase('saindo');
    const t = setTimeout(() => { setMostrado(valor); setFase('entrando'); }, ms);
    return () => clearTimeout(t);
  }, [valor, mostrado, profundidade, ms]);

  return {
    /** O nível que está na tela - atrasado do pedido enquanto a saída roda. */
    mostrado,
    /** Vai no contêiner do conteúdo, junto de `nivel`. */
    classe: fase === 'parado'
      ? ''
      : `nivel-${fase === 'saindo' ? 'sai' : 'entra'}-${direcao.current}`,
  };
}
