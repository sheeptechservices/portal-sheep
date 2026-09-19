// ─────────────────────────────────────────────────────────────────────────────
//  Uma proposta de partida, para o formulário não nascer vazio.
//
//  Não é conteúdo de mentira para enfeitar: é a forma que a casa fechou, com o
//  texto trocado por instruções curtas do que entra em cada lugar. Quem abre a
//  ferramenta vê o esqueleto inteiro e sobrescreve, em vez de encarar dezenove
//  campos em branco sem saber o tamanho do que se espera.
// ─────────────────────────────────────────────────────────────────────────────
import {
  APRESENTADO_POR, VALIDADE_DIAS, type DadosProposta, type InfraManutencao,
} from './tipos';

export function propostaEmBranco(): DadosProposta {
  return {
    cliente: '',
    subtitulo: '',
    // Quem prepara é quem está com a tela aberta: o nome vem da sessão.
    preparadoPor: '',
    apresentadoPor: APRESENTADO_POR,
    validadeDias: VALIDADE_DIAS,

    projeto: '',
    ganhos: ['', '', ''],

    entregas: [{ nome: '', resumo: '', itens: ['', '', ''] }],

    comoFunciona: {
      linhaFina: 'Um time à disposição, e não um projeto que acaba.',
      passos: [
        { titulo: 'Vocês definem a fila', texto: '' },
        { titulo: 'Nós construímos', texto: '' },
        { titulo: 'A fila anda', texto: '' },
      ],
      nota: '',
    },

    cronograma: {
      meses: 4,
      fases: [
        { nome: 'Planejamento + setup', de: 1, ate: 1, sub: [''], entregas: [''] },
        { nome: 'Desenvolvimento', de: 1, ate: 3, sub: [''], entregas: [''] },
        { nome: 'Testes, homologação e go-live', de: 2, ate: 4, sub: [''], entregas: [''] },
        { nome: 'Documentação e treinamento', de: 3, ate: 4, sub: [''], entregas: [''] },
        {
          nome: 'Mapeamento de necessidades', de: 1, ate: 4, transversal: true,
          sub: [''], entregas: [''],
        },
      ],
    },

    investimento: {
      opcoes: [
        {
          rotulo: 'Opção A', titulo: '', valor: '', unidade: '',
          destaque: { valor: '', texto: '', nota: '' },
          bullets: ['', '', ''],
          recomendada: true,
        },
        {
          rotulo: 'Opção B', titulo: '', valor: '', unidade: '',
          bullets: ['', '', ''],
        },
      ],
      time: [
        { papel: 'Gestor de projetos', dedicacao: '', descricao: '', naoCobrado: true },
        { papel: '', dedicacao: '', descricao: '' },
      ],
      memoria: '',
    },
  };
}

/** O slide de infra quando alguém o liga à mão: os dois serviços que quase todo
 *  sistema tem, e a manutenção com o que ela costuma cobrir. Os valores ficam
 *  em branco - infra se consulta, não se chuta -, e o de manutenção vem de fora,
 *  sugerido pelo contrato. */
export function infraEmBranco(manutencao = ''): InfraManutencao {
  const vazio = { otimista: '', realista: '', pessimista: '' };
  return {
    premissas: { ...vazio },
    itens: [
      { servico: 'Servidor da aplicação', detalhe: '', valores: { ...vazio } },
      { servico: 'Banco de dados', detalhe: '', valores: { ...vazio } },
    ],
    fonte: '',
    manutencao: {
      valor: manutencao,
      unidade: 'por mês, a partir do go-live',
      inclui: ['Correção de falhas', 'Atualizações de segurança', 'Monitoramento e backups'],
      naoInclui: ['Funcionalidades novas', 'O custo da própria infraestrutura'],
    },
    nota: '',
  };
}
