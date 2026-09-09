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
  /** Os bullets se espelham entre as duas colunas: a mesma pergunta respondida
   *  nas duas, inclusive quando a resposta é ruim. Comparação em que uma coluna
   *  só tem elogio não ajuda a decidir, e o cliente percebe. */
  bullets: string[];
  recomendada?: boolean;
}

export interface PapelDoTime {
  papel: string;
  /** "1 pessoa · 8h por dia". Fica de fora quando o papel não é cobrado: no
   *  lugar dela entra a etiqueta. */
  dedicacao: string;
  /** O que essa pessoa faz no projeto. */
  descricao: string;
  /** Papel que não é cobrado leva etiqueta em destaque. É argumento, não
   *  detalhe. */
  naoCobrado?: boolean;
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
    opcoes: OpcaoInvestimento[];
    time: PapelDoTime[];
    /** A hora-homem, a jornada, os dias úteis e a multiplicação que chega ao
     *  valor. Mostrar a conta tira a conversa do "está caro". */
    memoria: string;
  };
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
