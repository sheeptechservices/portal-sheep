// ─────────────────────────────────────────────────────────────────────────────
//  Por onde a lista de entregas se reparte.
//
//  Dois níveis, escolhidos na tela: um grupo maior e, dentro dele, um menor.
//  Antes havia uma opção fixa de "marcador e submarcador", que era a única
//  combinação possível - e a hierarquia é decisão de quem está lendo, não do
//  sistema. Marcador dentro de responsável e situação dentro de marcador são
//  perguntas igualmente legítimas.
//
//  As regras moram aqui porque o painel e a página do cliente repartem a mesma
//  entrega e têm de chegar aos mesmos grupos. O que muda entre os dois é só o
//  desenho do seletor, e isso fica em cada tela.
// ─────────────────────────────────────────────────────────────────────────────

export type Dimensao = 'nenhum' | 'status' | 'marcador' | 'submarcador' | 'responsavel';

/** O que se oferece nos dois níveis. "Nenhum" no maior desliga o agrupamento;
 *  no menor, deixa um nível só. */
export const DIMENSOES: { valor: Dimensao; label: string }[] = [
  { valor: 'nenhum', label: 'Nenhum' },
  { valor: 'status', label: 'Situação' },
  { valor: 'marcador', label: 'Marcador' },
  { valor: 'submarcador', label: 'Submarcador' },
  { valor: 'responsavel', label: 'Responsável' },
];

/** O balde de quem não foi classificado naquela dimensão. Vai sempre para o fim
 *  da lista: o que ninguém preencheu não abre a leitura. */
export const SOBRA: Record<Dimensao, string> = {
  nenhum: '',
  status: '',
  marcador: 'Sem marcador',
  submarcador: 'Sem submarcador',
  responsavel: 'Sem responsável',
};

/** A entrega vista pelo agrupamento: só o que ele precisa saber dela. */
export interface Agrupavel {
  status: string;
  marcador: string | null;
  submarcador: string | null;
}

/** Em que grupos a entrega entra, naquela dimensão. Responsável devolve mais de
 *  um: entrega de duas pessoas aparece nas duas, porque é das duas, e esconder
 *  uma cópia faria o time procurar o que é dele e não achar.
 *
 *  `donos` vem de fora porque cada tela guarda o responsável de um jeito - id no
 *  painel, nome já resolvido na página do cliente. */
export function chavesDe(e: Agrupavel, dim: Dimensao, donos: () => string[]): string[] {
  if (dim === 'status') return [e.status];
  if (dim === 'marcador') return [(e.marcador ?? '').trim() || SOBRA.marcador];
  if (dim === 'submarcador') return [(e.submarcador ?? '').trim() || SOBRA.submarcador];
  if (dim === 'responsavel') {
    const nomes = donos();
    return nomes.length ? nomes : [SOBRA.responsavel];
  }
  return [''];
}

/** Como os títulos de grupo se ordenam. Situação segue a escala do fluxo, e não
 *  a ordem alfabética: "Bloqueada" antes de "Planejada" inverteria a leitura do
 *  andamento. O resto é alfabético, com o balde de sobra no fim. */
export function comparadorDe(dim: Dimensao, escalaDeStatus: readonly string[]) {
  if (dim === 'status') {
    return (a: string, b: string) => escalaDeStatus.indexOf(a) - escalaDeStatus.indexOf(b);
  }
  const sobra = SOBRA[dim];
  return (a: string, b: string) => (
    a === sobra ? 1 : b === sobra ? -1 : a.localeCompare(b, 'pt-BR'));
}

/** O que a linha ainda precisa dizer sobre onde a entrega vive: os níveis que
 *  nenhum cabeçalho de grupo está dizendo. Agrupado por marcador, a linha mostra
 *  a área; pelos dois, não mostra nada. */
export function marcaDaLinha(e: Agrupavel, niveis: Dimensao[]): string {
  const nosCabecalhos = new Set(niveis);
  return [
    nosCabecalhos.has('marcador') ? null : e.marcador,
    nosCabecalhos.has('submarcador') ? null : e.submarcador,
  ].filter(Boolean).join(' · ');
}
