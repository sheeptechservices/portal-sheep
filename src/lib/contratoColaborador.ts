// ─────────────────────────────────────────────────────────────────────────────
//  Contrato de colaborador: o texto, e os poucos pontos onde ele muda.
//
//  O texto é o do modelo assinado da casa, transcrito por inteiro. Só os
//  trechos marcados como campo mudam de um contrato para o outro: quem é a
//  contratada, em que modalidade trabalha, quanto e quando se paga, e as datas.
//  Todo o resto - objeto, sigilo, propriedade intelectual, rescisão, não
//  concorrência, foro - é fixo, e é assim que tem de continuar.
//
//  O texto é transcrição literal do modelo assinado, e é para continuar assim:
//  fora os campos, nem uma vírgula muda. Isso inclui o que parece erro e é -
//  "PRESTRAÇÃO" no título, "minímo", "duarante", "perído", "recisão", "9,610",
//  "SHEEP TECNOLOGY" na assinatura e a numeração romana que repete o VII e pula
//  VIII e XI.
//
//  Uma exceção, aberta em 10/09/2026: o espaço que faltava antes da modalidade
//  na cláusula 3ª entrou. Ali o vão não é erro de digitação do modelo, é emenda
//  da máquina - o campo entra colado na palavra que o anuncia, e "na
//  modalidadeHome Office" aparece impresso em todo contrato que sai daqui.
//
//  Os travessões (–) são os do documento e ficam, embora o padrão de escrita da
//  casa peça hífen: aqui o que vale é ser idêntico ao que foi assinado, e não a
//  régua de estilo do produto. Só cláusula 8ª, 10ª e 13ª levam hífen ou traço
//  nenhum, porque é assim que estão no original.
// ─────────────────────────────────────────────────────────────────────────────
import type { Paragrafo } from './docx';
import { reaisEmNumero, reaisPorExtenso } from './extenso';

export interface DadosColaborador {
  // ── A CONTRATADA: a pessoa jurídica de quem presta o serviço ──────────────
  razaoSocial: string;
  cnpj: string;
  nomeFantasia: string;
  cidade: string;
  /** Logradouro e número, como vai no contrato: "Avenida Olívia de Castro, nº 260". */
  endereco: string;
  bairro: string;
  cep: string;
  representante: string;
  nacionalidade: string;
  estadoCivil: string;
  rg: string;
  cpf: string;

  // ── O que muda dentro das cláusulas ───────────────────────────────────────
  /** Home Office, Presencial, Híbrido (cláusula 3ª). */
  modalidade: string;
  /** Remuneração mensal, em reais (cláusula 5ª). */
  remuneracao: number;
  /** Total aproximado de horas por mês (cláusula 5ª). */
  horasMes: number;
  /** Dias para pagar depois da nota fiscal (cláusula 6ª). */
  prazoPagamentoDias: number;
  /** Início da vigência, em ISO (cláusula 10ª). */
  dataInicio: string;
  /** Cidade e data do fecho. */
  cidadeAssinatura: string;
  dataAssinatura: string;
}

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** "11/03/2024". Fatiado da string ISO, e não pelo `Date`: às 21h de Maringá o
 *  `new Date('2024-03-11')` já é dia 10. */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/** "02 de abril de 2024", como o fecho do contrato escreve. */
