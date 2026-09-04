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
  /** Etapa que recebe as oportunidades enviadas pelo formulário público. */
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
  /** Nulo para quem nunca entrou pelo Google ou não tem foto na conta. */
  usuario_foto?: string | null;
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

/** Uma oportunidade do funil comercial.
 *
 *  A tabela nasceu para operação de crédito - cedente, sacado, parcelas -, e o
 *  que o comercial precisa é outra coisa: com quem se está falando, de onde
 *  veio, o que quer, quanto vale e qual é o próximo passo. Os campos antigos
 *  saíram da tela; as colunas continuam no banco, vazias, porque apagar coluna
 *  em produção é risco sem prêmio. */
/** A reunião como o card do funil precisa dela. */
export interface ReuniaoDoCard {
  id: number;
  assunto: string;
  data: string;
  /** Veio do Fireflies: a marca do chip diz de onde. */
  fireflies: number;
}

export interface Submission {
  id: string;
  created_at: string;
  /** Com quem se está falando. É o título do card e o único obrigatório. */
  empresa: string | null;
  cnpj: string | null;
  contato_nome: string | null;
  contato_cargo: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  /** De onde veio: indicação, prospecção, site, evento, LinkedIn. */
  origem: string | null;
  /** O que quer, no vocabulário dos projetos da casa. */
  interesse: string | null;
  valor_estimado: number | null;
  responsavel_id: string | null;
  responsavel_nome?: string | null;
  responsavel_foto?: string | null;
  /** O próximo passo e quando ele é: é o que faz o funil andar. */
  proxima_acao: string | null;
  proxima_acao_em: string | null;
  observacoes?: string | null;
  /** Preenchido quando a oportunidade cai na etapa de perda. */
  motivo_perda?: string | null;
  arquivo_count: number;
  comentario_count?: number;
  pendencia_aberta_count?: number;
  /** Onde a empresa fica. Três colunas, e não uma: o comercial conta oportunidade por
   *  praça, e "Belo Horizonte / MG" numa string não se agrupa. */
  cidade?: string | null;
  estado?: string | null;
  pais?: string | null;
  /** Quem apontou a oportunidade. Vale sobretudo quando a origem é indicação. */
  indicado_por?: string | null;
  /** Chegou por um parceiro. Vem do banco como 0 ou 1. */
  parceria?: number | null;
  /** O mercado em que a empresa atua, e não o que ela quer da gente. */
  segmento?: string | null;
  /** O entendimento inteiro da oportunidade: a operação, o problema, o que se
   *  propôs e o que ficou de fora. */
  briefing?: string | null;
  pendencia_total_count?: number;
  /** As reuniões da oportunidade, no mínimo que o chip do card mostra. O resumo e os
   *  tópicos ficam no servidor: são parágrafos por reunião, e o quadro inteiro
   *  os carregaria para desenhar um chip. */
  reunioes?: ReuniaoDoCard[];
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
  oportunidade_id: string;
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
