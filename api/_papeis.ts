// ─────────────────────────────────────────────────────────────────────────────
//  Papéis de acesso do painel.
//
//  Três níveis, do menor para o maior:
//    membro → padrão de quem entra pela primeira vez. Acesso restrito.
//    master → vê e faz tudo na operação, menos mexer em usuário.
//    admin  → tudo, inclusive gerenciar usuários, papéis e acessos.
//
//  O admin não é um dado editável: é um e-mail fixado no servidor. Nenhuma
//  escrita no banco promove ninguém a admin, e linha que apareça com
//  papel = 'admin' sem ser esse e-mail é lida como master. Assim o nível mais
//  alto não depende de o banco estar íntegro nem de a UI se comportar - quem
//  decide é `papelEfetivo`, e ele só olha o e-mail.
// ─────────────────────────────────────────────────────────────────────────────

export type Papel = 'membro' | 'master' | 'admin';

/** Papéis que a tela de gestão pode atribuir. `admin` fica de fora de propósito. */
export const PAPEIS_ATRIBUIVEIS: Papel[] = ['membro', 'master'];

/**
 * Dono do painel. `ADMIN_EMAIL` permite apontar para outro endereço em outro
 * ambiente; sem ela, vale o da casa.
 */
export function emailAdmin(): string {
  return (process.env.ADMIN_EMAIL || 'guilhermezaidan@wearedux.com').trim().toLowerCase();
}

/** Hierarquia, do maior para o menor - é a ordem em que a lista é exibida. */
const ORDEM: Record<Papel, number> = { admin: 0, master: 1, membro: 2 };

export function ordemPapel(papel: Papel): number {
  return ORDEM[papel];
}

export function ehEmailAdmin(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase() === emailAdmin();
}

/**
 * Papel que vale de verdade para um e-mail, independente do que está gravado.
 * É por aqui que toda leitura de usuário passa - ver `rowToUsuario`.
 */
export function papelEfetivo(email: string | null | undefined, papelGravado: unknown): Papel {
  if (ehEmailAdmin(email)) return 'admin';
  const p = String(papelGravado ?? '').trim().toLowerCase();
  // 'admin' gravado em quem não é o e-mail do dono não promove: cai em master,
  // que é o maior nível que o banco pode conceder.
  if (p === 'master' || p === 'admin') return 'master';
  return 'membro';
}

/** Gerenciar usuários, papéis e acessos. Só o dono do painel. */
export function podeGerenciarUsuarios(usuario: { email?: string } | null | undefined): boolean {
  return ehEmailAdmin(usuario?.email);
}
