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

/**
 * Quem mais é admin, além do dono.
 *
 * Fica no código, e não no banco, pelo mesmo motivo do dono: nenhuma escrita
 * no banco promove ninguém a admin. O dono continua sendo um só - é para ele
 * que vão os avisos do sistema (relato de bug, pedido de cliente sem gestor) -,
 * e esta lista só diz quem mais tem o nível inteiro, inclusive gerenciar
 * usuários. `ADMINS_EXTRAS` no ambiente acrescenta outros, separados por
 * vírgula, sem precisar de deploy.
 */
const ADMINS_DA_CASA = ['thales.carneiro@sheeptechnology.com.br'];

export function emailsAdmin(): string[] {
  const doAmbiente = String(process.env.ADMINS_EXTRAS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([emailAdmin(), ...ADMINS_DA_CASA, ...doAmbiente])];
}

export function ehEmailAdmin(email: string | null | undefined): boolean {
  return !!email && emailsAdmin().includes(email.trim().toLowerCase());
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

/**
 * Ler a tela de Usuários: o dono do painel e o master.
 *
 * O master responde pela operação, e para isso precisa saber quem tem acesso e
 * o que o papel `membro` alcança. Mexer continua sendo só do dono: quem separa
 * as duas coisas é `podeGerenciarUsuarios`, e toda ação de escrita passa por
 * ele.
 */
export function podeVerUsuarios(
  usuario: { email?: string; papel?: string } | null | undefined,
): boolean {
  if (podeGerenciarUsuarios(usuario)) return true;
  return String(usuario?.papel ?? '').trim().toLowerCase() === 'master';
}
