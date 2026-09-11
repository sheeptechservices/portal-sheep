// ─────────────────────────────────────────────────────────────────────────────
//  Contrato de prestação de serviços ao cliente: o texto, e os pontos onde ele
//  muda.
//
//  O texto é o do contrato assinado com o grupo 3S/A em 25/06/2026, transcrito
//  por inteiro. Aqui a casa é a CONTRATADA e quem contrata é o cliente - o
//  oposto do contrato de colaborador, onde a Sheep é a CONTRATANTE.
//
//  Como no modelo do colaborador, fora os campos nem uma vírgula muda, e isso
//  inclui o que parece erro e é: "PRESTRAÇÃO" no título, "VIGENCIA" sem acento
//  na seção VI, e a numeração romana que pula o X, repete o IX no fim e escreve
//  "IX – FORO DO CONTRATO" depois do XII.
//
//  Dois trechos fogem da transcrição literal, e por um motivo só: o documento
//  assinado é de um projeto de agentes de IA, e nomeia essa tecnologia dentro de
//  cláusulas que valem para qualquer projeto. Repetir "os agentes de
//  inteligência artificial" num contrato de BI seria transcrever fielmente a
//  coisa errada. Onde o original nomeia o projeto do 3S/A, o texto passou a
//  dizer "as soluções" e "as entregas" - e está marcado abaixo, um a um. São os
//  dois únicos: das 46 frases do contrato assinado, as outras 44 saem daqui
//  palavra por palavra.
//
//  Os travessões (–) são os do documento e ficam, embora o padrão de escrita da
//  casa peça hífen: aqui o que vale é ser idêntico ao que foi assinado.
// ─────────────────────────────────────────────────────────────────────────────
import type { Paragrafo } from './docx';
import { dia } from './datas';
import { numeroPorExtenso, reaisEmNumero, reaisPorExtenso } from './extenso';

export interface DadosServicos {
  // ── A CONTRATANTE: o cliente que contrata a casa ──────────────────────────
  razaoSocial: string;
  cnpj: string;
  /** Logradouro, número e complemento: "Rua Saldanha Marinho, 374, Sala 701". */
  endereco: string;
  bairro: string;
  cep: string;
  /** Cidade e estado, como o contrato escreve: "Florianópolis - SC". */
  cidade: string;

  // ── O objeto: o que está sendo contratado (cláusula 1ª) ───────────────────
  /** Completa "em especial para ...": "desenvolver agentes de inteligência
   *  artificial que possam automatizar tarefas a serem mapeadas na fase inicial
   *  de diagnóstico". */
  objeto: string;
  /** Completa "terá como principal objetivo ... o ...": "desenvolvimento de
   *  agentes de IA para automatizar tarefas...". */
  solucao: string;
  /** As empresas do grupo que o escopo alcança, uma por item. Lista vazia tira
   *  o parágrafo inteiro. Quem junta com vírgula e "e" é o contrato. */
  empresasDoGrupo: string[];
  /** Semanas de diagnóstico e de implantação presenciais. Zero nos dois tira o
   *  parágrafo, e tira também a ressalva da modalidade na cláusula 3ª. */
  semanasDiagnostico: number;
  semanasImplantacao: number;
  /** O que fica de fora, um por linha. Saem como "(i) ...; e (ii) ...". */
  naoIncluso: string[];

  // ── O que muda dentro das cláusulas ───────────────────────────────────────
  /** Home Office, Presencial, Híbrido (cláusula 3ª). */
  modalidade: string;
  /** Valor mensal, em reais (cláusula 5ª). */
  remuneracaoMensal: number;
  /** Dias para pagar depois da nota fiscal (cláusula 7ª). */
  prazoPagamentoDias: number;
  /** Percentual do valor mensal previsto para a manutenção (cláusula 10ª). */
  manutencaoPercent: number;
  /** Prazo mínimo, em meses, e o início da vigência (cláusula 11ª). */
  vigenciaMeses: number;
  dataInicio: string;
  /** Multa de rescisão dentro do prazo mínimo, em % (cláusula 11ª). */
  multaRescisaoPercent: number;
  /** Cidade e data do fecho. */
  cidadeAssinatura: string;
  dataAssinatura: string;
}

