import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type RefObject } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
//  O movimento do arraste nos quadros (Tarefas e Funil).
//
//  O arraste é o nativo do navegador; o que este módulo põe por cima é a
//  resposta do quadro ao gesto:
//
//  - o cartão pego fica no lugar, apagado, e o fantasma que segue o ponteiro
//    sai levemente inclinado, como papel levantado da mesa;
//  - a coluna que vai receber abre uma vaga na altura do ponteiro, e os
//    cartões de baixo deslizam para dar lugar a ela, seguindo o ponteiro;
//  - ao soltar, quem mudou de lugar desliza até a posição nova (a coluna de
//    origem fecha o buraco, a de destino acomoda), e o cartão que chegou
//    pousa com um brilho em limão.
//
//  A vaga é só desenho: a ordem dentro da coluna continua sendo a da ordenação
//  escolhida, e o cartão pousa onde ela manda.
// ─────────────────────────────────────────────────────────────────────────────

/** O que se sabe do arraste em curso. Um por vez na tela, então cabe no módulo. */
const arraste = {
  altura: 0,
  coluna: null as string | null,
  el: null as HTMLElement | null,
  /** O cartão que acabou de ser solto: só ele pousa com brilho. Cartão que
   *  aparece por outro motivo (filtro, busca) não chega fazendo festa. */
  pousando: null as string | null,
};
let limparPouso: ReturnType<typeof setTimeout> | undefined;

/** Espaço entre os cartões na coluna (o `gap` do `.kanban-column-body`). */
const VAO = 6;

const calmo = () => typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * No `dragstart` do cartão: guarda a altura e a coluna de origem, apaga o
 * original e usa como imagem do arraste uma cópia inclinada.
 */
export function comecarArraste(e: DragEvent<HTMLElement>, coluna: string) {
  const el = e.currentTarget;
  arraste.altura = el.offsetHeight;
  arraste.coluna = coluna;
  arraste.el = el;
  arraste.pousando = el.dataset.flip ?? null;
  clearTimeout(limparPouso);
  e.dataTransfer.effectAllowed = 'move';
  try {
    const r = el.getBoundingClientRect();
    const copia = el.cloneNode(true) as HTMLElement;
    copia.classList.add('kanban-card-fantasma');
    copia.style.width = `${r.width}px`;
    copia.style.height = `${r.height}px`;
    document.body.appendChild(copia);
    e.dataTransfer.setDragImage(copia, e.clientX - r.left, e.clientY - r.top);
    // O navegador fotografa a imagem no mesmo quadro; depois ela pode sair.
    requestAnimationFrame(() => copia.remove());
  } catch { /* sem setDragImage, fica a prévia padrão */ }
  // Apaga o original no quadro seguinte: no mesmo, a foto do arraste sairia
  // apagada também.
  requestAnimationFrame(() => el.classList.add('sendo-arrastado'));
  document.body.classList.add('quadro-arrastando');
}

/** No `dragend` do cartão, tenha ele caído onde for. */
export function terminarArraste() {
  arraste.el?.classList.remove('sendo-arrastado');
  arraste.el = null;
  arraste.coluna = null;
  document.body.classList.remove('quadro-arrastando');
  // A gravação é otimista e a coluna nova pinta no mesmo gesto; a folga cobre
  // um render atrasado sem deixar o pouso valendo para sempre.
  clearTimeout(limparPouso);
  limparPouso = setTimeout(() => { arraste.pousando = null; }, 3000);
}

/**
 * A vaga que a coluna abre para o cartão que chega. `sobre` vai no
 * `dragover` da coluna; `estiloDoCard(i)` empurra os cartões dali para baixo;
 * `vaga` é o retângulo tracejado, para pôr dentro do corpo da coluna.
 */
