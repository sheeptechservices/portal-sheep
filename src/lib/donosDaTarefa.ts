// ─────────────────────────────────────────────────────────────────────────────
//  Os nomes de quem cuida de uma tarefa.
//
//  A tarefa guarda ids; nome e foto a tela já tem, na lista de pessoas. Ter a
//  tradução num lugar só evita que o filtro e a exportação discordem sobre o
//  que fazer com um id que não casa com ninguém - o que acontece quando alguém
//  sai da casa e o cadastro é desativado.
// ─────────────────────────────────────────────────────────────────────────────

interface ComDonos {
  responsaveis?: string[] | null;
}

interface Pessoa {
  id: string;
  nome: string;
}

/** Os nomes, na ordem em que foram escolhidos. Id sem dono conhecido some da
 *  lista em vez de virar "?" no filtro. */
export function nomesDosDonos(t: ComDonos, pessoas: Pessoa[]): string[] {
  return (t.responsaveis ?? [])
    .map(id => pessoas.find(p => p.id === id)?.nome)
    .filter((n): n is string => !!n);
}
