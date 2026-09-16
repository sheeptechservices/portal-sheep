/** Texto pronto para comparar: sem acento e em minúsculas.
 *
 *  Quem busca digita "reuniao" e "analise", e a lista tem "reunião" e "análise".
 *  Comparar as duas formas cruas não casa nada, e cada tela que tentou resolver
 *  isso sozinha escreveu a mesma linha de novo. */
export function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR');
}

/** O texto contém o termo, ignorando acento e caixa. Termo vazio casa com tudo:
 *  busca em branco não filtra nada. */
export function contemTermo(texto: string | null | undefined, termo: string): boolean {
  const q = semAcento(termo.trim());
  if (!q) return true;
  return semAcento(String(texto ?? '')).includes(q);
}