export function useVagaDaColuna(corpo: RefObject<HTMLElement>, coluna: string, recebendo: boolean) {
  const [vaga, setVaga] = useState<{ indice: number; topo: number } | null>(null);

  useEffect(() => { if (!recebendo) setVaga(null); }, [recebendo]);
  // Qualquer fim de arraste fecha a vaga, inclusive o cancelado (Escape ou
  // soltar fora): nem todo quadro limpa a coluna "sob o ponteiro" nesse caso.
  useEffect(() => {
    const fechar = () => setVaga(null);
    document.addEventListener('dragend', fechar);
    document.addEventListener('drop', fechar);
    return () => {
      document.removeEventListener('dragend', fechar);
      document.removeEventListener('drop', fechar);
    };
  }, []);

  const sobre = useCallback((clientY: number) => {
    const el = corpo.current;
    // A coluna de onde o cartão saiu não abre vaga: a ordem é a da ordenação,
    // e soltar ali não muda nada.
    if (!el || arraste.coluna === null || arraste.coluna === coluna) { setVaga(v => (v ? null : v)); return; }
    const cartoes = [...el.querySelectorAll<HTMLElement>(':scope > [data-flip]')];
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop;
    // offsetTop é a posição de layout, sem o deslocamento da vaga: o cálculo
    // não corre atrás do próprio empurrão.
    let indice = cartoes.findIndex(c => y < c.offsetTop + c.offsetHeight / 2);
    if (indice < 0) indice = cartoes.length;
    const ref = cartoes[indice];
    const ultimo = cartoes[cartoes.length - 1];
    const topo = ref ? ref.offsetTop
      : ultimo ? ultimo.offsetTop + ultimo.offsetHeight + VAO
      : parseFloat(getComputedStyle(el).paddingTop) || 8;
    setVaga(v => (v && v.indice === indice && v.topo === topo ? v : { indice, topo }));
  }, [corpo, coluna]);

  const espaco = arraste.altura + VAO;
  const estiloDoCard = (i: number): CSSProperties | undefined =>
    (vaga && i >= vaga.indice ? { transform: `translateY(${espaco}px)` } : undefined);

  const desenho = vaga ? (
    <div className="kanban-vaga" aria-hidden="true"
      style={{ top: vaga.topo, height: arraste.altura }} />
  ) : null;

  return {
    sobre,
    estiloDoCard,
    vaga: desenho,
    /** Classe e folga do corpo enquanto a vaga está aberta. */
    corpoComVaga: vaga ? { classe: ' com-vaga', estilo: { paddingBottom: espaco + 8 } as CSSProperties } : null,
  };
}

/**
 * Os cartões que mudaram de lugar entre um render e outro deslizam até a
 * posição nova (FLIP), e os que acabaram de chegar pousam. Com `pausado`
 * (durante o arraste) só mede: quem anima ali é a vaga.
 */
export function useMovimentoDosCartoes(corpo: RefObject<HTMLElement>, pausado: boolean) {
  const antes = useRef<Map<string, { x: number; y: number }> | null>(null);
  const assinatura = useRef('');
  const estavaPausado = useRef(false);
  useLayoutEffect(() => {
    const el = corpo.current;
    if (!el) return;
    // Ler os ids não custa layout; medir posição custa. A tela re-renderiza a
    // cada tecla da busca e a cada atualização de fundo, e sem esta guarda
    // cada coluna mediria todos os cartões toda vez. Mede só quando a lista
    // mudou, quando o arraste começa ou acaba, e durante o arraste.
    const sig = [...el.querySelectorAll<HTMLElement>(':scope > [data-flip]')].map(c => c.dataset.flip).join(',');
    const mudou = sig !== assinatura.current || pausado !== estavaPausado.current;
    assinatura.current = sig;
    estavaPausado.current = pausado;
    if (!mudou && !pausado && antes.current) return;
    const base = el.getBoundingClientRect();
    const agora = new Map<string, { x: number; y: number }>();
    const parado = calmo();
    el.querySelectorAll<HTMLElement>(':scope > [data-flip]').forEach(c => {
      const id = c.dataset.flip!;
      const r = c.getBoundingClientRect();
      // Posição dentro do conteúdo da coluna: rolar a coluna não é mover.
      const p = { x: r.left - base.left, y: r.top - base.top + el.scrollTop };
      agora.set(id, p);
      if (pausado || parado || !antes.current) return;
      const a = antes.current.get(id);
      if (a) {
        const dx = a.x - p.x;
        const dy = a.y - p.y;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          c.animate(
            [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
            { duration: 380, easing: 'cubic-bezier(.2, .8, .2, 1)' },
          );
        }
      } else if (id === arraste.pousando) {
        arraste.pousando = null;
        // Chegou agora: pousa crescendo de leve, com o brilho da marca.
        c.animate(
          [
            { transform: 'scale(.9) translateY(-8px)', opacity: 0, boxShadow: '0 0 0 2px var(--yellow), 0 18px 40px -12px rgba(0,0,0,.6)' },
            { transform: 'scale(1.02)', opacity: 1, offset: .55, boxShadow: '0 0 0 2px var(--yellow), 0 18px 40px -12px rgba(0,0,0,.6)' },
            { transform: 'none', opacity: 1, boxShadow: '0 0 0 0 transparent' },
          ],
          { duration: 620, easing: 'cubic-bezier(.34, 1.4, .64, 1)' },
        );
      }
    });
    antes.current = agora;
  });
}
