export interface StatusConfig {
  id: number;
  nome: string;
  cor: string;
  ordem: number;
  ativo: number;
  is_conversion?: number;
  is_excluded?: number;
  requires_pendencia?: number;
  /** Etapa que recebe as solicitações enviadas pelo formulário público. */
  is_entrada?: number;
  /** Etapa pontual: fica recolhida no kanban mesmo tendo cards. */
  always_collapsed?: number;
  notificacoes?: Notificacao[];
}

export interface Notificacao {
  id: number;
  status_id: number;
  slack_user_id: string;
  slack_user_name: string;
  slack_user_avatar: string | null;
}

export interface NovaNotificacao {
  id: number;
  slack_user_id: string;
  slack_user_name: string;
  slack_user_avatar: string | null;
}

export interface CadastroEtapaNotificacao {
  id: number;
  etapa: string;
  slack_user_id: string;
  slack_user_name: string;
  slack_user_avatar: string | null;
}

export interface CadastroEtapaConfig {
  id: number;
  chave: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: number;
  locked: number; // 1 = etapa âncora protegida (aprovado/rejeitado): não pode ser excluída
  notificacoes?: CadastroEtapaNotificacao[];
}

export interface SlackUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
}

export interface Submission {
  id: string;
  created_at: string;
  nome_contratado: string | null;
  cnpj_contratado: string | null;
  nome_sacado: string | null;
  cnpj_sacado: string | null;
  valor: string | null;
  valor_numerico?: number | null;
  prazo_limite: string | null;
  decisions: string | null;
  fim_type: number | null;
  arquivo_count: number;
  comentario_count?: number;
  pendencia_aberta_count?: number;
  pendencia_total_count?: number;
  current_status_id: number | null;
  status_since: string | null;
  parcelas: string | null;
  cedente_id?: string | null;
  sacado_id?: string | null;
  previsao_execucao?: string | null;
  data_execucao?: string | null;
}

export interface Evento {
  id: number;
  solicitacao_id: string;
  tipo: 'status_change' | 'comentario' | 'arquivo' | 'edicao';
  status_id: number | null;
  status_nome: string | null;
  status_cor: string | null;
  descricao: string | null;
  parent_id: number | null;
  criado_em: string;
  /** Quem fez. Nulos em evento anterior ao login individual ou gerado pelo sistema. */
  autor_id: string | null;
  autor_nome: string | null;
  /** Foto atual do autor, resolvida por junção com `usuarios` (não é snapshot). */
  autor_foto?: string | null;
}

export interface EtapaArquivo {
  id: number;
  status_id: number;
  status_nome: string | null;
  nome: string;
  tipo: string;
  tamanho: number;
  categoria: string | null;
  criado_em: string;
}

export interface FormArquivo {
  id: number;
  categoria: string;
  nome: string;
  tipo: string;
  tamanho: number;
}

export interface Pendencia {
  id: number;
  descricao: string;
  categoria: string | null;
  resolvida: number;
  status_id: number | null;
  criado_em: string;
  resolvido_em: string | null;
}

export interface SubmissionDetail {
  submission: Submission & Record<string, any>;
  eventos: Evento[];
  etapa_arquivos: EtapaArquivo[];
  form_arquivos: FormArquivo[];
  statuses: Pick<StatusConfig, 'id' | 'nome' | 'cor'>[];
  pendencias: Pendencia[];
}

// ── Liquidez ─────────────────────────────────────────────────────────────────

export type LiquidezSource   = 'interno' | 'atlas' | 'fidc';
export type LiquidezType     = 'entrada' | 'saida';
export type LiquidezCategory = string;

export interface LiquidezTx {
  id: string;
  date: string;
  source: LiquidezSource;
  type: LiquidezType;
  category: LiquidezCategory;
  amount: number;
  description: string | null;
  realized: boolean;
  created_at: string;
}

export type LiquidezTxInput = Omit<LiquidezTx, 'id' | 'created_at' | 'realized'> & { realized?: boolean };