export function dataExtenso(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d} de ${MESES[Number(m) - 1]} de ${a}`;
}

// ── As medidas da folha, tiradas do contrato assinado ──────────────────────
//
//  A abertura do documento - título, preâmbulo, DO OBJETO e a 1ª cláusula - foi
//  digitada com entrelinha simples; do "Parágrafo primeiro" em diante o Word
//  passou a usar 1,08 linha. Não é escolha de desenho, é como o arquivo veio, e
//  reproduzir isso é o que faz cada linha cair na mesma altura do original.
const ABERTURA = 13.3;         // entrelinha simples da Tahoma 11
const CORRIDO = 14.33;         // 1,08 linha, o resto do contrato
/** Onde o original deixa uma linha em branco entre parágrafos. */
const PULA_LINHA = 30.3;

const p = (texto: string, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto }], depois, entrelinha });

// O documento assinado só põe em negrito o primeiro título de seção. Os
// romanos que vêm depois são texto comum, e é assim que ficam.
const secao = (texto: string, negrito = false, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto, negrito }], alinhamento: 'esquerda', depois, entrelinha });

const centrado = (texto: string, negrito = false, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto, negrito }], alinhamento: 'centro', depois, entrelinha });

const esquerda = (texto: string, depois?: number): Paragrafo =>
  ({ trechos: [{ texto }], alinhamento: 'esquerda', depois });

/** O contrato inteiro, pronto para virar .docx. */
export function contratoColaborador(d: DadosColaborador): Paragrafo[] {
  const valor = `${reaisEmNumero(d.remuneracao)} (${reaisPorExtenso(d.remuneracao)})`;

  return [
    centrado('CONTRATO DE PRESTRAÇÃO DE SERVIÇOS E TERMO DE COMPROMISSO DE CONFIDENCIALIDADE',
      true, 13.2, ABERTURA),

    {
      trechos: [
        { texto: `${d.razaoSocial},`, negrito: true },
        { texto: ` pessoa jurídica, inscrita no CNPJ sob o nº ${d.cnpj}, com nome fantasia ` },
        { texto: d.nomeFantasia, negrito: true },
        {
          texto: `, com sede na cidade de ${d.cidade}, na ${d.endereco}, bairro ${d.bairro}, `
            + `Cep nº ${d.cep}, neste ato representada pelo seu diretor ${d.representante}, `
            + `${d.nacionalidade}, ${d.estadoCivil}, RG nº ${d.rg}, e CPF nº ${d.cpf}, ora `
            + 'CONTRATADA,',
        },
      ],
      depois: 13.3,
      entrelinha: ABERTURA,
    },

    {
      trechos: [
        { texto: 'CONTRATANTE: SHEEP TECHNOLOGY SERVICES', negrito: true },
        {
          texto: ', pessoa jurídica de direito privado, devidamente inscrita no CNPJ sob o '
            + 'n.º 50.836.466/0001-08, com sede à Rua Vereador Basílio Sautchuck, nº 896, '
            + 'bairro Zona 01, Cep nº 87013-190, Maringá - PR, ora ',
        },
        { texto: 'CONTRATANTE', negrito: true },
        {
          texto: ', tendo em vista o interesse comum, resolvem celebrar o presente CONTRATO '
            + 'DE PRESTAÇÃO DE SERVIÇOS, que se regerá pelas seguintes cláusulas:',
        },
      ],
      depois: 26.5,
      entrelinha: ABERTURA,
    },

    secao('DO OBJETO', true, 22.4, ABERTURA),
    p('1ª – A CONTRATANTE, por intermédio do presente instrumento, contrata os serviços '
      + 'especializados da CONTRATADA na área de desenvolvimento e criação de produtos e '
      + 'serviços na área de informática, em especial para atender demandas de desenvolvimento '
      + 'para os clientes da CONTRATANTE.', 12.2, ABERTURA),
    p('Parágrafo primeiro – Os serviços serão desenvolvidos e prestados de acordo com as '
      + 'necessidades, condições e especificações fornecidas pela CONTRATANTE.'),

    secao('II – CONDIÇÕES GERAIS DO CONTRATO'),
    p('2ª – Os serviços contratados serão executados mediante solicitação da CONTRATANTE à '
      + 'CONTRATADA, que a partir desta solicitação deverá executar os serviços em conformidade '
      + 'com as normas e condições estabelecidas no presente contrato.'),
    // O modelo assinado nomeava aqui o cliente que a pessoa ia atender. Saiu:
    // este é o contrato do colaborador com a casa, e o cliente que ele atende é
    // da CONTRATANTE, muda ao longo do contrato e não pertence a este papel.
    p(`3ª – Os serviços contratados serão prestados com orientação e responsabilidade técnica `
      + `da CONTRATADA, na modalidade ${d.modalidade}, de conformidade com os cronogramas de `
      + `execução dos serviços, estabelecido de comum acordo entre as partes contratantes, `
      + `devendo sempre ser respeitado e priorizado as necessidades da CONTRATANTE.`),

    secao('III – MANUTENÇÃO DE SIGILO'),
    p('4ª – A CONTRATADA, durante a vigência do presente contrato e nos 3 (três) anos '
      + 'subsequentes ao seu término ou rescisão, obriga-se a manter o mais completo e absoluto '
      + 'sigilo sobre quaisquer dados, materiais, informações, documentos, especificações '
      + 'técnicas ou comerciais, inovações e aperfeiçoamentos obtidos da CONTRATANTE, ou que '
      + 'venha a lhe ser confiado em razão deste contrato, sejam eles de interesse da '
      + 'CONTRATANTE ou de terceiros, não podendo, sob qualquer pretexto, divulgar, revelar, '
      + 'reproduzir, utilizar ou deles dar conhecimento a terceiros, estranhos a esta '
      + 'contratação sem a prévia anuência e concordância da CONTRATANTE.'),
    p('Parágrafo Primeiro – A inobservância do disposto na presente cláusula, sujeitará a '
      + 'CONTRATADA as penalidades decorrentes da violação e quebra de sigilo contratual '
      + 'apurado na multa de R$ 10.000,00 (dez mil reais) sem prejuízo de arcar com as perdas e '
      + 'danos decorrentes do seu ato, apurado em processo judicial competente para esta '
      + 'finalidade.'),
    p('Ocorrendo esta hipótese, a CONTRATANTE poderá tomar todas às providencias de ordem legal '
      + 'contra a CONTRATADA violadora do sigilo, contando para tanto com a assessoria.'),

    secao('IV – REMUNERAÇÃO DOS SERVIÇOS'),
    p(`5ª – A título de remuneração pelos serviços prestados, a CONTRATANTE pagará à `
      + `CONTRATADA, a quantia de ${valor} para um total aproximado de ${d.horasMes}h por mês, `
      + `a depender da quantidade de dias úteis de cada mês.`),
    p('A CONTRATANTE fará a liberação do pagamento, mediante a apresentação dos apontamentos '
      + 'diários das horas trabalhadas e mediante a apresentação da competente Nota Fiscal de '
      + 'Serviços.'),
    p('Parágrafo Único – A forma de pagamento da remuneração dos serviços prestados será feita '
      + 'por qualquer título admitido em direito.', PULA_LINHA),

    secao('V – PRAZOS E CONDIÇÕES DO PAGAMENTO DA REMUNERAÇÃO'),
    p(`6ª – O prazo para o pagamento da remuneração pelos serviços prestados pela CONTRATADA `
      + `será de ${d.prazoPagamentoDias} dias após o recebimento da Nota Fiscal de Serviços.`),

    secao('VII – DIREITOS DE PROPRIEDADE INDUSTRIAL, AUTORAL E INTELECTUAL'),
    p('7ª – Os direitos de propriedade industrial, autoral ou intelectual, sobre os serviços '
      + 'prestados, projetos e produtos, incluindo-se neste conceito os métodos, base de dados, '
      + 'programas, softwares bem como quaisquer trabalhos que vierem a ser desenvolvidos ou '
      + 'criados pela CONTRATADA e que sejam suscetíveis de exploração econômica, ficarão '
      + 'automaticamente licenciados gratuitamente para a CONTRATANTE, que desta forma poderá '
      + 'comercializá-los ou sublicenciá-los a seus clientes.'),
    p('Parágrafo Único – Se a CONTRATADA utilizar durante a execução dos serviços objeto do '
      + 'presente contrato, produtos de sua autoria e devidamente registrado pela mesma perante '
      + 'o Instituto Nacional de Propriedade Intelectual – INPI, não se aplicará esta cláusula.'),
    p('8ª - Para os fins do disposto nas Leis n° 9.279 de 14/05/96, n° 9.609 de 19/02/98 e n° '
      + '9,610 de 19/02/98, a CONTRATANTE poderá utilizar tais obras, programas, trabalhos e '
      + 'softwares como lhe aprouver, sem nenhum pagamento adicional à CONTRATADA durante não '
      + 'só prazo de vigência do presente contrato, como também pelo prazo de proteção conferido '
      + 'pelas Leis retro citadas.'),
    p('9ª – O desenvolvimento das obras ou produtos pela CONTRATADA, objeto deste contrato, '
      + 'deverá ocorrer em caráter exclusivo à CONTRATANTE que será a única a explorá-los '
      + 'comercialmente durante a vigência do presente instrumento.'),
    p('Parágrafo Primeiro – O licenciamento previsto nesta cláusula abrange também eventuais '
      + 'aperfeiçoamentos técnicos que vierem a serem efetuados pela CONTRATADA nas obras ou '
      + 'produtos objeto de licenciamento.'),
    p('Parágrafo Segundo – Para fins do disposto nesta cláusula, a CONTRATADA se obriga a '
      + 'assinar os eventuais instrumentos de licenciamento, cessão e transferência de direitos '
      + 'que se fizerem necessários para o cumprimento da obrigação ora avençada.'),

    secao('VII – PRAZO DE VIGENCIA E HIPÓTESES DE RESCISÃO'),
    p(`10ª O presente contrato vigorará sem prazo determinado, com início na data de `
      + `${dataBr(d.dataInicio)}, podendo ser rescindido a qualquer momento, por qualquer das `
      + `partes, sem necessidade de fundamentação, bastando a simples notificação com um prazo `
      + `minímo de 30 dias. Feita a notificação, deverá ser cumprido os 30 dias de trabalho após `
      + `a notificação para conclusão da recisão.`),
    p('Não se aplica duarante o primeito mês a notificação prévia citada no parágrafo anterior, '
      + 'visto que será um perído de teste e o contrato poderá ser rescindido a qualquer '
      + 'momento, sendo pago o valor proporcional para o período trabalhado.'),
    p('Parágrafo Primeiro – A inobservância do disposto na presente cláusula, sujeitará o agente '
      + 'as penalidades decorrentes da violação e quebra de sigilo contratual apurado na multa '
      + 'de 5% do valor contratual que será multiplicado pelo número de dias restantes para '
      + 'finalização do período a ser cumprido, limitando-se ao valor de R$ 10000,00 (dez mil '
      + 'reais) , sem prejuízo de arcar com as perdas e danos decorrentes do seu ato, apurado em '
      + 'processo judicial competente para esta finalidade.'),
    p('11ª – Qualquer omissão ou tolerância em exigir o estrito cumprimento de quaisquer termos '
      + 'ou condições deste contrato, ou em exercer direito dele decorrente, não constituirá '
      + 'renúncia a eles e não prejudicará assim, a faculdade de qualquer das partes em '
      + 'exigi-los ou exercê-los a qualquer tempo.', PULA_LINHA),

    secao('IX – LIMITE DE RESPONSABILIDADE'),
    p('12ª – A CONTRATADA assume solidariamente com a CONTRATANTE a responsabilidade, por '
      + 'eventuais prejuízos causados nas funcionalidades dos projetos que a CONTRATADA atuou de '
      + 'forma direta. As partes contratantes deverão sempre limitar o valor das '
      + 'responsabilidades ao do contrato firmado com os clientes da CONTRATANTE e com atuação '
      + 'direta da CONTRATADA.'),
    p('13ª A CONTRATADA não se responsabiliza por eventuais atrasos que possam ocorrer durante a '
      + 'prestação dos serviços ora contratados, conforme cronogramas estabelecidos pelas '
      + 'partes, desde que provocadas por problemas alheios a sua vontade ou força maior, bem '
      + 'como na indisponibilidade do equipamento fornecido para execução dos serviços e/ou '
      + 'solicitações de modificações formuladas posteriormente pela CONTRATANTE e seus '
      + 'clientes, e/ou ausência ou morosidade de informações complementares que, por ventura se '
      + 'fizerem necessárias, ocasionando interrupção no desenvolvimento e criação dos produtos.'),

    secao('X – DISPOSIÇÕES FINAIS'),
    p('14ª – No valor da remuneração devida à CONTRATADA já estão incluídos todas e quaisquer '
      + 'despesas, inclusive aquelas referentes a impostos, taxas e contribuições, ficando '
      + 'expressamente entendido que a CONTRATADA bem como seus funcionários e/ou preposto '
      + 'utilizados na execução dos serviços ora contratados, não tem nenhuma subordinação '
      + 'administrativa ou funcional com a CONTRATANTE, não se estabelecendo desta forma, '
      + 'qualquer vínculo empregatício entre a CONTRATADA ou prestadores de serviços com a '
      + 'CONTRATANTE.'),
    p('Parágrafo Primeiro: - Qualquer reivindicação, na hipótese deste artigo, das empresas '
      + 'clientes da CONTRATANTE e que a CONTRATADA atuou como subcontratada que vierem a ser '
      + 'efetuadas em juízo, ou fora dele serão suportadas de forma isolada e integral pela '
      + 'CONTRATADA, ainda que por ventura sejam efetuados em nome da CONTRATANTE.'),
    p('Ocorrendo esta hipótese, a CONTRATADA assumirá o processo bem como os seus ônus '
      + 'financeiros decorrentes de uma eventual condenação, ficando ainda obrigadas a '
      + 'reembolsar eventuais despesas, custas e honorários eventualmente despendidos pela '
      + 'CONTRATANTE, na defesa de seus direitos e interesses.'),
    p('Parágrafo Segundo: - A celebração do presente não implica em nenhuma espécie de '
      + 'sociedade, associação, solidariedade obrigacional, nem em qualquer responsabilidade '
      + 'direta ou indireta, seja societária, comercial, tributária, trabalhista, '
      + 'previdenciárias ou de qualquer outra natureza, nem em alienação ou sucessão, seja entre '
      + 'as partes, seus empregados ou prepostos, seja perante terceiros, estando preservada a '
      + 'autonomia jurídica e funcional de cada uma das partes.'),
    p('Parágrafo Terceiro: - A CONTRATADA fica responsável pelo pagamento de todos os impostos, '
      + 'taxas ou contribuições sociais, de todo e qualquer indivíduo na prestação dos serviços '
      + 'objeto deste contrato, forma da legislação vigente, bem como garantir a desconstituição '
      + 'de qualquer vínculo trabalhista que venha a ser postulado em face da CONTRATANTE pelo '
      + 'pessoal designado da CONTRATADA.'),

    secao('XII – FORO DO CONTRATO'),
    p('15ª – As partes elegem o foro central da Comarca da Sede da Contratante, como único e '
      + 'competente, para reconhecer e dirimir quaisquer questões oriundas do presente contrato, '
      + 'como expressas renúncia de qualquer outro foro, por mais privilegiado que seja.', PULA_LINHA),

    secao('XIII – DA NÃO CONCORRÊNCIA'),
    p('Durante o período de prestação de serviços/negociações/relações comerciais, que estiverem '
      + 'ocorrendo seja de forma direta ou indireta, relacionada ao objeto do contrato ou '
      + 'qualquer outro que possa competir com a contratante é terminantemente proibida a '
      + 'concorrência, ou seja, a operação de qualquer espécie que possa gerar a concorrência em '
      + 'relação à parte que contratou.'),
    p('Em caso de desobediência do presente contrato, ou seja, havendo a concorrência em '
      + 'qualquer meio relacionada a parte contratante, o contratado deverá pagar uma multa '
      + 'diária no valor de R$ 15000,00 (Quinze mil reais).'),
    p('A aplicação da multa, não impossibilita que a parte contratante possa tomar medidas no '
      + 'âmbito judicial sejam elas de cunhos civis ou criminais, havendo a possibilidade de '
      + 'requerer danos ou perdas.'),
    p('O estabelecido neste documento vale para o contratado, como também, por um terceiro '
      + 'ligado a si.'),

    p('E por estarem justos e contratados, firmam o presente contrato em 2 (duas) vias de igual '
      + 'teor e forma, na presença de 2 (duas) testemunhas.', PULA_LINHA),

    centrado(`${d.cidadeAssinatura}, ${dataExtenso(d.dataAssinatura)}.`),

    // Encostado na margem esquerda, como no documento assinado - centralizar a
    // linha de assinatura tira dela a régua que o dedo segue ao assinar.
    esquerda('Contratante: ___________________________________________________'),
    esquerda('SHEEP TECNOLOGY SERVICES', PULA_LINHA),
    esquerda('Contratada: ____________________________________________________'),
    esquerda(d.representante, PULA_LINHA),

    esquerda('Testemunhas:'),
    esquerda('1ª) ___________________________________________________________'),
    esquerda('2ª) ___________________________________________________________'),
  ];
}
