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
  'solicitacoes': 'solicitacoes:ver',
  'cadastros-pipeline': 'onboarding:ver',
  'cadastros': 'cadastros:ver',
  'liquidez': 'liquidez:ver',
  'relatorios': 'relatorios:ver',
  'ferramentas': 'ferramentas:ver',
  'aceite-sacado': 'aceites:ver',
  'analise-credito': 'credito:ver',
  'simulador-taxas': 'simulador:usar',
  'gerador-documentos': 'gerador:ver',
  'configuracoes': 'configuracoes:ver',
};

/**
 * Páginas que não entram na matriz de permissões porque a trava delas é outra:
 * o e-mail do administrador do sistema, conferido no servidor.
 */
export const PAGINAS_SO_ADMIN = ['usuarios'];

/**
 * Monta o teste de permissão. `null` é "ainda não chegou do servidor": responde
 * que pode, de propósito, para o menu não piscar cheio e esvaziar na primeira
 * volta do `me`. A janela é de uma requisição, e a trava de verdade é o servidor.
 */
export function criarPode(permissoes: Permissoes | null) {
  return function pode(chave: string | string[]): boolean {
    if (permissoes === null || permissoes === '*') return true;
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
  const chave = PERMISSAO_DA_PAGINA[page];
  return !chave || pode(chave);
}
