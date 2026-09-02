export interface StatusConfig {
  id: number;
  nome: string;
  cor: string;
  /** O que a etapa quer dizer. Vira a dica na hora de escolher. */
  descricao?: string | null;
  ordem: number;
  ativo: number;
  is_conversion?: number;
  is_excluded?: number;
  requires_pendencia?: number;
  /** Etapa que recebe os leads enviadas pelo formulário público. */
  is_entrada?: number;
  /** Etapa pontual: fica recolhida no kanban mesmo tendo cards. */
  always_collapsed?: number;
  notificacoes?: Notificacao[];
}

/** Nome e e-mail vêm de JOIN com `usuarios`, não de cópia guardada: renomear
 *  alguém se propaga sozinho, e desativar tira da lista de envio. */
interface Inscrito {
  id: number;
  usuario_id: string;
  usuario_nome: string;
  usuario_email: string;
}

export interface Notificacao extends Inscrito {
  status_id: number;
}

export type NovaNotificacao = Inscrito;



/** Usuário do portal, como o seletor de destinatários o enxerga. */
export interface UsuarioNotificavel {
  id: string;
  nome: string;
  email: string;
  foto_url: string | null;
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
  lead_id: string;
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
