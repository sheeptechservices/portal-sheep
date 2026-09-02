// ─────────────────────────────────────────────────────────────────────────────
//  O estado de uma entrega, deduzido das tarefas dela.
//
//  Mora aqui, e não dentro do handler do painel, porque a página do cliente lê
//  a mesma entrega e precisa chegar ao mesmo resultado. Enquanto esta regra
//  viveu só do lado de dentro, o painel mostrava "Em andamento" e o cliente
//  continuava vendo "Planejada" na mesma entrega, com o mesmo banco.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';

/** As etapas de tarefa são configuráveis em Configurações > Etapas, então o
 *  que antes eram constantes agora é uma leitura. `entrada` é a etapa em que a
 *  tarefa nasce, e `conclusivas` são as que contam como trabalho terminado -
 *  é delas que sai o percentual da entrega. */
export interface EtapasDeTarefa {
  nomes: string[];
  entrada: string;
  /** A etapa de conversão: "feito". Conjunto por comodidade de consulta, mas a
   *  marcação é exclusiva, como a estrela do funil. */
  conclusivas: Set<string>;
  /** Etapas desconsideradas. Tarefa aqui não entra na conta da entrega - nem no
   *  numerador nem no denominador - e não conta como trabalho em curso. */
  desconsideradas: Set<string>;
  /** Etiquetas que travam a entrega. Vêm junto porque quem deduz o estado de
   *  uma entrega precisa das duas listas ao mesmo tempo. */
  bloqueio: Set<string>;
}

/** Usada quando a tabela ainda não foi semeada, e como valor de partida da
 *  semente: é a lista com que o sistema nasceu. */
export const ETAPAS_TAREFA_PADRAO: { nome: string; cor: string; entrada: boolean; conclusao: boolean }[] = [
  { nome: 'A fazer', cor: '#6E6F69', entrada: true, conclusao: false },
  { nome: 'Em andamento', cor: '#B58300', entrada: false, conclusao: false },
  { nome: 'Em revisão', cor: '#7C3AED', entrada: false, conclusao: false },
  { nome: 'Concluída', cor: '#23A455', entrada: false, conclusao: true },
];

export async function etapasDeTarefa(db: Client): Promise<EtapasDeTarefa> {
  const [r, etq] = await Promise.all([
    db.execute('SELECT nome, is_entrada, is_conclusao, is_excluded FROM tarefa_status_configs WHERE ativo = 1 ORDER BY ordem, id'),
    db.execute('SELECT nome FROM tarefa_etiquetas WHERE ativo = 1 AND bloqueia = 1'),
  ]);
  const linhas = r.rows.length ? r.rows : ETAPAS_TAREFA_PADRAO.map(e => ({
    nome: e.nome, is_entrada: e.entrada ? 1 : 0, is_conclusao: e.conclusao ? 1 : 0, is_excluded: 0,
  }));
  const nomes = linhas.map(l => String(l.nome));
  return {
    nomes,
    // Sem marcação explícita vale a primeira da lista, como no funil.
    entrada: String(linhas.find(l => Number(l.is_entrada) === 1)?.nome ?? nomes[0] ?? ''),
    conclusivas: new Set(linhas.filter(l => Number(l.is_conclusao) === 1).map(l => String(l.nome))),
    desconsideradas: new Set(linhas.filter(l => Number(l.is_excluded) === 1).map(l => String(l.nome))),
    bloqueio: new Set(etq.rows.length
      ? etq.rows.map(l => String(l.nome))
      : ETIQUETAS_TAREFA_PADRAO.filter(e => e.bloqueia).map(e => e.nome)),
  };
}

/** As etiquetas com que o sistema nasce. Depois disso quem manda é a tabela
 *  `tarefa_etiquetas`, editável em Configurações > Etapas > Tarefas.
 *
 *  `bloqueia` não é decoração: enquanto uma tarefa aberta carrega uma dessas, a
 *  entrega a que ela pende aparece como bloqueada. O impedimento é uma
 *  circunstância da tarefa, não o lugar dela no fluxo, e por isso é etiqueta e
 *  não etapa. */
