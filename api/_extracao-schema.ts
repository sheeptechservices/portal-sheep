// ─────────────────────────────────────────────────────────────────────────────
//  Schema da extração por documento (structured outputs da Anthropic).
//
//  Por que uma LISTA de campos com chave em enum, e não 60 propriedades opcionais:
//  o modelo só emite o que realmente encontrou, o enum impede que ele invente
//  chaves, e o merge do lado do cliente fica trivial. Também evita a regra de
//  strict schema que exige TODAS as propriedades em `required`.
//
//  A chave carrega a parte (`cedente.` / `sacado.` / `lastro.` / `operacao.`),
//  então a atribuição é decidida por campo - é aí que o modelo errava, trocando
//  dados de cedente e sacado em relatórios de crédito de template idêntico.
// ─────────────────────────────────────────────────────────────────────────────

export const CHAVES_CEDENTE = [
  'razao_social', 'cnpj', 'endereco', 'cnae', 'capital_social', 'fundacao', 'situacao', 'porte',
  'representante_nome', 'representante_cpf', 'representante_validade_cnh',
  'banco', 'agencia', 'conta', 'banco_cnpj_titular',
  'score_deps', 'classificacao_deps', 'limite_deps', 'faturamento_presumido_deps',
  'pontualidade_12m', 'pontualidade_6m', 'pontualidade_3m',
  'protestos', 'protestos_valor', 'pendencias', 'acoes_qtd', 'acoes_valor',
  'faturamento_12m', 'receita_bruta_fiscal',
  'patrimonio_liquido', 'capital_social_balanco', 'disponibilidades', 'liquidez_real', 'resultado_exercicio',
] as const;

export const CHAVES_SACADO = [
  'razao_social', 'cnpj', 'endereco', 'capital_social', 'faturamento_presumido',
  'fundacao', 'porte', 'funcionarios', 'filiais',
  'score_deps', 'classificacao_deps', 'limite_deps',
  'pontualidade_12m', 'pontualidade_3m',
  'protestos', 'protestos_valor', 'pendencias', 'acoes_qtd', 'acoes_valor',
] as const;

export const CHAVES_LASTRO = [
  'tipo_documento', 'numero', 'emissao', 'valor', 'vencimento', 'descricao',
  'banco_nf', 'agencia_nf', 'conta_nf',
  'prestador_nome', 'prestador_cnpj', 'tomador_nome', 'tomador_cnpj',
] as const;

export const CHAVES_OPERACAO = ['valor', 'vencimento', 'descricao'] as const;

export const CHAVES_VALIDAS: string[] = [
  ...CHAVES_CEDENTE.map(k => `cedente.${k}`),
  ...CHAVES_SACADO.map(k => `sacado.${k}`),
  ...CHAVES_LASTRO.map(k => `lastro.${k}`),
  ...CHAVES_OPERACAO.map(k => `operacao.${k}`),
];

// Schema de UM documento. strict: objetos com additionalProperties:false e
// `required` completo (a API rejeita min/max, minLength e afins).
export const DOC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['tipo', 'resumo', 'parte', 'confianca_global', 'campos', 'divergencias'],
  properties: {
    tipo: {
      type: 'string',
      description: 'Tipo do documento (ex.: Relatório de Crédito, Nota Fiscal, Contrato Social, Balanço/DRE, Identidade (CNH/RG), Comprovante de Endereço, Dados Bancários, IRPJ/ECF/DEFIS). Use "Não identificado" se não for possível.',
    },
    resumo: { type: 'string', description: 'Uma linha descrevendo o documento.' },
    parte: {
      type: 'string',
      enum: ['cedente', 'sacado', 'lastro', 'ambos', 'indefinido'],
      description: 'De quem é este documento, decidido pelo CNPJ/razão social confrontado com as âncoras informadas.',
    },
    confianca_global: {
      type: 'string',
      enum: ['alta', 'media', 'baixa'],
      description: 'Sua confiança na leitura deste documento como um todo (baixa para escaneado ruim, cortado ou ilegível).',
    },
    campos: {
      type: 'array',
      description: 'Somente os campos que você realmente encontrou. NÃO inclua campos ausentes.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chave', 'valor', 'confianca', 'fonte'],
        properties: {
          chave: { type: 'string', enum: CHAVES_VALIDAS },
          valor: { type: 'string', description: 'Valor como aparece no documento (mantenha formato brasileiro: 1.234,56 e dd/mm/aaaa).' },
          confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] },
          fonte: { type: 'string', description: 'Onde no documento você leu isso (ex.: "página 2, quadro Protestos").' },
        },
      },
    },
    divergencias: {
      type: 'array',
      description: 'Campos em que a imagem e o texto extraído localmente discordam. Liste em vez de escolher em silêncio.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['chave', 'valor_imagem', 'valor_texto', 'adotado'],
        properties: {
          chave: { type: 'string' },
          valor_imagem: { type: 'string' },
          valor_texto: { type: 'string' },
          adotado: { type: 'string', description: 'Qual valor você adotou e por quê, em uma linha.' },
        },
      },
    },
  },
} as const;

export const SINTESE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['analise', 'documentos_faltantes', 'adequacoes_sugeridas'],
  properties: {
    analise: { type: 'string', description: 'Resumo de 5 a 8 linhas: principais achados com dados concretos, pontos positivos e negativos, risco percebido.' },
    documentos_faltantes: { type: 'array', items: { type: 'string' } },
    adequacoes_sugeridas: { type: 'array', items: { type: 'string' } },
  },
} as const;

// Structured outputs não está disponível em todos os modelos (ex.: Sonnet 4.6
// fica de fora). Quando não estiver, caímos no parse best-effort.
export function suportaStructuredOutputs(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith('claude-opus-5')
    || m.startsWith('claude-opus-4-8')
    || m.startsWith('claude-sonnet-5')
    || m.startsWith('claude-haiku-4-5')
    || m.startsWith('claude-fable-5');
}
