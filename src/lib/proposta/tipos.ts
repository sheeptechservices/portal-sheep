// ─────────────────────────────────────────────────────────────────────────────
//  O que uma proposta tem, do jeito que a tela pergunta.
//
//  A forma vem da proposta aprovada SHP-LPA-26-01, que a casa mandou seguir à
//  risca: capa, agenda, quem somos, stack, clientes, soluções (esses seis já
//  vêm no template), depois o projeto, uma entrega por slide, como funciona,
//  cronograma, investimento e próximos passos.
//
//  Os nomes das seções não se inventam. É "Entrega 1 · Pacote de BIs", não
//  "Escopo · Módulo A" - e é o `data-secao` de cada slide que monta a agenda
//  sozinha, então esquecer um deixa buraco no índice sem erro nenhum.
// ─────────────────────────────────────────────────────────────────────────────

/** Um protótipo clicável: o HTML que vai dentro do slide, num iframe escalado. */
export interface Prototipo {
  /** O documento inteiro, que entra no `srcdoc` do iframe. A proposta sai como
   *  um arquivo só, sem pasta de assets ao lado. */
  html: string;
  /** O tamanho real em que ele foi desenhado. A LPA usou 1440 de largura. */
  largura: number;
  altura: number;
  titulo: string;
}

export interface Entrega {
  /** Só o nome, sem o "Entrega 1 ·" - a numeração é montada aqui. */
  nome: string;
  resumo: string;
  /** Os pontos da entrega, em `.krl`. Vazio quando há protótipo: o slide do
   *  protótipo é a imagem, e lista ao lado dele rouba a tela. */
  itens: string[];
  prototipo?: Prototipo;
}

/** Uma etapa do cronograma. As quatro numeradas mais a transversal, nesta ordem
 *  e com estes nomes - não existe "Infra e arquitetura" separada, a infra entra
 *  em "Planejamento + setup". */
export interface Fase {
  nome: string;
  /** Em que mês começa e termina, contando de 1. As fases se encavalam de
   *  propósito: é assim que projeto real anda. */
  de: number;
  ate: number;
  /** A transversal atravessa o projeto inteiro, tem textura diagonal e marcador
   *  `*` no lugar do número. */
  transversal?: boolean;
  sub: string[];
  entregas: string[];
}

export interface OpcaoInvestimento {
  /** A etiqueta que flutua na borda do card: "Opção A". */
  rotulo: string;
  /** A linha fina acima do preço: "Roadmap completo". */
  titulo: string;
  /** Só o número: o "R$" vira sobrescrito no template. */
  valor: string;
  /** O que o valor compra: "por mês · 1 desenvolvedor em 8h/dia". */
  unidade: string;
  /** O quadro ao lado do valor: o "R$ 0 no primeiro mês" da LPA. */
  destaque?: { valor: string; texto: string; nota?: string };
  /** Os bullets se espelham entre as opções: a mesma pergunta respondida em
   *  todas, inclusive quando a resposta é ruim. Comparação em que uma coluna
   *  só tem elogio não ajuda a decidir, e o cliente percebe. */
  bullets: string[];
  recomendada?: boolean;
}

export interface PapelDoTime {
  papel: string;
  /** Quantas pessoas ocupam o papel: três devs são um papel com três, e não
   *  três linhas iguais. Ausente vale um - é como as propostas antigas foram
   *  gravadas. */
  quantidade?: number;
  /** "8h por dia". Fica de fora quando o papel não é cobrado: no lugar dela
   *  entra a etiqueta. */
  dedicacao: string;
  /** O que essa pessoa faz no projeto. */
  descricao: string;
  /** Papel que não é cobrado leva etiqueta em destaque. É argumento, não
   *  detalhe. */
  naoCobrado?: boolean;
}

/** Os três cenários de custo de infra, sempre juntos. Infra se estima, não se
 *  sabe: mostrar uma faixa em vez de um número só deixa claro ao cliente que
 *  o valor depende do uso, e protege a casa de um "vocês disseram 300". */
export type Cenario = 'otimista' | 'realista' | 'pessimista';
export const CENARIOS: Cenario[] = ['otimista', 'realista', 'pessimista'];
export const NOME_DO_CENARIO: Record<Cenario, string> = {
  otimista: 'Otimista', realista: 'Realista', pessimista: 'Pessimista',
};

/** Um serviço de nuvem que o sistema usa, com o custo mensal em cada cenário. */
export interface ItemDeInfra {
  /** O que ele é para o cliente: "Servidor da aplicação", "Banco de dados". */
  servico: string;
  /** O que foi precificado: "EC2 t4g.medium, São Paulo, 24h por dia". */
  detalhe: string;
  /** Custo por mês em reais, no formato brasileiro sem o "R$": "412,50". */
  valores: Record<Cenario, string>;
}

/** O slide de infraestrutura e manutenção: o que custa manter o sistema no ar
 *  depois da entrega, que é a pergunta que o cliente faz logo depois do preço. */
