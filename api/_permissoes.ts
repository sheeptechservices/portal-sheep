import type { Client } from '@libsql/client';
import type { UsuarioAdmin } from './_admin-handler.js';
import { ehEmailAdmin, type Papel } from './_papeis.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Controle de acesso por página e por ação, do papel `membro`.
//
//  Como funciona, em três frases:
//   1. O catálogo abaixo é a fonte única do que existe para marcar. A tela de
//      Configurações > Usuários pede o catálogo ao servidor e desenha os
//      checkboxes a partir dele, então não existe checkbox sem permissão real
//      nem permissão sem checkbox.
//   2. `PERMISSAO_DA_ACAO` amarra cada ação do servidor a uma chave do catálogo.
//      É essa tabela, e não a tela, que trava: esconder um botão é cortesia.
//   3. `master` e `admin` recebem `TUDO`. A matriz vale só para `membro`.
//
//  Enquanto o papel nunca foi configurado, `membro` tem tudo liberado - assim
//  ligar este módulo não tira acesso de ninguém de surpresa. A partir do
//  primeiro salvamento vale só o que está marcado, e permissão nova que apareça
//  depois nasce **desmarcada** para um papel já configurado (aparece na tela na
//  próxima vez que a aba for aberta).
// ─────────────────────────────────────────────────────────────────────────────

export interface PermAcao {
  chave: string;
  label: string;
  /** Explica o que a marcação alcança, quando o rótulo não basta. */
  nota?: string;
  /** Marca o checkbox de acesso ao local (o primeiro da lista de cada grupo). */
  acesso?: boolean;
  /** Permissão que o servidor não consegue impor: some o botão, e é só isso. */
  apenasUi?: boolean;
}

export interface PermGrupo {
  chave: string;
  label: string;
  nota?: string;
  /** Página do painel que o grupo tranca, quando existe uma. */
  page?: string;
  /**
   * Grupo que abriga este na tela, quando ele é parte de outro no painel - o
   * caso das ferramentas, que vivem dentro do hub. É só arrumação de tela: a
   * lista continua achatada aqui, e cada grupo tranca a sua página por si.
   */
  dentroDe?: string;
  acoes: PermAcao[];
}

