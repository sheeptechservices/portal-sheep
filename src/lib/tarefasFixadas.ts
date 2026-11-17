import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
//  As tarefas que a pessoa fixou, para ter à mão na seção Fixadas do menu.
//
//  Guardadas fora das telas porque duas peças longe uma da outra mexem nelas:
//  o botão de alfinete, na ficha da tarefa, e o menu lateral, que mostra a
//  lista. O alfinete pinta no gesto e volta atrás se o servidor recusar.
// ─────────────────────────────────────────────────────────────────────────────

export interface TarefaFixada {
  id: number;
  titulo: string;
  status: string;
  /** A cor da etapa, para o ponto ao lado do título. */
  cor: string | null;
  projeto: string | null;
  concluida: boolean;
}

/** O mesmo `api` que as telas usam: caminho, método e corpo. */
type Api = (path: string, method?: string, body?: unknown) => Promise<any>;

let itens: TarefaFixada[] = [];
const ouvintes = new Set<() => void>();
const avisar = () => { for (const o of ouvintes) o(); };
function assinar(o: () => void) {
  ouvintes.add(o);
  return () => { ouvintes.delete(o); };
}

export const lojaFixadas = {
  /** Lê do servidor. Falhou, fica o que já estava. */
  async carregar(api: Api): Promise<void> {
    const r = await api('?action=tarefas_fixadas').catch(() => null);
    if (!r || !Array.isArray(r.tarefas)) return;
    itens = r.tarefas;
    avisar();
  },

  /** Fixa ou desafixa. Devolve o motivo da recusa, ou nulo se gravou. */
  async alternar(api: Api, tarefa: TarefaFixada, fixar: boolean): Promise<string | null> {
    const antes = itens;
    itens = fixar
      ? [tarefa, ...itens.filter(t => t.id !== tarefa.id)]
      : itens.filter(t => t.id !== tarefa.id);
    avisar();
    const r = await api('', 'POST', { action: 'fixar_tarefa', id: tarefa.id, fixar }).catch(() => null);
    if (r?.ok) return null;
    itens = antes;
    avisar();
    return r?.error ?? 'O servidor não respondeu. Tente de novo.';
  },

  /** A ficha mudou o título ou a etapa: o menu acompanha sem ler de novo. */
  atualizar(id: number, mudou: Partial<Omit<TarefaFixada, 'id'>>): void {
    if (!itens.some(t => t.id === id)) return;
    itens = itens.map(t => (t.id === id ? { ...t, ...mudou } : t));
    avisar();
  },
};

/** A lista, para quem desenha: muda quando alguém fixa ou desafixa. */
export function useTarefasFixadas(): TarefaFixada[] {
  return useSyncExternalStore(assinar, () => itens, () => itens);
}