export interface InfraManutencao {
  /** O que cada cenário supõe: "até 200 usuários, 5 GB de dados". */
  premissas: Record<Cenario, string>;
  /** De um a seis serviços: é o que cabe na tabela do slide. */
  itens: ItemDeInfra[];
  /** De onde vêm os preços, para quem ler conferir: a tabela da AWS, a região,
   *  a data e o dólar usado. */
  fonte: string;
  manutencao: {
    /** Por mês, em reais, sem o "R$". O padrão da casa é 10% do valor mensal
     *  do contrato. */
    valor: string;
    /** O que o valor compra: "por mês, a partir do go-live". */
    unidade: string;
    inclui: string[];
    /** O que fica fora. Sem essa lista, manutenção vira escopo aberto. */
    naoInclui: string[];
  };
  /** Uma nota curta sob a tabela: o que move o custo de um cenário para outro. */
  nota: string;
}

export interface DadosProposta {
  // ── Capa e fechamento ────────────────────────────────────────────────────
  cliente: string;
  subtitulo: string;
  preparadoPor: string;
  apresentadoPor: string;
  validadeDias: number;

  // ── O projeto ────────────────────────────────────────────────────────────
  projeto: string;
  ganhos: string[];

  entregas: Entrega[];

  /** O modelo de operação: como a fila é priorizada, quem decide, o que
   *  acontece quando a prioridade muda. Sai numa contratação de escopo fechado. */
  comoFunciona?: {
    linhaFina: string;
    passos: { titulo: string; texto: string }[];
    /** A conta que sustenta o prazo: "40 painéis a cinco dias cada dá 7 meses". */
    nota: string;
  };

  cronograma: {
    meses: number;
    fases: Fase[];
  };

  investimento: {
    /** De uma a três, lado a lado no slide. */
    opcoes: OpcaoInvestimento[];
    time: PapelDoTime[];
    /** A hora-homem, a jornada, os dias úteis e a multiplicação que chega ao
     *  valor. Mostrar a conta tira a conversa do "está caro". */
    memoria: string;
  };

  /** Infra e manutenção. Opcional: sai quando não há sistema a manter no ar,
   *  como numa consultoria ou em painéis dentro do Power BI do próprio
   *  cliente. */
  infra?: InfraManutencao;
}

/** Um número escrito no formato brasileiro ("1.234,56", "21.600"), lido como
 *  número. Texto que não é número vale nulo, e não zero: um "[a confirmar]"
 *  somado como zero faria um total que parece certo e não é. */
export function numeroBr(v: string | undefined | null): number | null {
  const s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!/^\d{1,3}(\.\d{3})*(,\d+)?$|^\d+(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Um valor em reais no formato da proposta: sem centavos a partir de mil,
 *  com centavos abaixo disso, que é onde eles ainda dizem alguma coisa. */
export function reaisBr(n: number): string {
  return n.toLocaleString('pt-BR', n >= 1000
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** O que o template pede, e que não muda de proposta para proposta. */
export const CTA_WHATSAPP =
  'https://wa.me/5531982440323?text=Ol%C3%A1%2C%20quero%20dar%20andamento%20na%20proposta%20da%20Sheep%20Technology';

export const PASSOS_DO_FECHAMENTO = [
  'Você confirma o formato',
  'Agendamos o kickoff',
  'Botamos a mão na massa',
];

export const FECHO =
  'Podemos começar ainda esta semana. Confirme o formato e vamos agendar o kickoff.';

/** Quem apresenta é sempre a mesma pessoa, e a validade é sempre a mesma. Não
 *  são perguntas do formulário, são combinados da casa - por isso moram aqui e
 *  não num campo em branco esperando alguém digitar de novo. */
export const APRESENTADO_POR = 'Thales Carneiro';
export const VALIDADE_DIAS = 15;

/** As etapas do cronograma, na ordem e com os nomes que a casa usa. */
export const ETAPAS_PADRAO: Omit<Fase, 'de' | 'ate'>[] = [
  { nome: 'Planejamento + setup', sub: [], entregas: [] },
  { nome: 'Desenvolvimento', sub: [], entregas: [] },
  { nome: 'Testes, homologação e go-live', sub: [], entregas: [] },
  { nome: 'Documentação e treinamento', sub: [], entregas: [] },
  { nome: 'Mapeamento de necessidades', transversal: true, sub: [], entregas: [] },
];

/**
 * A manutenção que a casa sugere: 10% do valor mensal do contrato.
 *
 * O valor mensal é o da opção recomendada. Quando ela é por mês ("por mês ·
 * 1 desenvolvedor"), é o próprio valor; num escopo fechado, é o total dividido
 * pelos meses do cronograma. O resultado sobe para a dezena seguinte, que é
 * como preço se escreve. Sem valor de contrato ainda, não há o que sugerir.
 */
export function manutencaoSugerida(d: DadosProposta): { valor: string; base: string } | null {
  const opcao = d.investimento.opcoes.find(o => o.recomendada) ?? d.investimento.opcoes[0];
  const valor = numeroBr(opcao?.valor);
  if (!opcao || valor == null || valor <= 0) return null;
  const mensal = /m[eê]s/i.test(opcao.unidade);
  const meses = Math.max(1, d.cronograma.meses);
  const porMes = mensal ? valor : valor / meses;
  const sugerido = Math.ceil((porMes * 0.1) / 10) * 10;
  return {
    valor: reaisBr(sugerido),
    base: mensal
      ? `10% de R$ ${reaisBr(valor)} por mês`
      : `10% de R$ ${reaisBr(valor)} em ${meses} ${meses === 1 ? 'mês' : 'meses'}`,
  };
}