export const CATALOGO: PermGrupo[] = [
  {
    chave: 'solicitacoes',
    label: 'Solicitações',
    page: 'solicitacoes',
    nota: 'Esteira de demandas das operações.',
    acoes: [
      { chave: 'solicitacoes:ver', label: 'Ver o kanban e abrir cards', acesso: true },
      { chave: 'solicitacoes:criar', label: 'Criar solicitação' },
      { chave: 'solicitacoes:editar', label: 'Editar dados da solicitação' },
      { chave: 'solicitacoes:mover', label: 'Mover de etapa' },
      { chave: 'solicitacoes:comentar', label: 'Comentar' },
      { chave: 'solicitacoes:comentario_excluir', label: 'Excluir comentário' },
      { chave: 'solicitacoes:anexar', label: 'Anexar arquivo ou link, renomear e categorizar' },
      { chave: 'solicitacoes:anexo_excluir', label: 'Excluir anexo' },
      { chave: 'solicitacoes:pendencias', label: 'Abrir e resolver pendências' },
      { chave: 'solicitacoes:deps', label: 'Consultar o bureau DEPS pelo card' },
      { chave: 'solicitacoes:excluir', label: 'Excluir solicitação' },
    ],
  },
  {
    chave: 'onboarding',
    label: 'Onboarding',
    page: 'cadastros-pipeline',
    nota: 'Pipeline dos cadastros de cedentes em aprovação.',
    acoes: [
      { chave: 'onboarding:ver', label: 'Ver o pipeline e abrir cadastros', acesso: true },
      { chave: 'onboarding:mover', label: 'Mover de etapa, aprovar e rejeitar' },
      { chave: 'onboarding:anexar', label: 'Anexar documento do cedente, renomear e categorizar' },
      { chave: 'onboarding:anexo_excluir', label: 'Excluir documento do cedente' },
      { chave: 'onboarding:pendencias', label: 'Abrir e resolver pendências do cadastro' },
    ],
  },
  {
    chave: 'cadastros',
    label: 'Cadastros',
    page: 'cadastros',
    nota: 'Dados-mestre de cedentes e sacados.',
    acoes: [
      { chave: 'cadastros:ver', label: 'Ver cedentes e sacados', acesso: true },
      { chave: 'cadastros:criar', label: 'Criar cedente ou sacado' },
      { chave: 'cadastros:editar', label: 'Editar cedente ou sacado' },
      { chave: 'cadastros:excluir', label: 'Desativar cedente ou sacado' },
      { chave: 'cadastros:importar', label: 'Importar cedentes em lote' },
    ],
  },
  {
    chave: 'liquidez',
    label: 'Liquidez',
    page: 'liquidez',
    nota: 'Posição de caixa, entradas e saídas por semana.',
    acoes: [
      { chave: 'liquidez:ver', label: 'Ver a posição de caixa', acesso: true },
      { chave: 'liquidez:lancar', label: 'Lançar entrada ou saída' },
      { chave: 'liquidez:editar', label: 'Editar lançamento, realizar e ajustar saldo de abertura' },
      { chave: 'liquidez:excluir', label: 'Excluir lançamento' },
    ],
  },
  {
    chave: 'relatorios',
    label: 'Relatórios',
    page: 'relatorios',
    nota: 'Indicadores por veículo, lidos do Google Sheets.',
    acoes: [
      { chave: 'relatorios:ver', label: 'Ver os relatórios', acesso: true },
      {
        chave: 'relatorios:exportar', label: 'Exportar CSV', apenasUi: true,
        nota: 'A exportação é montada no navegador: desmarcar esconde o botão, mas os dados já vêm do "Ver".',
      },
    ],
  },
  {
    chave: 'ferramentas',
    label: 'Ferramentas (hub)',
    page: 'ferramentas',
    nota: 'A página que lista as ferramentas. Cada uma delas vem aninhada aqui.',
    acoes: [
      { chave: 'ferramentas:ver', label: 'Abrir o hub de ferramentas', acesso: true },
    ],
  },
  {
    chave: 'aceites',
    dentroDe: 'ferramentas',
    label: 'Aceites & Anuências',
    page: 'aceite-sacado',
    nota: 'Confirmações de aceite do sacado e termos de anuência.',
    acoes: [
      { chave: 'aceites:ver', label: 'Ver as operações de aceite', acesso: true },
      { chave: 'aceites:criar', label: 'Criar operação de aceite' },
      { chave: 'aceites:editar', label: 'Cancelar operação e mudar status' },
      { chave: 'aceites:reenviar', label: 'Renovar link e reenviar' },
      { chave: 'aceites:email', label: 'Enviar e-mail ao sacado' },
      { chave: 'aceites:anexar', label: 'Anexar e excluir anexo da operação' },
      { chave: 'aceites:assinatura', label: 'Assinatura eletrônica (D4Sign)' },
      { chave: 'aceites:excluir', label: 'Excluir operação' },
    ],
  },
  {
    chave: 'credito',
    dentroDe: 'ferramentas',
    label: 'Análise de Crédito',
    page: 'analise-credito',
    nota: 'Extração por IA, motor de decisão, parecer e histórico.',
    acoes: [
      { chave: 'credito:ver', label: 'Abrir o módulo de crédito', acesso: true },
      { chave: 'credito:nova', label: 'Rodar nova análise (leitura dos documentos pela IA)' },
      { chave: 'credito:parecer', label: 'Pedir parecer à IA' },
      { chave: 'credito:salvar', label: 'Validar e salvar a análise no histórico' },
      { chave: 'credito:historico', label: 'Ver o histórico de análises e os documentos anexados' },
      { chave: 'credito:deps', label: 'Consultar o bureau DEPS' },
      { chave: 'credito:diretrizes', label: 'Ver, cadastrar, importar e revogar diretrizes da casa' },
      {
        chave: 'credito:exportar', label: 'Exportar CSV do histórico', apenasUi: true,
        nota: 'Montada no navegador: desmarcar esconde o botão, mas os dados já vêm do histórico.',
      },
    ],
  },
  {
    chave: 'simulador',
    dentroDe: 'ferramentas',
    label: 'Simulador de Taxas',
    page: 'simulador-taxas',
    nota: 'Roda inteiro no navegador, sem tocar no banco.',
    acoes: [
      { chave: 'simulador:usar', label: 'Abrir e simular', acesso: true, apenasUi: true },
    ],
  },
  {
    chave: 'gerador',
    dentroDe: 'ferramentas',
    label: 'Gerador de Documentos',
    page: 'gerador-documentos',
    nota: 'Contratos, termos e aditivos a partir dos modelos.',
    acoes: [
      { chave: 'gerador:ver', label: 'Abrir o gerador', acesso: true },
      { chave: 'gerador:gerar', label: 'Gerar documento' },
    ],
  },
  {
    chave: 'configuracoes',
    label: 'Configurações',
    page: 'configuracoes',
    nota: 'A aba Usuários é exclusiva do administrador do sistema e não entra nesta matriz.',
    acoes: [
      { chave: 'configuracoes:ver', label: 'Abrir Configurações', acesso: true },
      { chave: 'configuracoes:etapas', label: 'Criar, editar, reordenar e excluir etapas dos pipelines' },
      { chave: 'configuracoes:notificacoes', label: 'Notificações do Slack' },
      { chave: 'configuracoes:integracoes', label: 'Integrações e cofre de credenciais', nota: 'Dá acesso às chaves de API da casa.' },
    ],
  },
];