export const ETIQUETAS_TAREFA_PADRAO = [
  { nome: 'dev-pm: bloqueio externo', cor: '#D93025', bloqueia: true,
    papeis: ['Gestor', 'Dev'],
    descricao: 'Depende de cliente, parceiro ou fornecedor.' },
  { nome: 'dev-pm: bloqueio interno', cor: '#D93025', bloqueia: true,
    papeis: ['Gestor', 'Dev'],
    descricao: 'Depende da Sheep ou de outro card.' },
  { nome: 'pm: bug', cor: '#D93025', bloqueia: false,
    papeis: ['Gestor', 'Analista'],
    descricao: 'Comportamento divergente do esperado.' },
  { nome: 'pm: análise comercial', cor: '#C2410C', bloqueia: false,
    papeis: ['Gestor', 'Analista'],
    descricao: 'Pedido do cliente fora do escopo acordado.' },
  { nome: 'pm: funcionalidade', cor: '#7C3AED', bloqueia: false,
    papeis: ['Gestor', 'Analista'],
    descricao: 'Nova funcionalidade prevista no documento de requisitos.' },
  { nome: 'pm: melhoria', cor: '#0066CC', bloqueia: false,
    papeis: ['Gestor', 'Analista'],
    descricao: 'Ajuste em funcionalidade que já existe.' },
  { nome: 'pm: fora de escopo', cor: '#B58300', bloqueia: false,
    papeis: ['Gestor', 'Analista'],
    descricao: 'Pedido fora do escopo acordado no documento de requisitos.' },
  { nome: 'qa: bloqueado', cor: '#C2410C', bloqueia: true,
    papeis: ['Gestor', 'QA'],
    descricao: 'Não foi possível testar por causa externa.' },
  { nome: 'qa: reprovado', cor: '#D93025', bloqueia: false,
    papeis: ['Gestor', 'QA'],
    descricao: 'Card reprovado no teste.' },
];

/** O estado de uma entrega que ninguém resolveu à mão sai das tarefas dela.
 *  Sem tarefa nenhuma, "Planejada": não há o que deduzir. */
export function statusDeduzido(tarefasTodas: Record<string, any>[], etapas: EtapasDeTarefa): string {
  // Tarefa em etapa desconsiderada sai da conversa inteira: ela não trava, não
  // adianta e não segura a entrega em "Planejada".
  const tarefas = tarefasTodas.filter(t => !etapas.desconsideradas.has(String(t.status)));
  const vivas = tarefas.filter(t => !etapas.conclusivas.has(String(t.status)));
  const travada = vivas.some(t => {
    const etq: string[] = JSON.parse(String(t.etiquetas ?? '[]'));
    return etq.some(e => etapas.bloqueio.has(e));
  });
  if (travada) return 'Bloqueada';
  if (!tarefas.length) return 'Planejada';
  // Basta uma tarefa ter saído da etapa de entrada para a entrega estar andando
  // - e ela continua andando com tudo pronto, porque a entrega só termina
  // quando alguém a marca como entregue. Dizer "Planejada" com as tarefas
  // concluídas seria o contrário do que aconteceu.
  const comecou = tarefas.some(t => String(t.status) !== etapas.entrada);
  return comecou ? 'Em andamento' : 'Planejada';
}

/** Percentual de uma entrega: fração das tarefas dela que foram concluídas.
 *  Entrega sem tarefa não tem como medir e vale 0. */
export function progressoDaEntrega(tarefasTodas: Record<string, any>[], etapas: EtapasDeTarefa): number {
  const tarefas = tarefasTodas.filter(t => !etapas.desconsideradas.has(String(t.status)));
  if (!tarefas.length) return 0;
  const feitas = tarefas.filter(t => etapas.conclusivas.has(String(t.status))).length;
  return Math.round((feitas / tarefas.length) * 100);
}
