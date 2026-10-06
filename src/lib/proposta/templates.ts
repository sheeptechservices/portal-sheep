// ─────────────────────────────────────────────────────────────────────────────
//  Templates de proposta: um produto que a casa já vende, com o miolo escrito.
//
//  A proposta em branco ensina a forma; o template entrega o conteúdo de um
//  produto fechado - as entregas, o cronograma, o time e a conta da infra -,
//  e quem usa troca só o que é do cliente. O texto de cada template vem da
//  proposta que a casa já mandou daquele produto, e não se reescreve aqui:
//  mudar o que o produto é, ou quanto custa, é decisão comercial, e não ajuste
//  de código.
// ─────────────────────────────────────────────────────────────────────────────
import { infraEmBranco } from './exemplo';
import { PROTOTIPOS_SDR } from './prototipos/sdr';
import { APRESENTADO_POR, VALIDADE_DIAS, type DadosProposta } from './tipos';

export interface TemplateDeProposta {
  id: string;
  nome: string;
  /** Uma frase sobre o produto, no card do template. */
  descricao: string;
  /** De onde o conteúdo saiu, para quem for conferir. */
  origem: string;
  /** Uma função, e não um objeto: cada uso recebe a sua cópia, e editar o
   *  formulário não pode alterar o template guardado aqui. */
  dados: () => DadosProposta;
}

const vazio = { otimista: '', realista: '', pessimista: '' };

/** SDR com IA: o agente que prospecta, qualifica e agenda pelo WhatsApp. Da
 *  proposta "Sheep Tech AI" de 03/04/2026. */
