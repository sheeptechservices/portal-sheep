// ─────────────────────────────────────────────────────────────────────────────
//  Papéis e permissões, lado da tela.
//
//  Quem decide o que cada nível pode fazer é o servidor (`api/_papeis.ts` e
//  `api/_permissoes.ts`). Aqui a UI apenas esconde o que não teria efeito, para
//  não oferecer um caminho que vai voltar 403.
// ─────────────────────────────────────────────────────────────────────────────

export type Papel = 'membro' | 'master' | 'admin';

export const PAPEL_LABEL: Record<Papel, string> = {
  membro: 'Membro',
  master: 'Master',
  admin: 'Admin',
};

export const PAPEL_DESCRICAO: Record<Papel, string> = {
  membro: 'Padrão de quem entra pela primeira vez. Acesso definido pela matriz de permissões.',
  master: 'Vê e faz tudo na operação. Não gerencia usuários nem acessos.',
  admin: 'Faz tudo, inclusive gerenciar usuários, papéis e acessos.',
};

/** Papéis que a tela de gestão pode atribuir - `admin` vem do e-mail, no servidor. */
export const PAPEIS_ATRIBUIVEIS: Papel[] = ['membro', 'master'];

export function rotuloPapel(papel: string | null | undefined): string {
  const p = String(papel ?? '').toLowerCase() as Papel;
  return PAPEL_LABEL[p] ?? PAPEL_LABEL.membro;
}

/** Só o dono do painel gerencia usuários - o papel efetivo vem da sessão. */
export function podeGerenciarUsuarios(usuario: { papel?: string } | null | undefined): boolean {
  return String(usuario?.papel ?? '').toLowerCase() === 'admin';
}

// ── Permissões ───────────────────────────────────────────────────────────────

/** `'*'` = pode tudo (master, admin, ou matriz do papel nunca configurada). */
export type Permissoes = '*' | string[];

/**
 * Página → permissão que a destranca. É a cópia de tela do
 * `PERMISSAO_DA_PAGINA` do servidor, e existe porque o menu precisa decidir o
 * que mostrar antes de qualquer requisição de catálogo (que é só do admin).
 *
 * As duas cópias não podem divergir: `scripts/check-permissoes.mjs` compara.
 * Página fora deste mapa é aberta a qualquer sessão (Perfil, por exemplo).
 */
export const PERMISSAO_DA_PAGINA: Record<string, string> = {
  'dashboard': 'dashboard:ver',
  'oportunidades': 'oportunidades:ver',
  'projetos': 'projetos:ver',
  'tarefas': 'tarefas:ver',
  'ferramentas': 'ferramentas:ver',
  'gerador-documentos': 'gerador:ver',
  'talentos': 'talentos:ver',
  'configuracoes': 'configuracoes:ver',
};

/** Páginas que moram dentro do hub de Ferramentas. Abrir qualquer uma delas
 *  exige também abrir o hub - a mesma regra que o servidor aplica às ações. */
export const PAGINAS_DE_FERRAMENTA = ['gerador-documentos'];

/**
 * Páginas que não entram na matriz de permissões porque a trava delas é outra:
 * o e-mail do administrador do sistema, conferido no servidor.
 */
export const PAGINAS_SO_ADMIN = ['usuarios'];

/**
 * Monta o teste de permissão. `null` é "ainda não chegou do servidor", e nega:
 * na dúvida a tela não oferece nada.
 *
 * Já foi o contrário - `null` respondia que pode, para o menu não piscar cheio
 * e esvaziar na volta do `me`. O preço era alto demais: se o `me` falhasse por
 * qualquer motivo, o `null` durava a sessão inteira e a tela ficava destravada
 * para todo mundo. O servidor continuava recusando, mas quem usava via os
 * controles de edição e clicava neles. Quem cuida do piscar agora é a tela, que
 * espera as permissões antes de montar o conteúdo.
 */
export function criarPode(permissoes: Permissoes | null) {
  return function pode(chave: string | string[]): boolean {
    if (permissoes === null) return false;
    if (permissoes === '*') return true;
    const lista = Array.isArray(chave) ? chave : [chave];
    return lista.some(c => permissoes.includes(c));
  };
}

export type Pode = ReturnType<typeof criarPode>;

/**
 * A página é alcançável? Duas travas diferentes num teste só: a matriz de
 * permissões, e a lista de páginas que são do administrador do sistema.
 */
export function podeAbrirPagina(pode: Pode, page: string, admin = false): boolean {
  if (PAGINAS_SO_ADMIN.includes(page)) return admin;
  if (PAGINAS_DE_FERRAMENTA.includes(page) && !pode('ferramentas:ver')) return false;
  const chave = PERMISSAO_DA_PAGINA[page];
  return !chave || pode(chave);
}
