import type { Client } from '@libsql/client';
import type { UsuarioAdmin } from './_admin-handler.js';
import { papelEfetivo, type Papel } from './_papeis.js';

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
    chave: 'leads',
    label: 'Leads',
    page: 'leads',
    nota: 'Esteira de demandas das operações.',
    acoes: [
      { chave: 'leads:ver', label: 'Ver o kanban e abrir cards', acesso: true },
      { chave: 'leads:criar', label: 'Criar lead' },
      { chave: 'leads:editar', label: 'Editar dados do lead' },
      { chave: 'leads:mover', label: 'Mover de etapa' },
      { chave: 'leads:comentar', label: 'Comentar' },
      { chave: 'leads:comentario_excluir', label: 'Excluir comentário' },
      { chave: 'leads:anexar', label: 'Anexar arquivo ou link, renomear e categorizar' },
      { chave: 'leads:anexo_excluir', label: 'Excluir anexo' },
      { chave: 'leads:pendencias', label: 'Abrir e resolver pendências' },
      { chave: 'leads:deps', label: 'Consultar o bureau DEPS pelo card' },
      { chave: 'leads:excluir', label: 'Excluir lead' },
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
    chave: 'dashboard',
    label: 'Dashboard',
    // Sem `page` ainda: a tela não existe. A chave entra agora para o acesso já
    // poder ser desenhado por papel, e ganha a rota quando a página nascer.
    nota: 'Painel de indicadores da casa. Em construção.',
    acoes: [
      { chave: 'dashboard:ver', label: 'Ver o painel', acesso: true },
    ],
  },
  {
    chave: 'projetos',
    label: 'Projetos',
    page: 'projetos',
    nota: 'Cadastro dos projetos da casa e o acompanhamento de cada um.',
    acoes: [
      { chave: 'projetos:ver', label: 'Ver os projetos', acesso: true },
      { chave: 'projetos:criar', label: 'Cadastrar projeto' },
      { chave: 'projetos:editar', label: 'Editar projeto e andamento' },
      { chave: 'projetos:excluir', label: 'Excluir projeto' },
    ],
  },
  {
    chave: 'tarefas',
    label: 'Tarefas',
    page: 'tarefas',
    nota: 'O trabalho dos projetos. A lista respeita a mesma regra dos projetos: '
      + 'membro só enxerga tarefa de projeto em que está na equipe.',
    acoes: [
      { chave: 'tarefas:ver', label: 'Ver o quadro de tarefas', acesso: true },
      { chave: 'tarefas:editar', label: 'Criar e editar tarefa' },
      { chave: 'tarefas:excluir', label: 'Excluir tarefa' },
      // Separada de `editar` de propósito: comentar é participar da conversa, e
      // não mexer na tarefa. Quem acompanha um projeto sem tocar no quadro
      // ainda precisa poder responder.
      { chave: 'tarefas:comentar', label: 'Comentar na tarefa' },
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
      { chave: 'configuracoes:notificacoes', label: 'Notificações por e-mail' },
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
  // Alimenta as duas telas: quem vê tarefas precisa da mesma carga, e ela já
  // vem cortada por equipe no servidor.
  projetos: ['projetos:ver', 'tarefas:ver'],
  create_projeto: 'projetos:criar',
  update_projeto: 'projetos:editar',
  delete_projeto: 'projetos:excluir',
  add_projeto_arquivo: 'projetos:editar',
  delete_projeto_arquivo: 'projetos:editar',
  projeto_arquivo_base64: 'projetos:ver',
  etiquetar_projeto_arquivo: 'projetos:editar',
  create_cliente: 'projetos:criar',
  // Entregas, saúde e reuniões pendem do projeto: quem edita o projeto edita o
  // que está dentro dele. Ver o conteúdo da evidência é leitura.
  // A tela de Tarefas monta as colunas com esta lista, e Configurações a edita.
  tarefa_status_configs: ['tarefas:ver', 'configuracoes:ver'],
  tarefa_status_card_count: 'configuracoes:etapas',
  create_tarefa_status: 'configuracoes:etapas',
  update_tarefa_status: 'configuracoes:etapas',
  delete_tarefa_status: 'configuracoes:etapas',
  reorder_tarefa_statuses: 'configuracoes:etapas',
  set_entrada_tarefa_status: 'configuracoes:etapas',
  set_conversao_tarefa_status: 'configuracoes:etapas',
  toggle_desconsiderada_tarefa_status: 'configuracoes:etapas',
  toggle_collapsed_tarefa_status: 'configuracoes:etapas',
  tarefa_etiquetas: ['tarefas:ver', 'configuracoes:ver'],
  tarefa_subtarefas: 'tarefas:ver',
  add_tarefa_subtarefa: 'tarefas:editar',
  atualizar_tarefa_subtarefa: 'tarefas:editar',
  excluir_tarefa_subtarefa: 'tarefas:editar',
  tarefa_etiqueta_uso: 'configuracoes:etapas',
  create_tarefa_etiqueta: 'configuracoes:etapas',
  update_tarefa_etiqueta: 'configuracoes:etapas',
  delete_tarefa_etiqueta: 'configuracoes:etapas',
  reorder_tarefa_etiquetas: 'configuracoes:etapas',
  set_etiquetas_por_papel: 'configuracoes:etapas',
  toggle_bloqueio_tarefa_etiqueta: 'configuracoes:etapas',
  add_tarefa_status_notif: 'configuracoes:etapas',
  remove_tarefa_status_notif: 'configuracoes:etapas',
  // Publicar é decidir o que o cliente vê: mesma permissão de editar o projeto.
  publicar_projeto: 'projetos:editar',
  despublicar_projeto: 'projetos:editar',
  salvar_tarefa: 'tarefas:editar',
  excluir_tarefa: 'tarefas:excluir',
  // O diário e a conversa do card: ler é leitura de tarefa, escrever é a
  // permissão própria. Apagar entra em `comentar` porque o servidor já limita a
  // quem escreveu - quem manda no sistema passa por cima disso lá dentro.
  tarefa_atividade: 'tarefas:ver',
  tarefas_comentarios: 'tarefas:ver',
  tarefa_comentario_anexo_base64: 'tarefas:ver',
  add_tarefa_comentario: 'tarefas:comentar',
  excluir_tarefa_comentario: 'tarefas:comentar',
  salvar_entrega: 'projetos:editar',
  excluir_entrega: 'projetos:editar',
  add_entrega_evidencia: 'projetos:editar',
  excluir_entrega_evidencia: 'projetos:editar',
  entrega_evidencia_base64: 'projetos:ver',
  definir_gestor_projeto: 'projetos:editar',
  registrar_saude_projeto: 'projetos:editar',
  excluir_saude_projeto: 'projetos:editar',
  fireflies_reunioes: 'projetos:editar',
  fireflies_gravacao: 'projetos:ver',
  reunioes_dados: 'projetos:ver',
  anexar_reuniao_fireflies: 'projetos:editar',
  vincular_reuniao: 'projetos:editar',
  registrar_reuniao_projeto: 'projetos:editar',
  excluir_reuniao_projeto: 'projetos:editar',
  // ── Sempre liberado ────────────────────────────────────────────────────────
  me: LIVRE,
  perfil: LIVRE,
  // Lista de nomes e fotos do time, que alimenta os seletores de pessoas. Não
  // expõe nada além do que já aparece na equipe de um projeto.
  usuarios_notificaveis: LIVRE,
  quick_search: LIVRE, // o resultado é filtrado por permissão dentro do handler

  // ── Gestão de usuários e acessos ──────────────────────────────────────────
  usuarios: SO_ADMIN,
  convidar_usuario: SO_ADMIN,
  definir_senha_usuario: SO_ADMIN,
  enviar_link_senha: SO_ADMIN,
  set_papel: SO_ADMIN,
  set_usuario_ativo: SO_ADMIN,
  permissoes: SO_ADMIN,
  set_permissoes_papel: SO_ADMIN,

  // ── Leads ──────────────────────────────────────────────────────────
  board: 'leads:ver',
  detail: 'leads:ver',
  status_card_count: 'leads:ver',
  get_lead_files: 'leads:ver',
  get_file_base64: 'leads:ver',
  get_form_file_base64: 'leads:ver',
  pendencias_by_lead: 'leads:ver',
  deps_by_lead: 'leads:ver',
  status_configs: ['leads:ver', 'cadastros:ver', 'configuracoes:ver'],
  create_submission: 'leads:criar',
  update_submission: 'leads:editar',
  patch_submission: 'leads:editar',
  move: 'leads:mover',
  comment: 'leads:comentar',
  delete_comment: 'leads:comentario_excluir',
  upload_file: 'leads:anexar',
  rename_file: 'leads:anexar',
  rename_form_file: 'leads:anexar',
  update_arquivo_categoria: 'leads:anexar',
  delete_file: 'leads:anexo_excluir',
  delete_form_file: 'leads:anexo_excluir',
  delete_stage_file: 'leads:anexo_excluir',
  add_pendencias: 'leads:pendencias',
  toggle_pendencia: 'leads:pendencias',
  update_pendencia: 'leads:pendencias',
  delete_pendencia: 'leads:pendencias',
  save_lead_deps: ['leads:deps'],
  delete_submission: 'leads:excluir',

  // ── Onboarding ────────────────────────────────────────────────────────────
  cadastros_board: 'cadastros:ver',
  cadastro_detail: 'cadastros:ver',
  upload_cedente_arquivo: 'cadastros:editar',
  rename_cedente_arquivo: 'cadastros:editar',
  update_cedente_arquivo_categoria: 'cadastros:editar',
  delete_cedente_arquivo: 'cadastros:editar',
  add_cedente_pendencias: 'cadastros:editar',
  toggle_cedente_pendencia: 'cadastros:editar',
  update_cedente_pendencia: 'cadastros:editar',
  delete_cedente_pendencia: 'cadastros:editar',
  list_cedente_arquivos: ['cadastros:ver', 'cadastros:ver'],
  get_cedente_arquivo_base64: ['cadastros:ver', 'cadastros:ver'],

  // ── Cadastros ─────────────────────────────────────────────────────────────
  // Os seletores de cedente/sacado aparecem em quase toda tela, então a leitura
  // da lista basta ter acesso a uma delas.
  list_cedentes: ['cadastros:ver', 'leads:ver', 'gerador:ver'],
  list_sacados: ['cadastros:ver', 'leads:ver', 'gerador:ver'],
  list_sacados_by_cedente: ['cadastros:ver', 'leads:ver', 'gerador:ver'],
  create_cedente: 'cadastros:criar',
  create_sacado: 'cadastros:criar',
  update_cedente: 'cadastros:editar',
  update_sacado: 'cadastros:editar',
  add_cedente_option: 'cadastros:editar',
  delete_cedente: 'cadastros:excluir',
  delete_sacado: 'cadastros:excluir',
  import_cedentes: 'cadastros:importar',

  // ── Aceites & Anuências ───────────────────────────────────────────────────

  // ── Análise de Crédito ────────────────────────────────────────────────────
  taxa_sugerida: 'cadastros:editar',
  deps_config: ['leads:ver', 'configuracoes:integracoes'],

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
  add_notificacao: 'configuracoes:notificacoes',
  remove_notificacao: 'configuracoes:notificacoes',
  add_novo_lead_notif: 'configuracoes:notificacoes',
  remove_novo_lead_notif: 'configuracoes:notificacoes',
  novo_lead_notifs: 'configuracoes:notificacoes',
  anthropic_config: 'configuracoes:integracoes',
  fireflies_config: 'configuracoes:integracoes',
  save_fireflies_key: 'configuracoes:integracoes',
  resend_config: 'configuracoes:integracoes',
  save_resend_key: 'configuracoes:integracoes',
  set_resend_remetente: 'configuracoes:integracoes',
  remove_resend_key: 'configuracoes:integracoes',
  enviar_email_teste: 'configuracoes:integracoes',
  emails_enviados: 'configuracoes:integracoes',
  remove_fireflies_key: 'configuracoes:integracoes',
  save_anthropic_key: 'configuracoes:integracoes',
  remove_anthropic_key: 'configuracoes:integracoes',
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
  // Pelo papel efetivo, e não pelo que veio no objeto: `rowToUsuario` já
  // normaliza, mas assim um `UsuarioAdmin` montado em qualquer outro ponto não
  // vira "pode tudo" só por trazer o papel escrito de outro jeito.
  if (papelEfetivo(usuario.email, usuario.papel) !== 'membro') return TUDO;
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
/** Exige a permissão da ferramenta **e** a do hub que a contém. Uma ferramenta
 *  vive dentro de Ferramentas: quem não abre o hub não deveria alcançar o que
 *  está nele, e desmarcar "Ferramentas" bastar é a leitura natural da tela. */
export async function exigirFerramenta(
  db: Client,
  usuario: UsuarioAdmin | null | undefined,
  chave: string,
): Promise<{ status: number; body: any } | null> {
  const perm = await permissoesDoUsuario(db, usuario);
  if (!pode(perm, 'ferramentas:ver')) return negado('ferramentas:ver');
  return pode(perm, chave) ? null : negado(chave);
}

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