function sdrComIa(): DadosProposta {
  return {
    cliente: '',
    subtitulo: 'SDR com IA',
    preparadoPor: '',
    apresentadoPor: APRESENTADO_POR,
    validadeDias: VALIDADE_DIAS,

    projeto: 'Atendimento automatizado com inteligência artificial no WhatsApp.\n\n'
      + 'O agente de IA conversa com seus leads de maneira humanizada, com uma personalidade '
      + 'definida. A partir de uma lista de leads inserida na plataforma, ele inicia o contato, '
      + 'qualifica o interesse, trata as objeções em tempo real e agenda a reunião direto na '
      + 'Google Agenda.',
    ganhos: [
      'Contato automático com a base de leads inserida na plataforma',
      'Qualificação e tratamento de objeções em tempo real',
      'Reunião agendada direto na Google Agenda',
      'Painel com o funil: contatados, responderam, qualificados e agendados',
    ],

    entregas: [
      {
        nome: 'Prospecção ativa',
        prototipo: PROTOTIPOS_SDR.prospeccao(),
        resumo: 'O agente de IA conversa com seus leads de maneira humanizada, com uma personalidade '
          + 'definida. O contato se dá a partir de uma lista de leads inserida na plataforma.',
        itens: [
          'A partir de uma base de leads inserida na plataforma, a IA inicia contato automaticamente',
          'Envio de mensagens humanizadas, com personalidade configurável',
          'Gestão do status de cada lead: novo, contatado, sem resposta, respondeu',
          'Histórico completo de conversas por lead',
        ],
      },
      {
        nome: 'Qualificação',
        prototipo: PROTOTIPOS_SDR.qualificacao(),
        resumo: 'Tratamento de objeções e qualificação do interesse em tempo real. Aqui ocorre não '
          + 'somente a qualificação do lead, mas também a negociação para o agendamento.',
        itens: [
          'Identificação automática do nível de interesse do lead com base nas respostas',
          'Tratamento de objeções em tempo real via IA conversacional',
          'Classificação do lead',
          'Registro das informações coletadas durante a conversa: cargo, empresa, necessidade e urgência',
        ],
      },
      {
        nome: 'Agendamento',
        prototipo: PROTOTIPOS_SDR.agendamento(),
        resumo: 'Integração com a Google Agenda e agendamento automático.',
        itens: [
          'Integração com a Google Agenda',
          'Sugestão de horários disponíveis diretamente na conversa com o lead',
          'Confirmação automática do agendamento via mensagem',
          'Registro do agendamento vinculado ao lead no painel',
        ],
      },
      {
        nome: 'Dashboard',
        prototipo: PROTOTIPOS_SDR.dashboard(),
        resumo: 'Painel interno de acompanhamento do sucesso da automação.',
        itens: [
          'Visão geral: total de leads contatados, taxa de resposta, taxa de qualificação e reuniões agendadas',
          'Funil visual da automação: contatados, responderam, qualificados e agendados',
          'Lista de leads por status, com filtros',
        ],
      },
    ],

    comoFunciona: {
      linhaFina: 'Quatro sprints de um mês, com alinhamento combinado do começo ao fim.',
      passos: [
        {
          titulo: 'Weekly (opcional)',
          texto: 'Uma vez por semana, alinhamento geral de no máximo 30 minutos.',
        },
        {
          titulo: 'Sprint review mensal',
          texto: 'Alinhamento geral, documentado e formalizado, de no máximo 1 hora, com as entregas da sprint.',
        },
        {
          titulo: 'O que cada sprint entrega',
          texto: '- Sprint 01: Discovery, PA, Setup e Arquitetura\n- Sprint 02: Telas, MVP SDR e Testes\n'
            + '- Sprint 03: SDR Completo, Go-live e Refinamento\n- Sprint 04: Ajustes Finais, Manual e KT',
        },
      ],
      nota: 'A versão final pode sofrer alterações conforme as necessidades reais no decorrer do projeto.',
    },

    cronograma: {
      meses: 4,
      fases: [
        {
          nome: 'Planejamento', de: 1, ate: 1,
          sub: ['Q&A (entrevistas)', 'Construir PA', 'Refinar + apresentar PA'],
          entregas: ['Discovery', 'PA'],
        },
        {
          nome: 'Desenvolvimento', de: 1, ate: 3,
          sub: ['Setup + arquitetura', 'UX/UI Design + telas', 'Testes MVP + ajustes', 'Deploy'],
          entregas: ['Setup', 'Arquitetura', 'Telas', 'MVP SDR', 'Testes', 'SDR Completo'],
        },
        {
          nome: 'Go-live', de: 3, ate: 4,
          sub: ['Operação assistida'],
          entregas: ['Go-live', 'Refinamento', 'Ajustes Finais'],
        },
        {
          nome: 'Treinamento', de: 4, ate: 4,
          sub: ['Documentação', 'Treinamento'],
          entregas: ['Manual', 'KT'],
        },
        {
          nome: 'Cross', de: 1, ate: 4, transversal: true,
          sub: ['Mapear necessidades para a próxima fase'],
          entregas: ['Proposta de próximos passos'],
        },
      ],
    },

    investimento: {
      opcoes: [{
        rotulo: 'Implementação',
        titulo: 'Time de implementação',
        valor: '18.900',
        unidade: 'total por mês',
        destaque: { valor: '4 meses', texto: 'em 4 sprints, do discovery ao KT' },
        bullets: [],
        recomendada: true,
      }],
      time: [
        {
          papel: 'Gestor de Projetos', quantidade: 1, dedicacao: '',
          descricao: 'Planeja, organiza e acompanha o projeto, garantindo prazos, qualidade e alinhamento entre equipe e cliente.',
        },
        {
          papel: 'Analista de Requisitos', quantidade: 1, dedicacao: '',
          descricao: 'Levanta e documenta as necessidades do negócio, transformando demandas em requisitos claros para o time.',
        },
        {
          papel: 'UI/UX', quantidade: 1, dedicacao: '',
          descricao: 'Desenha a experiência e a interface do usuário, focando em usabilidade, clareza e identidade visual.',
        },
        {
          papel: 'Desenvolvedor', quantidade: 1, dedicacao: '',
          descricao: 'Implementa a solução técnica, desenvolvendo funcionalidades e garantindo o funcionamento do sistema.',
        },
      ],
      memoria: '',
    },

    infra: {
      ...infraEmBranco(),
      modelo: 'volume',
      itens: [
        { servico: 'Supabase', detalhe: 'Banco de dados e autenticação', valores: { ...vazio }, custo: 'R$ 130 por mês' },
        { servico: 'OpenAI GPT-4.1 mini', detalhe: 'Geração de mensagens e respostas via IA', valores: { ...vazio }, custo: 'cerca de R$ 0,01 por lead' },
        { servico: 'n8n Cloud', detalhe: 'Automação e orquestração de fluxos', valores: { ...vazio }, custo: 'R$ 125 a R$ 313 por mês, em média' },
        { servico: 'WhatsApp Business API', detalhe: 'Envio de mensagens aos leads', valores: { ...vazio }, custo: 'R$ 0,50 a R$ 1,25 por lead, em média' },
        { servico: 'SendGrid', detalhe: 'Envio de e-mails', valores: { ...vazio }, custo: 'cerca de R$ 103 por mês' },
      ],
      fonte: 'Custo base com o dólar a R$ 5,16.',
      manutencao: { valor: '', unidade: 'por mês', inclui: [], naoInclui: [] },
      volumes: {
        rotulo: 'Leads por mês',
        faixas: [
          { volume: 'Até 1.000 leads', infra: '1.337', manutencao: '2.900' },
          { volume: 'Até 2.000 leads', infra: '2.222', manutencao: '4.900' },
          { volume: 'Até 5.000 leads', infra: '4.877', manutencao: '8.900' },
        ],
      },
      nota: 'Os custos podem sofrer alteração conforme mudanças no escopo do projeto, fornecedores e economia internacional.',
    },
  };
}

export const TEMPLATES: TemplateDeProposta[] = [
  {
    id: 'sdr-com-ia',
    nome: 'SDR com IA',
    descricao: 'Agente de IA no WhatsApp que prospecta a base de leads, qualifica, trata objeções e agenda na Google Agenda, com painel do funil.',
    origem: 'Proposta Sheep Tech AI de 03/04/2026',
    dados: sdrComIa,
  },
];