/** Toda chave válida do catálogo, achatada. */
export const CHAVES = new Set(CATALOGO.flatMap(g => g.acoes.map(a => a.chave)));

/** Página → chave que a destranca. Usado pelo menu, pelo ⌘K e pela rota. */
export const PERMISSAO_DA_PAGINA: Record<string, string> = Object.fromEntries(
  CATALOGO.filter(g => g.page).map(g => [g.page as string, g.acoes.find(a => a.acesso)?.chave ?? g.acoes[0].chave]),
);

/** Ação que qualquer sessão pode chamar (identidade, perfil, busca). */
export const LIVRE = '@livre';
/** Ação que só o administrador do sistema chama - a trava dela é o e-mail. */
export const SO_ADMIN = '@admin';

/**
 * Ação do servidor → permissão exigida. Array significa "qualquer uma delas"
 * (consulta compartilhada por telas diferentes, como a lista de cedentes que
 * alimenta os seletores de meia dúzia de páginas).
 *
 * Ação que não estiver aqui é **recusada** para `membro`: é de propósito, para
 * que uma ação nova não nasça liberada por esquecimento. Ao criar uma ação nova,
 * mapeie-a aqui - o teste de fumaça `_permissoes.test.mjs` acusa a que faltar.
 */
export const PERMISSAO_DA_ACAO: Record<string, string | string[]> = {
  // ── Sempre liberado ────────────────────────────────────────────────────────
  me: LIVRE,
  perfil: LIVRE,
  quick_search: LIVRE, // o resultado é filtrado por permissão dentro do handler

  // ── Gestão de usuários e acessos ──────────────────────────────────────────
  usuarios: SO_ADMIN,
  set_papel: SO_ADMIN,
  set_usuario_ativo: SO_ADMIN,
  permissoes: SO_ADMIN,
  set_permissoes_papel: SO_ADMIN,

  // ── Solicitações ──────────────────────────────────────────────────────────
  board: 'solicitacoes:ver',
  detail: 'solicitacoes:ver',
  status_card_count: 'solicitacoes:ver',
  get_solicitacao_files: 'solicitacoes:ver',
  get_file_base64: 'solicitacoes:ver',
  get_form_file_base64: 'solicitacoes:ver',
  pendencias_by_solicitacao: 'solicitacoes:ver',
  deps_by_solicitacao: 'solicitacoes:ver',
  status_configs: ['solicitacoes:ver', 'onboarding:ver', 'configuracoes:ver'],
  create_submission: 'solicitacoes:criar',
  update_submission: 'solicitacoes:editar',
  patch_submission: 'solicitacoes:editar',
  move: 'solicitacoes:mover',
  comment: 'solicitacoes:comentar',
  delete_comment: 'solicitacoes:comentario_excluir',
  upload_file: 'solicitacoes:anexar',
  rename_file: 'solicitacoes:anexar',
  rename_form_file: 'solicitacoes:anexar',
  update_arquivo_categoria: 'solicitacoes:anexar',
  delete_file: 'solicitacoes:anexo_excluir',
  delete_form_file: 'solicitacoes:anexo_excluir',
  delete_stage_file: 'solicitacoes:anexo_excluir',
  add_pendencias: 'solicitacoes:pendencias',
  toggle_pendencia: 'solicitacoes:pendencias',
  update_pendencia: 'solicitacoes:pendencias',
  delete_pendencia: 'solicitacoes:pendencias',
  save_solicitacao_deps: ['solicitacoes:deps', 'credito:deps'],
  delete_submission: 'solicitacoes:excluir',

  // ── Onboarding ────────────────────────────────────────────────────────────
  cadastros_board: 'onboarding:ver',
  cadastro_detail: 'onboarding:ver',
  cadastro_status_card_count: 'onboarding:ver',
  cadastro_status_configs: ['onboarding:ver', 'configuracoes:ver'],
  move_cadastro: 'onboarding:mover',
  upload_cedente_arquivo: 'onboarding:anexar',
  rename_cedente_arquivo: 'onboarding:anexar',
  update_cedente_arquivo_categoria: 'onboarding:anexar',
  delete_cedente_arquivo: 'onboarding:anexo_excluir',
  add_cedente_pendencias: 'onboarding:pendencias',
  toggle_cedente_pendencia: 'onboarding:pendencias',
  update_cedente_pendencia: 'onboarding:pendencias',
  delete_cedente_pendencia: 'onboarding:pendencias',
  list_cedente_arquivos: ['onboarding:ver', 'cadastros:ver'],
  get_cedente_arquivo_base64: ['onboarding:ver', 'cadastros:ver'],

  // ── Cadastros ─────────────────────────────────────────────────────────────
  // Os seletores de cedente/sacado aparecem em quase toda tela, então a leitura
  // da lista basta ter acesso a uma delas.
  list_cedentes: ['cadastros:ver', 'solicitacoes:ver', 'onboarding:ver', 'aceites:ver', 'credito:ver', 'gerador:ver'],
  list_sacados: ['cadastros:ver', 'solicitacoes:ver', 'aceites:ver', 'credito:ver', 'gerador:ver'],
  list_sacados_by_cedente: ['cadastros:ver', 'solicitacoes:ver', 'aceites:ver', 'credito:ver', 'gerador:ver'],
  create_cedente: 'cadastros:criar',
  create_sacado: 'cadastros:criar',
  update_cedente: 'cadastros:editar',
  update_sacado: 'cadastros:editar',
  add_cedente_option: 'cadastros:editar',
  delete_cedente: 'cadastros:excluir',
  delete_sacado: 'cadastros:excluir',
  import_cedentes: 'cadastros:importar',

  // ── Aceites & Anuências ───────────────────────────────────────────────────
  list_aceite_operacoes: 'aceites:ver',
  get_aceite_anexos: 'aceites:ver',
  create_aceite_operacao: 'aceites:criar',
  list_solicitacoes_for_aceite: 'aceites:criar',
  update_aceite_status: 'aceites:editar',
  reenviar_aceite: 'aceites:reenviar',
  send_aceite_email: 'aceites:email',
  add_aceite_email_history: 'aceites:email',
  add_aceite_anexo: 'aceites:anexar',
  delete_aceite_anexo: 'aceites:anexar',
  delete_aceite_operacao: 'aceites:excluir',

  // ── Análise de Crédito ────────────────────────────────────────────────────
  taxa_sugerida: 'credito:nova',
  salvar_analise: 'credito:salvar',
  analise_arquivo_chunk: 'credito:salvar',
  analise_arquivo_finalize: 'credito:salvar',
  list_analises: 'credito:historico',
  analise_detail: 'credito:historico',
  get_analise_arquivo_base64: 'credito:historico',
  list_diretrizes: 'credito:diretrizes',
  salvar_diretriz: 'credito:diretrizes',
  importar_diretrizes: 'credito:diretrizes',
  revogar_diretriz: 'credito:diretrizes',
  deps_config: ['credito:ver', 'solicitacoes:ver', 'configuracoes:integracoes'],

  // ── Configurações ─────────────────────────────────────────────────────────
  create_status: 'configuracoes:etapas',
  update_status: 'configuracoes:etapas',
  delete_status: 'configuracoes:etapas',
  delete_status_with_move: 'configuracoes:etapas',
  reorder_statuses: 'configuracoes:etapas',
  set_conversion_status: 'configuracoes:etapas',
  set_entrada_status: 'configuracoes:etapas',
  toggle_excluded_status: 'configuracoes:etapas',
  toggle_requires_pendencia: 'configuracoes:etapas',
  toggle_always_collapsed: 'configuracoes:etapas',
  create_cadastro_status: 'configuracoes:etapas',
  update_cadastro_status: 'configuracoes:etapas',
  delete_cadastro_status: 'configuracoes:etapas',
  reorder_cadastro_status: 'configuracoes:etapas',
  add_notificacao: 'configuracoes:notificacoes',
  remove_notificacao: 'configuracoes:notificacoes',
  add_nova_solicitacao_notif: 'configuracoes:notificacoes',
  remove_nova_solicitacao_notif: 'configuracoes:notificacoes',
  nova_solicitacao_notifs: 'configuracoes:notificacoes',
  add_cadastro_etapa_notif: 'configuracoes:notificacoes',
  remove_cadastro_etapa_notif: 'configuracoes:notificacoes',
  add_cadastro_submissao_notif: 'configuracoes:notificacoes',
  remove_cadastro_submissao_notif: 'configuracoes:notificacoes',
  cadastro_notif_config: 'configuracoes:notificacoes',
  anthropic_config: 'configuracoes:integracoes',
  save_anthropic_key: 'configuracoes:integracoes',
  remove_anthropic_key: 'configuracoes:integracoes',
  slack_config: 'configuracoes:integracoes',
  save_slack_token: 'configuracoes:integracoes',
  remove_slack_token: 'configuracoes:integracoes',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Persistência
// ─────────────────────────────────────────────────────────────────────────────

/** Papéis cuja matriz é editável. `master` e `admin` fazem tudo por definição. */
export const PAPEIS_COM_MATRIZ: Papel[] = ['membro'];

export async function ensurePermissoesSchema(
  ddl: (sql: string) => Promise<void>,
): Promise<void> {
  // Uma linha por permissão CONCEDIDA. Papel sem linha nenhuma e sem registro em
  // `papel_permissoes_meta` nunca foi configurado, e aí vale tudo (ver
  // `permissoesDoPapel`).
  await ddl(`
    CREATE TABLE IF NOT EXISTS papel_permissoes (
      papel TEXT NOT NULL,
      chave TEXT NOT NULL,
      PRIMARY KEY (papel, chave)
    )
  `);
  // Marca "este papel já foi configurado", e de quebra guarda quem mexeu por
  // último. Sem ela não haveria como distinguir "nunca configurado" de
  // "configurado sem nenhuma permissão".
  await ddl(`
    CREATE TABLE IF NOT EXISTS papel_permissoes_meta (
      papel              TEXT PRIMARY KEY,
      atualizado_em      TEXT NOT NULL,
      atualizado_por_id  TEXT,
      atualizado_por_nome TEXT
    )
  `);
}

/** Sentinela de "pode tudo", para master, admin e papel não configurado. */
export const TUDO = Symbol('permissoes:tudo');
export type Permissoes = Set<string> | typeof TUDO;

export interface MatrizPapel {
  configurado: boolean;
  chaves: string[];
  atualizado_em: string | null;
  atualizado_por_nome: string | null;
}

/** Cache curto: a matriz muda por ação humana, não por requisição. */
const CACHE_MS = 30_000;
const cache = new Map<string, { valor: MatrizPapel; expira: number }>();

export function invalidarCachePermissoes(papel?: string): void {
  if (papel) cache.delete(papel);
  else cache.clear();
}

export async function matrizDoPapel(db: Client, papel: string): Promise<MatrizPapel> {
  const agora = Date.now();
  const guardado = cache.get(papel);
  if (guardado && guardado.expira > agora) return guardado.valor;

  const [linhas, meta] = await Promise.all([
    db.execute({ sql: 'SELECT chave FROM papel_permissoes WHERE papel = ?', args: [papel] }),
    db.execute({ sql: 'SELECT atualizado_em, atualizado_por_nome FROM papel_permissoes_meta WHERE papel = ?', args: [papel] }),
  ]);
  const m = meta.rows[0] as Record<string, any> | undefined;
  const valor: MatrizPapel = {
    configurado: !!m,
    // Chave que saiu do catálogo (permissão renomeada) é descartada na leitura,
    // para não virar lixo permanente numa matriz salva anos atrás.
    chaves: linhas.rows.map(r => String(r.chave)).filter(c => CHAVES.has(c)),
    atualizado_em: m?.atualizado_em != null ? String(m.atualizado_em) : null,
    atualizado_por_nome: m?.atualizado_por_nome != null ? String(m.atualizado_por_nome) : null,
  };
  cache.set(papel, { valor, expira: agora + CACHE_MS });
  return valor;
}

/**
 * O que este usuário pode. `TUDO` para master, admin e para o papel que nunca
 * foi configurado.
 */
export async function permissoesDoUsuario(db: Client, usuario: UsuarioAdmin | null | undefined): Promise<Permissoes> {
  if (!usuario) return new Set();
  if (ehEmailAdmin(usuario.email) || usuario.papel !== 'membro') return TUDO;
  const matriz = await matrizDoPapel(db, 'membro');
  if (!matriz.configurado) return TUDO;
  return new Set(matriz.chaves);
}

export function pode(perm: Permissoes, chave: string | string[]): boolean {
  if (perm === TUDO) return true;
  const lista = Array.isArray(chave) ? chave : [chave];
  return lista.some(c => perm.has(c));
}

/**
 * A ação pode rodar? `SO_ADMIN` é resolvido por quem chama (a trava dele é o
 * e-mail, não a matriz). Ação fora do mapa é recusada de propósito.
 */
export function podeAcao(perm: Permissoes, acao: string): boolean {
  if (perm === TUDO) return true;
  const exigida = PERMISSAO_DA_ACAO[acao];
  if (exigida === LIVRE) return true;
  if (exigida === undefined || exigida === SO_ADMIN) return false;
  return pode(perm, exigida);
}

export async function salvarMatrizPapel(
  db: Client,
  papel: string,
  chaves: string[],
  usuario: UsuarioAdmin | null | undefined,
): Promise<MatrizPapel> {
  const validas = [...new Set(chaves.filter(c => CHAVES.has(c)))];
  const agora = new Date().toISOString();

  await db.execute({ sql: 'DELETE FROM papel_permissoes WHERE papel = ?', args: [papel] });
  // Um INSERT por chave seria uma ida ao banco por checkbox. Um só, com os
  // valores em lote, é uma ida - importa porque o Turso é remoto.
  if (validas.length) {
    await db.execute({
      sql: `INSERT INTO papel_permissoes (papel, chave) VALUES ${validas.map(() => '(?, ?)').join(', ')}`,
      args: validas.flatMap(c => [papel, c]),
    });
  }
  await db.execute({
    sql: `INSERT INTO papel_permissoes_meta (papel, atualizado_em, atualizado_por_id, atualizado_por_nome)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(papel) DO UPDATE SET
            atualizado_em = excluded.atualizado_em,
            atualizado_por_id = excluded.atualizado_por_id,
            atualizado_por_nome = excluded.atualizado_por_nome`,
    args: [papel, agora, usuario?.id ?? null, usuario?.nome ?? null],
  });

  invalidarCachePermissoes(papel);
  return {
    configurado: true,
    chaves: validas,
    atualizado_em: agora,
    atualizado_por_nome: usuario?.nome ?? null,
  };
}

/**
 * Porteiro dos endpoints próprios (liquidez, relatórios, DEPS, IA, gerador,
 * D4Sign). Devolve `null` quando pode passar, ou o corpo do 403.
 *
 * O `/api/admin-data` tem o porteiro no despacho, que cobre as 115 ações de uma
 * vez; estes endpoints são handlers separados, então cada um chama aqui. Sem
 * isso a matriz seria contornável indo direto na rota - e as rotas caras (DEPS,
 * IA) são justamente as que mais importa trancar.
 */
export async function exigir(
  db: Client,
  usuario: UsuarioAdmin | null | undefined,
  chave: string | string[],
): Promise<{ status: number; body: any } | null> {
  const perm = await permissoesDoUsuario(db, usuario);
  return pode(perm, chave) ? null : negado(chave);
}

/** Recusa padrão de permissão. Diz o que faltou, sem inventar detalhe interno. */
export function negado(chave?: string | string[]) {
  const qual = Array.isArray(chave) ? chave[0] : chave;
  return {
    status: 403,
    body: {
      error: 'Seu perfil não tem acesso a esta ação. Fale com quem administra o painel.',
      permissao: qual ?? null,
    },
  };
}
