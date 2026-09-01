// Papéis que uma pessoa pode ter na equipe de um projeto.
//
// Mora aqui, e não na tela de Projetos, porque quatro telas precisam da mesma
// lista: Projetos monta a equipe, Configurações diz quais papéis enxergam cada
// etiqueta, Tarefas usa o papel para decidir o que oferecer, e a página do
// cliente ordena a equipe por ela. Uma cópia por tela divergiria na primeira
// vez que um papel novo aparecesse.
//
// Não confundir com `src/admin/papeis.ts`, que trata do papel no **sistema**
// (membro, master, admin). Este é o papel no **projeto**.
//
// A ordem da lista é a mesma dos degraus abaixo: uma ordem só, para o seletor e
// a exibição não discordarem. `Outro` fica por último de propósito - é o escape
// para o que a lista não prevê, e escape no meio convida a parar de procurar.
export const PAPEIS_EQUIPE = [
  'Comercial', 'Gestor', 'Dev', 'Designer', 'Analista', 'QA', 'Outro',
] as const;

export type PapelEquipe = typeof PAPEIS_EQUIPE[number];

/**
 * Degraus de proximidade com o cliente, do mais perto ao mais longe.
 *
 * **Não é hierarquia de importância nem de senioridade.** É a ordem em que as
 * pessoas aparecem para quem está do lado de fora: quem abre a conversa, quem
 * conduz o projeto, quem executa e quem valida. O rótulo de cada degrau existe
 * justamente para essa leitura não virar organograma.
 */
export const NIVEIS_DE_CONTATO: { rotulo: string; papeis: PapelEquipe[] }[] = [
  { rotulo: 'Fala com o cliente', papeis: ['Comercial'] },
  { rotulo: 'Conduz o projeto', papeis: ['Gestor'] },
  { rotulo: 'Executa', papeis: ['Dev', 'Designer', 'Analista'] },
  { rotulo: 'Valida', papeis: ['QA'] },
  { rotulo: 'Apoio', papeis: ['Outro'] },
];

/** Em que degrau está o papel. Papel desconhecido - de uma versão antiga, ou
 *  escrito à mão no banco - cai no último, e não some da tela. */
export function nivelDoPapel(papel: string | null | undefined): number {
  const i = NIVEIS_DE_CONTATO.findIndex(n => n.papeis.includes(papel as PapelEquipe));
  return i < 0 ? NIVEIS_DE_CONTATO.length - 1 : i;
}

/** A equipe repartida em degraus, na ordem de contato, sem os degraus vazios. */
export function porNivelDeContato<T>(
  membros: T[],
  papelDe: (m: T) => string,
): { rotulo: string; papeis: PapelEquipe[]; membros: T[] }[] {
  return NIVEIS_DE_CONTATO
    .map((n, i) => ({ ...n, membros: membros.filter(m => nivelDoPapel(papelDe(m)) === i) }))
    .filter(n => n.membros.length > 0);
}
