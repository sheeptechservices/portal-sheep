// ─────────────────────────────────────────────────────────────────────────────
//  Onde uma lista de dropdown deve nascer.
//
//  Fora das telas porque três delas usam: Projetos, o formulário de tarefa e o
//  que mais vier. Importá-la de uma página fecharia um ciclo de módulos.
// ─────────────────────────────────────────────────────────────────────────────

/** Onde a lista de um dropdown deve nascer. Ela vive num portal no `body`, e
 *  portal não é cortado por `overflow` - mas nada impede que passe da borda da
 *  janela. Na vertical: sem espaço embaixo e com espaço em cima, abre para
 *  cima. Na horizontal: gatilho estreito e encostado na direita empurraria a
 *  lista para fora, então o canto é preso dentro da janela. */
export function ancorar(el: HTMLElement, itens: number, larguraMin = 150) {
  const r = el.getBoundingClientRect();
  const MARGEM = 8;
  const altura = Math.min(MARGEM + itens * 36, 320);
  const cabeAbaixo = window.innerHeight - r.bottom - MARGEM >= altura;
  // Largura fixa, e não mínima: com `minWidth` a caixa cresce com o conteúdo
  // (um email longo, por exemplo) e passa do tamanho que este cálculo reservou,
  // furando o limite abaixo. Quem usa isto precisa cortar o texto com
  // reticências.
  const width = Math.min(Math.max(r.width, larguraMin), window.innerWidth - 2 * MARGEM);
  return {
    top: cabeAbaixo || r.top < altura ? r.bottom + 4 : r.top - altura - 4,
    left: Math.max(MARGEM, Math.min(r.left, window.innerWidth - width - MARGEM)),
    width,
  };
}