// ── As medidas da folha ────────────────────────────────────────────────────
//
//  As mesmas do contrato de colaborador, que saíram do arquivo assinado: a
//  abertura em entrelinha simples e o corpo em 1,08 linha.
const ABERTURA = 13.3;
const CORRIDO = 14.33;
/** Onde o original deixa uma linha em branco entre parágrafos. */
const PULA_LINHA = 30.3;

const p = (texto: string, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto }], depois, entrelinha });

// Como no outro modelo, só o primeiro título de seção vai em negrito; os
// romanos que vêm depois são texto comum.
const secao = (texto: string, negrito = false, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto, negrito }], alinhamento: 'esquerda', depois, entrelinha });

const centrado = (texto: string, negrito = false, depois?: number, entrelinha?: number): Paragrafo =>
  ({ trechos: [{ texto, negrito }], alinhamento: 'centro', depois, entrelinha });

const esquerda = (texto: string, depois?: number): Paragrafo =>
  ({ trechos: [{ texto }], alinhamento: 'esquerda', depois });

/** "1 (uma) semana", "2 (duas) semanas" - o número escrito das duas formas, que
 *  é como o contrato conta prazo. */
const quantas = (n: number, singular: string, plural: string) =>
  `${n} (${numeroPorExtenso(n, 'f')}) ${n === 1 ? singular : plural}`;

const quantos = (n: number, singular: string, plural: string) =>
  `${n} (${numeroPorExtenso(n)}) ${n === 1 ? singular : plural}`;

/**
 * As etapas do projeto, como estão no contrato assinado.
 *
 * Fixas, e não campo de formulário: elas descrevem como a casa entrega, e não o
 * que este cliente comprou. O que muda de um contrato para o outro é o objeto,
 * que tem campo próprio logo acima delas. Deixá-las editáveis convidava a
 * reescrever, contrato a contrato, a única parte do texto que deveria ser a
 * mesma em todos.
 */
const ETAPAS = [
  'Planejamento: levantamento inicial de requisitos por meio de entrevistas (Q&A), visita '
  + 'técnica presencial para aprofundar nos requisitos levantados, construção do PA (Plano de '
  + 'Ação), refino e apresentação do PA.',
  'Desenvolvimento: setup e arquitetura, UX/UI Design e telas, testes de MVP e ajustes, e '
  + 'deploy das automações, além de visita presencial para implantação das entregas.',
  'Go-live: operação assistida das automações entregues.',
  'Treinamento: documentação e treinamento (knowledge transfer) para a equipe da CONTRATANTE.',
];

const ORDINAIS = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'sexto'];
const ROMANOS_MINUSCULOS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

