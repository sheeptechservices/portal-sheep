// Papéis que uma pessoa pode ter na equipe de um projeto.
//
// Mora aqui, e não na tela de Projetos, porque três telas precisam da mesma
// lista: Projetos monta a equipe, Configurações diz quais papéis enxergam cada
// etiqueta, e Tarefas usa o papel para decidir o que oferecer. Uma cópia por
// tela divergiria na primeira vez que um papel novo aparecesse.
//
// Não confundir com `src/admin/papeis.ts`, que trata do papel no **sistema**
// (membro, master, admin). Este é o papel no **projeto**.
// `Outro` fica por último de propósito: é o escape para o que a lista não
// prevê, e escape no meio da lista convida a parar de procurar.
export const PAPEIS_EQUIPE = [
  'Gestor', 'Comercial', 'Dev', 'Designer', 'Analista', 'QA', 'Outro',
] as const;

export type PapelEquipe = typeof PAPEIS_EQUIPE[number];
