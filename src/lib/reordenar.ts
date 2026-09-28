/**
 * Mover um item de lugar numa lista, arrastando.
 *
 * A conta tem uma pegadinha só, e é sempre a mesma: tirar o item da posição
 * antiga desloca tudo o que vinha depois dele. Sem o ajuste, arrastar para
 * baixo solta o item uma linha antes do que a pessoa viu marcado.
 *
 * `lado` é de que metade da linha alvo o cursor estava: acima do meio, o item
 * entra antes dela; abaixo, depois. É o mesmo sinal que o fio do indicador
 * mostra enquanto se arrasta.
 *
 * Devolve a mesma lista quando nada mudaria de lugar, e é isso que deixa quem
 * chama decidir não gravar nada.
 */
export function moverNaLista<T>(
  lista: readonly T[], origem: number, destino: number, lado: 'antes' | 'depois',
): T[] {
  const copia = [...lista];
  if (origem < 0 || origem >= copia.length || destino < 0 || destino >= copia.length) return copia;
  const [movido] = copia.splice(origem, 1);
  let pos = destino + (lado === 'depois' ? 1 : 0);
  if (origem < pos) pos--;
  copia.splice(pos, 0, movido);
  return copia;
}

/** A lista ficou como estava? Compara item a item, por referência: é o que
 *  responde "vale a pena gravar isto?". */
export function mesmaOrdem<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