/** "A, B e C" - a lista corrida do parágrafo do grupo. */
function juntarComE(itens: string[]): string {
  if (itens.length < 2) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/** "(i) uma coisa; e (ii) outra." - a lista embutida no parágrafo, como o
 *  original a escreve. */
function enumerarNoTexto(itens: string[]): string {
  const marcados = itens.map((t, i) => `(${ROMANOS_MINUSCULOS[i] ?? i + 1}) ${t}`);
  if (marcados.length === 1) return `${marcados[0]}.`;
  return `${marcados.slice(0, -1).join('; ')}; e ${marcados[marcados.length - 1]}.`;
}

/** O contrato inteiro, pronto para virar .docx ou PDF. */
export function contratoServicos(d: DadosServicos): Paragrafo[] {
  const valor = `${reaisEmNumero(d.remuneracaoMensal)} (${reaisPorExtenso(d.remuneracaoMensal)})`;
  const temPresencial = d.semanasDiagnostico > 0 || d.semanasImplantacao > 0;

  // Os parágrafos da cláusula 1ª são numerados na ordem em que sobrarem: sem
  // empresas do grupo, o que era "Parágrafo segundo" passa a ser o primeiro.
  // Numerar por posição fixa deixaria buraco na contagem de um contrato que não
  // tem grupo nenhum, e buraco em contrato se lê como página faltando.
  const paragrafosDoObjeto: string[] = [];

  if (d.empresasDoGrupo.length) {
    paragrafosDoObjeto.push(
      `Não obstante o presente contrato ser celebrado em nome do grupo ${d.razaoSocial}, `
      + 'fica expressamente acordado que o escopo dos serviços ora contratados contemplará as '
      + `empresas ${juntarComE(d.empresasDoGrupo)}, de modo que as soluções desenvolvidas pela `
      // O assinado diz aqui "os agentes de inteligência artificial e as automações
      // desenvolvidas". Genérico porque o parágrafo vale para qualquer projeto.
      + 'CONTRATADA poderão abranger as operações e processos das referidas empresas, '
      + 'conforme venham a ser mapeados na fase de diagnóstico.',
    );
  }

  if (temPresencial) {
    const partes = [
      d.semanasDiagnostico > 0 ? `${quantas(d.semanasDiagnostico, 'semana', 'semanas')} de diagnóstico presencial` : '',
      // O assinado diz "destinado à confecção dos agentes de inteligência
      // artificial". Mesmo motivo do parágrafo acima.
      'o prazo de execução destinado à confecção das entregas',
      d.semanasImplantacao > 0 ? `${quantas(d.semanasImplantacao, 'semana', 'semanas')} de implantação presencial` : '',
    ].filter(Boolean);
    paragrafosDoObjeto.push(
      `Os serviços contratados incluem ${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}. `
      + 'As datas das visitas presenciais serão previamente acordadas entre as partes após o '
      + 'início do projeto.',
    );
  }

  if (d.naoIncluso.length) {
    paragrafosDoObjeto.push(
      'Não estão inclusos no presente instrumento, devendo ser negociados e contratados à '
      + `parte: ${enumerarNoTexto(d.naoIncluso)}`,
    );
  }

  paragrafosDoObjeto.push(
    'Os serviços serão desenvolvidos e prestados de acordo com as necessidades, condições e '
    + 'especificações fornecidas pela CONTRATANTE desde que estejam contemplados neste '
    + 'contrato. Para isso, será desenvolvido um PA (Plano de Ação) em conjunto com a '
    + 'CONTRATANTE na primeira fase do projeto, garantindo assim o alinhamento das '
    + 'expectativas.',
  );

  return [
    centrado('CONTRATO DE PRESTRAÇÃO DE SERVIÇOS E TERMO DE COMPROMISSO DE CONFIDENCIALIDADE',
      true, 13.2, ABERTURA),

    // A casa, de cor: quem presta o serviço é sempre ela, e trocar de diretor
    // é trocar esta linha - não é campo de formulário, é quem assina pela Sheep.
    {
      trechos: [
        { texto: 'SHEEP TECHNOLOGY SERVICES', negrito: true },
        {
          texto: ', pessoa jurídica, inscrita no CNPJ sob o nº 50.836.466/0001-08, com nome '
            + 'fantasia SHEEP TECHNOLOGY SERVICES, com sede na cidade de Maringá - PR, na RUA '
            + 'VEREADOR BASÍLIO SAUTCHUCK, nº 896, bairro Zona 01, Cep nº 87013-190, neste ato '
            + 'representada pelo seu diretor THALES PRIMAVERA CARNEIRO, Brasileiro, Casado, '
            + 'RG nº 16.752-470, e CPF nº 101.280.386-40, ora ',
        },
        { texto: 'CONTRATADA,', negrito: true },
      ],
      depois: 13.3,
      entrelinha: ABERTURA,
    },

    {
      trechos: [
        { texto: `CONTRATANTE: ${d.razaoSocial}`, negrito: true },
        {
          texto: ', pessoa jurídica de direito privado, devidamente inscrita no CNPJ sob o '
            + `n.º ${d.cnpj}, com sede na ${d.endereco}, bairro ${d.bairro}, Cep nº ${d.cep}, `
            + `${d.cidade}, ora `,
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
      + `serviços na área de tecnologia, em especial para ${d.objeto}.`, 12.2, ABERTURA),
    p('A solução desenvolvida terá como principal objetivo, conforme apresentado em proposta, '
      + `o ${d.solucao}, contemplando as seguintes etapas:`),
    ...ETAPAS.map((etapa, i) => p(`${i + 1}. ${etapa}`)),

    ...paragrafosDoObjeto.map((texto, i) => p(`Parágrafo ${ORDINAIS[i]} – ${texto}`)),

    secao('I – CONDIÇÕES GERAIS DO CONTRATO'),
    p('2ª – Os serviços contratados serão executados mediante PA definido junto com a '
      + 'CONTRATANTE, que a partir deste material deverá executar os serviços em conformidade '
      + 'com as normas e condições estabelecidas no presente contrato.'),
    p('3ª – Os serviços contratados serão prestados pelo time alocado pela CONTRATADA com '
      + 'orientação e gestão técnica da CONTRATADA. O time alocado seguirá durante toda a '
      + `alocação na modalidade ${d.modalidade}`
      + (temPresencial
        ? ', com exceção dos períodos de visita técnica e implantação já previamente '
          + 'mencionados.'
        : '.')),

    secao('II – MANUTENÇÃO DE SIGILO'),
    p('4ª – A CONTRATADA, compromete-se a manter o mais completo e absoluto sigilo sobre '
      + 'quaisquer dados, materiais, informações, documentos, especificações técnicas ou '
      + 'comerciais, inovações e aperfeiçoamentos obtidos da CONTRATANTE, ou que venha a lhe '
      + 'ser confiado em razão deste contrato, sejam eles de interesse da CONTRATANTE ou de '
      + 'terceiros, não podendo, sob qualquer pretexto, divulgar, revelar, reproduzir, utilizar '
      + 'ou deles dar conhecimento a terceiros, estranhos a esta contratação sem a prévia '
      + 'anuência e concordância da CONTRATANTE.'),

    secao('III – REMUNERAÇÃO DOS SERVIÇOS'),
    p('5ª – A título de remuneração pelos serviços prestados, a CONTRATANTE pagará à '
      + `CONTRATADA, o valor ${valor} por mês enquanto o projeto estiver em andamento.`),
    p('6ª – Os valores cobrados por hora de desenvolvedor sofrerão ajuste automático no início '
      + 'de cada ano, conforme IPCA (Índice Nacional de Preços ao Consumidor Amplo).'),
    p('Parágrafo Único – A forma de pagamento da remuneração dos serviços prestados será feita '
      + 'por meio de pix ou em conta corrente da CONTRATADA.', PULA_LINHA),

    secao('IV – PRAZOS E CONDIÇÕES DO PAGAMENTO DA REMUNERAÇÃO'),
    p('7ª – O prazo para o pagamento da remuneração pelos serviços prestados pela CONTRATADA '
      + `será de até ${d.prazoPagamentoDias} dias após o recebimento da Nota Fiscal de Serviços.`),

    secao('V – DIREITOS DE PROPRIEDADE INDUSTRIAL, AUTORAL E INTELECTUAL'),
    p('8ª – Todo e qualquer produto desenvolvido pela CONTRATADA para a CONTRATANTE durante '
      + 'todo a vigência do contrato é de propriedade da CONTRATANTE. Com exceção soluções que '
      + 'já estejam prontas e serão apenas adaptadas para uso da CONTRATANTE.'),
    p('9ª – É de inteira responsabilidade da CONTRATANTE, quaisquer aplicações, licenças e '
      + 'softwares necessários para desenvolvimento de qualquer necessidade solicitada pela '
      + 'CONTRATANTE. Além de toda parte de infra e manutenção, que já foram previamente '
      + 'apresentados em proposta e não estão contemplados nos valores apresentados neste '
      + 'contrato.'),
    p('10ª – Valores referente a manutenção das aplicações após a entrega não estão previstos '
      + 'neste instrumento e serão negociados após a entrega do projeto, tendo um custo inicial '
      + `previsto em ${d.manutencaoPercent}% do valor mensal desta proposta, podendo ter este `
      + 'percentual revisado até o final do projeto de acordo com as demandas e necessidades '
      + 'que surgirem. Demandas adicionais durante o período de desenvolvimento em contrato da '
      + 'aplicação não serão consideradas manutenção, e poderão ser necessárias revisões no '
      + 'cronograma para inclusão. A manutenção só terá início após a conclusão do projeto e '
      + 'caso seja de interesse da CONTRATANTE.'),

    secao('VI – PRAZO DE VIGENCIA E HIPÓTESES DE RESCISÃO'),
    p(`11ª – O presente contrato vigorará com prazo mínimo de ${d.vigenciaMeses} meses, com `
      + `início na data de ${dia(d.dataInicio)}, podendo o período mínimo ser revisado após o `
      + 'levantamento das demandas e apresentação do PA caso seja necessário mais tempo para '
      + 'desenvolvimento do projeto, o tema será tratado caso necessário através de um aditivo '
      + 'a este contrato. A renovação será negociada com a CONTRATANTE após este período. Caso '
      + 'exista necessidade de rescisão contratual por qualquer uma das partes, dentro do '
      + `período mínimo previsto neste instrumento, uma multa de ${d.multaRescisaoPercent}% em `
      + 'relação ao valor total do período restante previsto neste instrumento, deverá ser '
      + 'aplicada.'),
    p('12ª – Qualquer omissão ou tolerância em exigir o estrito cumprimento de quaisquer termos '
      + 'ou condições deste contrato, ou em exercer direito dele decorrente, não constituirá '
      + 'renúncia a eles e não prejudicará assim, a faculdade de qualquer das partes em '
      + 'exigi-los ou exercê-los a qualquer tempo.'),

    secao('VII – LIMITE DE RESPONSABILIDADE'),
    p('13ª – A CONTRATADA não se responsabiliza por eventuais atrasos que possam ocorrer '
      + 'durante a prestação dos serviços ora contratados, conforme cronogramas estabelecidos '
      + 'pelas partes, desde que provocadas por problemas alheios a sua vontade ou força maior, '
      + 'bem como na indisponibilidade do equipamento fornecido para execução dos serviços e/ou '
      + 'solicitações de modificações formuladas posteriormente pela CONTRATANTE, e/ou ausência '
      + 'ou morosidade de informações complementares que, por ventura se fizerem necessárias, '
      + 'ocasionando interrupção no desenvolvimento e criação dos produtos.'),

    secao('VIII – DISPOSIÇÕES FINAIS'),
    p('14ª – No valor da remuneração devida à CONTRATADA já estão incluídos todas e quaisquer '
      + 'despesas, inclusive aquelas referentes a impostos, taxas e contribuições, ficando '
      + 'expressamente entendido que a CONTRATADA bem como seus funcionários e/ou preposto '
      + 'utilizados na execução dos serviços ora contratados, não tem nenhuma subordinação '
      + 'administrativa ou funcional com a CONTRATANTE, não se estabelecendo desta forma, '
      + 'qualquer vínculo empregatício entre a CONTRATADA ou prestadores de serviços com a '
      + 'CONTRATANTE.'),
    p('Parágrafo Único: - A celebração do presente não implica em nenhuma espécie de sociedade, '
      + 'associação, solidariedade obrigacional, nem em qualquer responsabilidade direta ou '
      + 'indireta, seja societária, comercial, tributária, trabalhista, previdenciárias ou de '
      + 'qualquer outra natureza, nem em alienação ou sucessão, seja entre as partes, seus '
      + 'empregados ou prepostos, seja perante terceiros, estando preservada a autonomia '
      + 'jurídica e funcional de cada uma das partes.'),

    secao('IX – DO NÃO ALICIAMENTO'),
    p('15ª – As partes concordam que durante a vigência deste contrato e pelo período de 5 anos '
      + '(cinco anos) após o seu término, nenhum dos envolvidos deverá, direta ou indiretamente, '
      + 'aliciar, contratar ou empregar qualquer funcionário, colaborador, consultor ou terceiro '
      + 'contratado pela outra parte, com o objetivo de prejudicar ou interferir nos interesses '
      + 'comerciais da parte afetada.'),
    p('16ª – Fica estabelecido que a cláusula de não aliciamento se aplica a todas as pessoas '
      + 'relacionadas à outra parte, incluindo, mas não se limitando a, funcionários, '
      + 'colaboradores, consultores, terceiros contratados, fornecedores e clientes.'),
    p('17ª – Caso alguma das partes descumpra a cláusula de não aliciamento, a parte prejudicada '
      + 'terá o direito de buscar as medidas legais cabíveis, incluindo ações de reparação de '
      + 'danos, indenizações, e/ou medidas cautelares. A parte que descumprir a cláusula, ainda '
      + 'pagará uma multa no valor de R$ 50.000,00 (cinquenta mil reais).'),
    p('18ª – As partes reconhecem que esta cláusula é essencial para a proteção dos seus '
      + 'respectivos interesses comerciais, e concordam em manter sua confidencialidade, não '
      + 'divulgando seu conteúdo para terceiros, exceto quando necessário para o cumprimento das '
      + 'obrigações contratuais ou quando exigido por lei.'),
    p('19ª – A presente cláusula de não aliciamento sobreviverá à rescisão ou término deste '
      + 'contrato, continuando plenamente válida e eficaz até o fim do período estabelecido na '
      + 'cláusula 11.'),
    p('20ª – Esta cláusula é independente e separável das demais disposições deste contrato, e a '
      + 'sua invalidade ou inexequibilidade não afetará a validade ou exequibilidade das demais '
      + 'cláusulas.'),

    secao('XI – DA NÃO CONCORRÊNCIA'),
    p('21ª - Durante o período de prestação de serviços/negociações/relações comerciais, que '
      + 'estiverem ocorrendo seja de forma direta ou indireta, relacionada ao objeto do contrato '
      + 'ou qualquer outro que possa competir com a contratante é terminantemente proibida a '
      + 'concorrência, ou seja, a operação de qualquer espécie que possa gerar a concorrência em '
      + 'relação à parte que contratou.'),

    secao('XII – LEI GERAL DE PROTEÇÃO DE DADOS (LGPD)'),
    p('22ª - As Partes reconhecem a importância da proteção de dados pessoais e se comprometem '
      + 'a cumprir integralmente as disposições da Lei Geral de Proteção de Dados Pessoais '
      + '(LGPD) – Lei nº 13.709/2018 e demais normas complementares.'),

    secao('IX – FORO DO CONTRATO'),
    p('23ª – As partes elegem o foro central da Comarca da Sede da CONTRATADA, como único e '
      + 'competente, para reconhecer e dirimir quaisquer questões oriundas do presente contrato, '
      + 'como expressas renúncia de qualquer outro foro, por mais privilegiado que seja.'),

    p('E por estarem justos e contratados, firmam o presente contrato em '
      + `${quantas(2, 'via', 'vias')} de igual teor e forma, na presença de `
      + `${quantas(2, 'testemunha', 'testemunhas')}.`, PULA_LINHA),

    esquerda(`${d.cidadeAssinatura}, ${dia(d.dataAssinatura)}.`, PULA_LINHA),

    esquerda('Contratante: ___________________________________________________'),
    esquerda(d.razaoSocial, PULA_LINHA),
    esquerda('Contratada: ____________________________________________________'),
    esquerda('SHEEP TECHNOLOGY SERVICES', PULA_LINHA),

    esquerda('Testemunhas:'),
    esquerda('1ª) ___________________________________________________________'),
    esquerda('2ª) ___________________________________________________________'),
  ];
}

