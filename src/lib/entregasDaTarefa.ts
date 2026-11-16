/** As entregas de uma tarefa, com a principal (`entrega_id`) na frente.
 *
 *  A tarefa pode servir a mais de uma entrega, como pode servir a mais de um
 *  projeto, e conta no progresso de cada uma. Tarefa gravada antes de a lista
 *  existir só tem a principal. Mora aqui, e não numa página, porque Tarefas e
 *  Projetos usam a mesma regra e uma página não deve puxar a outra para o
 *  próprio pacote. */
export function entregasDa(t: { entrega_id: number | null; entregas?: number[] }): number[] {
  const lista = t.entregas?.length ? t.entregas : [];
  return [...new Set([...(t.entrega_id != null ? [t.entrega_id] : []), ...lista])];
}
