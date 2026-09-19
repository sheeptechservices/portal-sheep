// ─────────────────────────────────────────────────────────────────────────────
//  A proposta preenchida pela IA.
//
//  Quem pede escolhe a oportunidade e, se quiser, escreve o que não está em
//  lugar nenhum ("o cliente quer começar em outubro", "fechar em duas opções").
//  O resto vem do que a casa já tem: o card da oportunidade inteiro - campos,
//  briefing, comentários e pendências - e as reuniões presas a ela, com a
//  transcrição do Fireflies de cada uma.
//
//  O modelo devolve todos os campos do formulário do gerador. Não devolve o
//  arquivo: quem gera continua sendo o operador, que passa pelos passos,
//  confere o que a IA escreveu e corrige o que precisar. É um rascunho bom, e
//  não uma proposta pronta - por isso o que faltar vem marcado como
//  "[a confirmar: ...]", à vista de quem revisa, em vez de inventado.
//
//  Três regras que o prompt carrega, porque são as que a casa cobra em toda
//  proposta: nada de travessão, cronograma em meses com as cinco fases de
//  nomes fixos, e valor só quando há base para ele.
//
//  A infra é a exceção ao "só o material": custo de nuvem não é especialidade
//  da casa, então o modelo consulta a tabela de preços da AWS por ferramenta,
//  e converte pela PTAX do dia. E quando falta um dado que muda a proposta -
//  quantos usuários, quanto de dado -, ele pergunta ao operador no meio do
//  caminho: o preenchimento pausa, a tela mostra a pergunta, e a resposta
//  (ou o "não sei") retoma de onde parou.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import {
  FIREFLIES_KEY, getAnthropicCredential, getAwsPrecosCredential, getIntegrationCredential,
  obterTranscricaoFireflies,
} from './_credentials.js';
import { abrirChamada, somarUso, usoZerado, type UsoDeTokens } from './_analise-vaga.js';
import {
  consultarPrecosAws, cotacaoDoDolar, valoresDeAtributoAws, type CredencialAws,
} from './_aws-precos.js';

/** O que o preenchimento conta enquanto acontece. */
export type EventoDaProposta =
  /** Leu o card: é desta oportunidade que se trata. */
  | { tipo: 'oportunidade'; empresa: string; reunioes: number }
  /** Mais uma transcrição chegou do Fireflies. */
  | { tipo: 'reuniao'; lidas: number; total: number; assunto: string }
  /** O material está montado e foi para o modelo. */
  | { tipo: 'pensando' }
  /** O modelo começou a escrever uma parte da proposta. */
  | { tipo: 'secao'; secao: SecaoEscrita }
  /** Chegou mais texto, dentro da mesma parte: sinal de vida. */
  | { tipo: 'escrevendo'; letras: number }
  /** Consultou a tabela de preços da AWS. `rotulo` é o serviço em português. */
  | { tipo: 'aws'; rotulo: string; consultas: number }
  /** Terminou de escrever e está conferindo o que veio. */
  | { tipo: 'conferindo' };

/** Uma pergunta que a IA faz ao operador no meio do preenchimento. */
export interface PerguntaDaIa {
  id: string;
  pergunta: string;
  /** Um exemplo de resposta, que vira o texto de apoio do campo. */
  exemplo: string;
}

/** O que o operador respondeu. `resposta` nula é "não sei". */
export interface RespostaDoOperador {
  id: string;
  resposta: string | null;
}

export type SecaoEscrita = 'capa' | 'projeto' | 'entregas' | 'operacao' | 'cronograma' | 'investimento' | 'infra';

/** As partes na ordem em que o JSON é escrito, com a chave que abre cada uma.
 *  É por ela que o progresso sabe onde o modelo está. */
const PARTES: { secao: SecaoEscrita; chave: string }[] = [
  { secao: 'capa', chave: '"cliente"' },
  { secao: 'projeto', chave: '"projeto"' },
  { secao: 'entregas', chave: '"entregas"' },
  { secao: 'operacao', chave: '"comoFunciona"' },
  { secao: 'cronograma', chave: '"cronograma"' },
  { secao: 'investimento', chave: '"investimento"' },
  { secao: 'infra', chave: '"infra"' },
];

/** As fases do cronograma, com os nomes que a casa fechou. O modelo escolhe os
 *  meses; os nomes e a ordem não são dele. */
const FASES = [
  'Planejamento + setup',
  'Desenvolvimento',
  'Testes, homologação e go-live',
  'Documentação e treinamento',
  'Mapeamento de necessidades',
];

/** Quanto de transcrição vai para o modelo, somando todas as reuniões. Uma
 *  reunião de uma hora dá uns 60 mil caracteres; três delas cabem com folga, e
 *  o que passar disso corta as mais antigas primeiro. */
const TETO_DE_TRANSCRICAO = 180_000;

// ── O material ──────────────────────────────────────────────────────────────

const t = (v: unknown) => String(v ?? '').trim();

/** Uma linha "Rótulo: valor", ou nada quando o valor está vazio. Campo vazio
 *  impresso como "-" ensinaria o modelo a tratar ausência como informação. */
const linha = (rotulo: string, valor: unknown) => (t(valor) ? `${rotulo}: ${t(valor)}` : null);

interface Material {
  empresa: string;
  texto: string;
  reunioes: number;
}

/** O card da oportunidade inteiro, em texto. É o único mundo do modelo sobre o
 *  cliente: o que não está aqui, ele não tem para usar. */
async function lerOportunidade(db: Client, id: string): Promise<{
  empresa: string; texto: string;
  reunioes: { id: number; assunto: string; data: string; notas: string; dados: any; firefliesId: string | null }[];
} | null> {
  const [op, etapa, comentarios, pendencias, reunioes] = await Promise.all([
    db.execute({
      sql: `SELECT empresa, cnpj, contato_nome, contato_cargo, contato_email, origem,
                   interesse, valor_estimado, parcelas, segmento, briefing, temperatura,
                   tipo_projeto, observacoes, proxima_acao, cidade, estado, indicado_por,
                   parceria, parceria_percentual
            FROM oportunidades WHERE id = ? AND deleted_at IS NULL`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT sc.nome FROM oportunidade_eventos e
            JOIN status_configs sc ON sc.id = e.status_id
            WHERE e.oportunidade_id = ? AND e.tipo = 'status_change'
            ORDER BY e.id DESC LIMIT 1`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT descricao, criado_em FROM oportunidade_eventos
            WHERE oportunidade_id = ? AND tipo = 'comentario' AND descricao IS NOT NULL
            ORDER BY id`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT descricao, resolvida FROM oportunidade_pendencias
            WHERE oportunidade_id = ? ORDER BY id`,
      args: [id],
    }),
    db.execute({
      sql: `SELECT id, assunto, data, notas, dados, fireflies_id FROM projeto_reunioes
            WHERE oportunidade_id = ? ORDER BY data DESC, id DESC`,
      args: [id],
    }),
  ]);
  const o = op.rows[0];
  if (!o) return null;

  const valor = Number(o.valor_estimado ?? 0);
  const parcelas = Number(o.parcelas ?? 0);
  const campos = [
    linha('Empresa', o.empresa),
    linha('CNPJ', o.cnpj),
    linha('Segmento', o.segmento),
    linha('Cidade', [t(o.cidade), t(o.estado)].filter(Boolean).join(' / ')),
    linha('Contato', [t(o.contato_nome), t(o.contato_cargo)].filter(Boolean).join(', ')),
    linha('Etapa no funil', etapa.rows[0]?.nome),
    linha('Origem', o.origem),
    linha('Indicado por', o.indicado_por),
    Number(o.parceria) === 1
      ? `Parceria: sim${o.parceria_percentual ? `, ${o.parceria_percentual}% para o parceiro` : ''}`
      : null,
    linha('Tipo de projeto', o.tipo_projeto),
    linha('Temperatura', o.temperatura),
    linha('Interesse', o.interesse),
    valor > 0
      ? `Valor estimado no card: R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        + (parcelas > 1 ? `, em ${parcelas} parcelas` : '')
      : null,
    linha('Próxima ação', o.proxima_acao),
    linha('Observações', o.observacoes),
  ].filter(Boolean);

  const partes = [`# Oportunidade\n\n${campos.join('\n')}`];
  if (t(o.briefing)) partes.push(`## Briefing\n\n${t(o.briefing)}`);
  if (comentarios.rows.length) {
    partes.push(`## Comentários do card\n\n${comentarios.rows
      .map(c => `- (${t(c.criado_em).slice(0, 10)}) ${t(c.descricao)}`).join('\n')}`);
  }
  if (pendencias.rows.length) {
    partes.push(`## Pendências\n\n${pendencias.rows
      .map(p => `- [${Number(p.resolvida) === 1 ? 'resolvida' : 'aberta'}] ${t(p.descricao)}`).join('\n')}`);
  }

  return {
    empresa: t(o.empresa) || 'Cliente',
    texto: partes.join('\n\n'),
    reunioes: reunioes.rows.map(r => {
      let dados: any = null;
      try { dados = r.dados ? JSON.parse(String(r.dados)) : null; } catch { /* dado velho */ }
      return {
        id: Number(r.id), assunto: t(r.assunto), data: t(r.data), notas: t(r.notas), dados,
        firefliesId: r.fireflies_id ? String(r.fireflies_id) : null,
      };
    }),
  };
}

/** O card mais as reuniões, com a transcrição de cada uma. As transcrições vêm
 *  em paralelo - três reuniões são três idas ao Fireflies ao mesmo tempo. */
async function montarMaterial(db: Client, id: string, avisar: (e: EventoDaProposta) => void)
  : Promise<Material | null> {
  const op = await lerOportunidade(db, id);
  if (!op) return null;
  avisar({ tipo: 'oportunidade', empresa: op.empresa, reunioes: op.reunioes.length });

  const chave = op.reunioes.some(r => r.firefliesId)
    ? (await getIntegrationCredential(db, FIREFLIES_KEY))?.value ?? null
    : null;
  let lidas = 0;
  const total = op.reunioes.length;
  const transcricoes = await Promise.all(op.reunioes.map(async r => {
    let texto = '';
    if (chave && r.firefliesId) {
      const tr = await obterTranscricaoFireflies(chave, r.firefliesId).catch(() => null);
      if (tr && tr.ok) texto = tr.frases.map(f => `${f.quem}: ${f.texto}`).join('\n');
    }
    lidas++;
    avisar({ tipo: 'reuniao', lidas, total, assunto: r.assunto });
    return texto;
  }));

  // Da mais recente para a mais antiga: o teto corta o passado primeiro, que é
  // onde o combinado já foi revisto.
  let sobra = TETO_DE_TRANSCRICAO;
  const blocos = op.reunioes.map((r, i) => {
    const d = r.dados ?? {};
    const resumo = [
      linha('Resumo', r.notas),
      linha('Tópicos', d.topicos),
      linha('Combinados e próximos passos', d.acoes),
      linha('Notas', d.notas),
    ].filter(Boolean).join('\n\n');
    let transcricao = transcricoes[i];
    if (transcricao.length > sobra) {
      transcricao = sobra > 2000 ? `${transcricao.slice(0, sobra)}\n[transcrição cortada]` : '';
    }
    sobra -= transcricao.length;
    return [
      `## Reunião: ${r.assunto} (${r.data})`,
      resumo,
      transcricao ? `### Transcrição\n\n${transcricao}` : null,
    ].filter(Boolean).join('\n\n');
  });

  return {
    empresa: op.empresa,
    texto: [op.texto, ...blocos].join('\n\n'),
    reunioes: op.reunioes.length,
  };
}

// ── O pedido ao modelo ──────────────────────────────────────────────────────

const INSTRUCOES = `Você escreve propostas comerciais da Sheep Technology, uma software house brasileira. A partir do material de uma oportunidade (o card do funil comercial, as reuniões com o cliente e o contexto que o operador escreveu), você preenche todos os campos de uma proposta. Um operador vai revisar campo a campo antes de gerar, então o seu trabalho é um rascunho fiel e bem escrito, não uma peça de ficção.

Como escrever:
- Português do Brasil, concreto e direto, focado no que o cliente ganha. Nada de adjetivo vazio ("solução inovadora e robusta"); prefira o que dá para verificar ("reduz o vai-e-vem no WhatsApp e organiza a fila de produção").
- Nunca use travessão longo nem travessão médio. Reescreva com vírgula, dois-pontos, parênteses ou ponto; como separador, hífen cercado de espaços.
- Nos textos longos (projeto, resumo de entrega, texto de passo, nota, descrição de papel, memória de cálculo) você pode usar quebra de linha, **negrito**, *itálico* e listas com "- " no começo da linha. Use com parcimônia.
- Só use fatos do material. Não invente clientes, números, prazos, integrações ou valores. Quando uma informação necessária não estiver no material, escreva no próprio campo "[a confirmar: o que falta]", para o operador ver e completar.

A estrutura:
- cliente: o nome da empresa como deve aparecer na capa.
- subtitulo: uma linha curta com o que é o projeto (ex.: "Painéis de gestão em Power BI").
- projeto: a situação do cliente hoje e o que a proposta faz com ela, em 1 a 3 parágrafos curtos.
- ganhos: 3 frases curtas com os ganhos principais para o cliente.
- entregas: uma por módulo ou frente de trabalho, de 1 a 6. nome curto, sem numeração ("Pacote de BIs", não "Entrega 1"). resumo em 2 a 4 frases. itens: 3 a 5 pontos curtos do que fica pronto.
- comoFunciona: só quando a contratação é continuada (um time alocado com fila de prioridades). Descreve o modelo de operação: linhaFina (uma frase), 3 passos (titulo curto + texto de 1 a 2 frases: como a fila é priorizada, quem decide, o que acontece quando a prioridade muda) e nota (a conta que sustenta o prazo, ex.: "cerca de 40 painéis a cinco dias cada dá 7 meses"). Num projeto fechado de escopo único, use null.
- cronograma: sempre em meses. meses é o total (1 a 24). fases são exatamente estas cinco, nesta ordem e com estes nomes: "Planejamento + setup", "Desenvolvimento", "Testes, homologação e go-live", "Documentação e treinamento", "Mapeamento de necessidades". Cada fase tem de e ate (mês de início e de fim, contando de 1). As fases se encavalam, como em projeto real. "Testes, homologação e go-live" termina no último mês. "Mapeamento de necessidades" é transversal: vai do mês 1 ao último. Cada fase tem sub (2 a 4 atividades curtas) e entregas (1 a 3 entregáveis curtos).
- investimento:
  - opcoes: de 1 a 3. A recomendada é a primeira. Cada uma tem titulo (a linha fina acima do preço, ex.: "Roadmap completo"), valor (só o número no formato brasileiro, ex.: "21.600", sem "R$"), unidade (o que o valor compra, ex.: "por mês · 1 desenvolvedor em 8h/dia"), destaque opcional ({ valor, texto, nota }, ex.: valor "R$ 0", texto "no primeiro mês") ou null, e bullets: 3 frases curtas. Os bullets se espelham entre as opções: a mesma pergunta respondida em todas, inclusive quando a resposta é ruim para aquela opção ("Sem continuidade: painéis novos exigem nova contratação").
  - Valor só com base: o valor estimado do card ou o que foi dito nas reuniões ou no contexto. Sem base, deixe valor "" e explique na memória o que falta.
  - time: os papéis alocados, de 1 a 6. papel (ex.: "Desenvolvedor"), quantidade (quantas pessoas no papel, 1 a 20), dedicacao (ex.: "8h por dia"), descricao (o que faz no projeto, 1 frase) e naoCobrado (true só para papel que a casa não cobra; o Gestor de Projetos costuma ser não cobrado).
  - memoria: a conta que chega ao valor (hora-homem, jornada, dias úteis e a multiplicação). Sem base para a conta, deixe "".
- infra: o custo mensal de manter o sistema no ar depois do go-live, e a manutenção. Use null só quando não houver sistema hospedado a manter (consultoria, painéis dentro do Power BI do próprio cliente sem servidor, automação que roda na infraestrutura do cliente).
  - Custo de infraestrutura não é a especialidade da casa, então nada de estimar de memória: todo valor de infra vem da tabela de preços da AWS, pela ferramenta consultar_preco_aws. Use valores_de_atributo_aws quando não souber o nome exato de um valor de filtro. Escolha a arquitetura mais simples que atende o projeto, sem superdimensionar, na região de São Paulo (sa-east-1) salvo indicação contrária.
  - Filtros que costumam funcionar: EC2 com regionCode, instanceType, operatingSystem "Linux", tenancy "Shared", preInstalledSw "NA" e capacitystatus "Used". RDS com regionCode, instanceType (ex.: "db.t4g.micro"), databaseEngine (ex.: "PostgreSQL") e deploymentOption "Single-AZ". Preço por hora vezes 730 dá o mês. Se uma consulta voltar vazia, ajuste os filtros em vez de desistir.
  - Converta de dólar para real pela cotação informada no material e escreva os valores no formato brasileiro, com vírgula decimal e sem "R$" (ex.: "412,50").
  - Sempre três cenários: otimista (uso abaixo do esperado), realista (o esperado) e pessimista (pico ou crescimento acima do previsto). premissas descreve cada um em uma linha curta, de no máximo 90 caracteres, com os números que o sustentam (ex.: "80 operadoras, 250 usuários, 10 mil consultas por mês"). Ela aparece em letra pequena sob o nome do cenário, na tabela.
  - itens: de 2 a 6 serviços, agrupados de um jeito que o cliente entenda ("Servidor da aplicação", "Banco de dados", "Armazenamento de arquivos", "Tráfego e CDN", "Backup e monitoramento"). servico é esse nome; detalhe é o que foi precificado, em no máximo 60 caracteres ("EC2 t4g.medium, 24h por dia"); valores tem o custo mensal em cada cenário.
  - fonte: de onde vêm os preços, numa linha: "Tabela de preços da AWS consultada em DD/MM/AAAA, região São Paulo (sa-east-1), preços sob demanda. Dólar a R$ X (PTAX de DD/MM/AAAA)."
  - manutencao: valor por mês. Se o operador informou, use o dele. Se não, o padrão da casa é 10% do valor mensal do contrato: o da opção recomendada, e num escopo fechado o valor total dividido pelos meses do cronograma, arredondado para cima na dezena. Sem valor de contrato, deixe "". unidade: "por mês, a partir do go-live". inclui: 3 a 5 pontos curtos (correções, atualizações de segurança, monitoramento e backups, suporte em horário comercial, pequenos ajustes). naoInclui: 2 a 3 pontos (funcionalidades novas, mudanças de escopo, o custo da própria infraestrutura).
  - nota: uma ou duas frases sobre o que move o custo de um cenário para o outro. Não afirme quem paga a infraestrutura, a menos que o material diga.

Perguntas ao operador:
- Quando o material não trouxer algo que muda a proposta de fato, pergunte ao operador com a ferramenta perguntar_ao_operador em vez de supor. O caso típico é a infra: número de usuários esperado, volume de dados ou de arquivos, picos de acesso, se o cliente já tem conta na nuvem. Também vale para uma dúvida decisiva de escopo ou de valor.
- Junte tudo numa chamada só, logo no começo, antes de consultar preços: até 4 perguntas curtas, cada uma com um exemplo de resposta. Não pergunte o que já está no material nem o que o operador já informou.
- O operador pode responder que não sabe. Nesse caso, siga com uma suposição razoável, abra mais a distância entre os três cenários e escreva nas premissas o que foi suposto.

Quando terminar de consultar e perguntar, responda só com o JSON, sem texto antes nem depois, exatamente neste formato:
{"cliente":"","subtitulo":"","projeto":"","ganhos":[""],"entregas":[{"nome":"","resumo":"","itens":[""]}],"comoFunciona":{"linhaFina":"","passos":[{"titulo":"","texto":""}],"nota":""},"cronograma":{"meses":4,"fases":[{"nome":"","de":1,"ate":1,"sub":[""],"entregas":[""]}]},"investimento":{"opcoes":[{"titulo":"","valor":"","unidade":"","destaque":null,"bullets":[""]}],"time":[{"papel":"","quantidade":1,"dedicacao":"","descricao":"","naoCobrado":false}],"memoria":""},"infra":{"premissas":{"otimista":"","realista":"","pessimista":""},"itens":[{"servico":"","detalhe":"","valores":{"otimista":"","realista":"","pessimista":""}}],"fonte":"","manutencao":{"valor":"","unidade":"","inclui":[""],"naoInclui":[""]},"nota":""}}`;

// ── A resposta, conferida ───────────────────────────────────────────────────

/** Sem travessão, nunca: a casa não usa, e o montador recusa a proposta que
 *  tiver um. O modelo é instruído, mas a conferência não depende dele. */
const limpo = (v: unknown, teto = 4000) => t(v)
  .replace(/\s*[\u2014\u2013]\s*/g, ' - ')
  .slice(0, teto);

const listaDe = (v: unknown, teto: number, tamanho = 300) =>
  (Array.isArray(v) ? v : []).map(x => limpo(x, tamanho)).filter(Boolean).slice(0, teto);

const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : padrao;
};

/**
 * O JSON do modelo, no formato exato do formulário. Tudo é conferido: o tipo
 * de cada campo, os tetos de quantidade que o slide aguenta, os nomes das
 * fases e os meses dentro do cronograma. O que o modelo escreveu fora disso
 * não chega à tela.
 */
export function conferirProposta(bruto: any) {
  const meses = inteiro(bruto?.cronograma?.meses, 1, 24, 4);
  const fasesDoModelo: any[] = Array.isArray(bruto?.cronograma?.fases) ? bruto.cronograma.fases : [];
  const fases = FASES.map((nome, i) => {
    const f = fasesDoModelo.find(x => t(x?.nome).toLowerCase() === nome.toLowerCase())
      ?? fasesDoModelo[i] ?? {};
    const transversal = i === FASES.length - 1;
    const de = transversal ? 1 : inteiro(f.de, 1, meses, 1);
    // Testes vão até o fim, e o mapeamento atravessa o projeto: é o que a casa
    // mostra ao cliente, e não o que o modelo lembrou de fazer.
    const ate = transversal || i === 2 ? meses : Math.max(de, inteiro(f.ate, 1, meses, meses));
    return {
      nome, de, ate,
      ...(transversal ? { transversal: true } : {}),
      sub: listaDe(f.sub, 4, 120),
      entregas: listaDe(f.entregas, 3, 120),
    };
  });

  const opcoes = (Array.isArray(bruto?.investimento?.opcoes) ? bruto.investimento.opcoes : [])
    .slice(0, 3)
    .map((o: any, i: number) => {
      const destaque = o?.destaque && t(o.destaque.valor)
        ? {
          valor: limpo(o.destaque.valor, 40),
          texto: limpo(o.destaque.texto, 80),
          nota: limpo(o.destaque.nota, 160),
        }
        : undefined;
      return {
        rotulo: `Opção ${String.fromCharCode(65 + i)}`,
        titulo: limpo(o?.titulo, 80),
        valor: limpo(o?.valor, 30).replace(/^R\$\s*/i, ''),
        unidade: limpo(o?.unidade, 120),
        ...(destaque ? { destaque } : {}),
        bullets: listaDe(o?.bullets, 5, 160),
        ...(i === 0 ? { recomendada: true } : {}),
      };
    });

  const time = (Array.isArray(bruto?.investimento?.time) ? bruto.investimento.time : [])
    .slice(0, 6)
    .map((p: any) => ({
      papel: limpo(p?.papel, 60),
      quantidade: inteiro(p?.quantidade, 1, 20, 1),
      dedicacao: limpo(p?.dedicacao, 60),
      descricao: limpo(p?.descricao, 400),
      ...(p?.naoCobrado === true ? { naoCobrado: true } : {}),
    }))
    .filter((p: any) => p.papel);

  const inf = bruto?.infra;
  const cenarios = ['otimista', 'realista', 'pessimista'] as const;
  const porCenario = (v: any, conferir: (x: unknown) => string) =>
    Object.fromEntries(cenarios.map(c => [c, conferir(v?.[c])])) as Record<typeof cenarios[number], string>;
  const infra = inf && typeof inf === 'object'
    ? {
      premissas: porCenario(inf.premissas, x => curto(x, 200)),
      itens: (Array.isArray(inf.itens) ? inf.itens : []).slice(0, 6).map((i: any) => ({
        servico: limpo(i?.servico, 60),
        detalhe: curto(i?.detalhe, 140),
        valores: porCenario(i?.valores, valorEmReais),
      })).filter((i: any) => i.servico),
      fonte: limpo(inf.fonte, 300),
      manutencao: {
        valor: valorEmReais(inf.manutencao?.valor),
        unidade: limpo(inf.manutencao?.unidade, 80) || 'por mês, a partir do go-live',
        inclui: listaDe(inf.manutencao?.inclui, 5, 140),
        naoInclui: listaDe(inf.manutencao?.naoInclui, 4, 140),
      },
      nota: limpo(inf.nota, 500),
    }
    : null;

  const como = bruto?.comoFunciona;
  const comoFunciona = como && typeof como === 'object'
    ? {
      linhaFina: limpo(como.linhaFina, 200),
      passos: (Array.isArray(como.passos) ? como.passos : []).slice(0, 3).map((p: any) => ({
        titulo: limpo(p?.titulo, 60),
        texto: limpo(p?.texto, 400),
      })),
      nota: limpo(como.nota, 400),
    }
    : null;

  return {
    cliente: limpo(bruto?.cliente, 120),
    subtitulo: limpo(bruto?.subtitulo, 120),
    projeto: limpo(bruto?.projeto, 3000),
    ganhos: listaDe(bruto?.ganhos, 5, 200),
    entregas: (Array.isArray(bruto?.entregas) ? bruto.entregas : []).slice(0, 6).map((e: any) => ({
      nome: limpo(e?.nome, 80),
      resumo: limpo(e?.resumo, 1500),
      itens: listaDe(e?.itens, 6, 160),
    })).filter((e: any) => e.nome),
    comoFunciona,
    cronograma: { meses, fases },
    investimento: {
      opcoes: opcoes.length ? opcoes : [{
        rotulo: 'Opção A', titulo: '', valor: '', unidade: '', bullets: [], recomendada: true,
      }],
      time,
      memoria: limpo(bruto?.investimento?.memoria, 1500),
    },
    infra,
  };
}

/** Texto com teto, cortado entre palavras. O teto existe para o slide, e um
 *  corte no meio da palavra ("dos últi") leria como erro de digitação no
 *  arquivo que vai ao cliente. */
function curto(v: unknown, teto: number): string {
  const s = limpo(v, 4000);
  if (s.length <= teto) return s;
  const corte = s.slice(0, teto);
  const espaco = corte.lastIndexOf(' ');
  return (espaco > teto * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,;:.-]+$/, '');
}

/** Um valor em reais como o formulário guarda: formato brasileiro, sem o
 *  "R$". O modelo às vezes devolve número em vez de texto (412.5); esse vira
 *  "412,50". Texto que não é número ("[a confirmar: ...]") passa como está,
 *  para o operador ver o que falta. */
function valorEmReais(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return v.toLocaleString('pt-BR', v >= 1000
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return limpo(v, 60).replace(/^R\$\s*/i, '');
}

/**
 * Conserta o que o modelo costuma errar num JSON longo de texto corrido: a
 * quebra de linha escrita crua dentro de uma string (o JSON exige a barra e o
 * n) e a vírgula sobrando antes de fechar uma lista. É o texto dos parágrafos
 * - que a proposta pede - que produz a primeira. Anda caractere a caractere
 * sabendo se está dentro de uma string, e só mexe no que está fora do lugar.
 *
 * Compara pelo código do caractere, e não pelo caractere escrito entre
 * aspas: barra invertida e quebra de linha no código-fonte são o tipo de coisa
 * que some numa edição e deixa a função calada, conferindo o errado.
 */
const BARRA = 92, ASPAS = 34, QUEBRA = 10, RETORNO = 13, TAB = 9;

function consertarJson(json: string): string {
  const barra = String.fromCharCode(BARRA);
  let saida = '';
  let emTexto = false;
  let escapado = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    const cod = json.charCodeAt(i);
    if (emTexto) {
      if (escapado) { escapado = false; saida += c; continue; }
      if (cod === BARRA) { escapado = true; saida += c; continue; }
      if (cod === ASPAS) { emTexto = false; saida += c; continue; }
      if (cod === QUEBRA) { saida += `${barra}n`; continue; }
      if (cod === RETORNO) continue;
      if (cod === TAB) { saida += `${barra}t`; continue; }
      saida += c;
      continue;
    }
    if (cod === ASPAS) { emTexto = true; saida += c; continue; }
    // Vírgula antes de `}` ou `]`, com espaço no meio ou não.
    if (c === ',' && /^\s*[}\]]/.test(json.slice(i + 1))) continue;
    saida += c;
  }
  return saida;
}

/** O JSON dentro do que o modelo escreveu: da primeira chave até a última que
 *  fecha. Cerca de código e frase emendada no fim ficam de fora; o que vier
 *  torto ganha uma segunda leitura, consertada. */
function recortarJson(texto: string): { valor: any } | { erro: string } {
  const abre = texto.indexOf('{');
  const fecha = texto.lastIndexOf('}');
  if (abre < 0 || fecha <= abre) return { erro: 'sem objeto JSON na resposta' };
  const cru = texto.slice(abre, fecha + 1);
  try { return { valor: JSON.parse(cru) }; } catch { /* segunda leitura */ }
  try { return { valor: JSON.parse(consertarJson(cru)) }; } catch (e: any) {
    return { erro: String(e?.message ?? 'JSON inválido') };
  }
}

// ── A porta de entrada ──────────────────────────────────────────────────────

/** O que o operador já decidiu e informou em campo próprio. Cada um é
 *  opcional: o que vem vazio simplesmente não entra no pedido. */
export interface Informado {
  /** 'mensal', 'fechado', 'ambos' ou vazio (a IA decide). */
  formato?: string;
  /** Quantas opções de investimento, de 1 a 3. Zero ou vazio: a IA decide. */
  opcoes?: number;
  valor?: string;
  prazo?: string;
  time?: string;
}

const FORMATOS: Record<string, string> = {
  mensal: 'time dedicado mensal (contratação continuada, com "Como funciona")',
  fechado: 'escopo fechado (projeto único, sem "Como funciona")',
  ambos: 'as duas formas lado a lado: uma opção de time dedicado mensal e outra de escopo fechado',
};

/** Os dados informados, em texto para o modelo. Vêm antes do contexto livre e
 *  com peso de decisão: são números e escolhas que o operador já fechou com o
 *  cliente, e o modelo não deve trocá-los pelo que deduzir do material. */
function blocoDoInformado(i: Informado): string | null {
  const t2 = (v: unknown, teto: number) => String(v ?? '').trim().slice(0, teto);
  const linhas = [
    FORMATOS[t2(i.formato, 20)] ? `- Formato de contratação: ${FORMATOS[t2(i.formato, 20)]}` : null,
    Number(i.opcoes) >= 1 && Number(i.opcoes) <= 3
      ? `- Quantidade de opções de investimento: exatamente ${Number(i.opcoes)}` : null,
    t2(i.valor, 300) ? `- Valor: ${t2(i.valor, 300)}` : null,
    t2(i.prazo, 300) ? `- Prazo: ${t2(i.prazo, 300)}` : null,
    t2(i.time, 500) ? `- Time: ${t2(i.time, 500)}` : null,
  ].filter(Boolean);
  if (!linhas.length) return null;
  return `# O que o operador já decidiu

Estes pontos foram fechados por quem está montando a proposta. Use-os exatamente como estão, acima do que o card ou as reuniões sugerirem. Com valor informado, preencha o valor das opções e a memória de cálculo a partir dele, sem marcar "[a confirmar]" no que ele já responde.

${linhas.join('\n')}`;
}

// ── As ferramentas ─────────────────────────────────────────────────────────

/** Os serviços da AWS em português, para a janela de progresso dizer o que
 *  está sendo consultado sem mostrar código de produto. */
const NOME_DO_SERVICO: Record<string, string> = {
  AmazonEC2: 'servidores (EC2)',
  AmazonRDS: 'banco de dados (RDS)',
  AmazonS3: 'armazenamento (S3)',
  AWSLambda: 'funções (Lambda)',
  AmazonCloudFront: 'CDN (CloudFront)',
  AmazonECS: 'contêineres (ECS)',
  AmazonElastiCache: 'cache (ElastiCache)',
  AmazonCloudWatch: 'monitoramento (CloudWatch)',
  AWSDataTransfer: 'tráfego de dados',
  AmazonSES: 'e-mail (SES)',
  AmazonApiGateway: 'API Gateway',
  AmazonDynamoDB: 'DynamoDB',
  AmazonVPC: 'rede (VPC)',
  AWSELB: 'balanceador de carga',
  AmazonEFS: 'arquivos (EFS)',
  AWSBackup: 'backup',
};

const FERRAMENTA_PRECO = {
  name: 'consultar_preco_aws',
  description: 'Consulta a tabela oficial e atualizada de preços da AWS (preço sob demanda, em dólar). Use para todo valor de infraestrutura da proposta, sempre antes de escrever a seção infra: nunca estime custo de nuvem de memória. Cada filtro é igualdade exata sobre um atributo da AWS. Devolve até `limite` itens, cada um com os atributos que o identificam e o preço por unidade.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      servico: {
        type: 'string',
        description: 'Código do serviço na tabela da AWS, ex.: AmazonEC2, AmazonRDS, AmazonS3, AWSLambda, AmazonCloudFront, AmazonElastiCache, AWSDataTransfer, AWSELB.',
      },
      filtros: {
        type: 'array',
        description: 'Filtros de igualdade exata, ex.: [{"campo":"regionCode","valor":"sa-east-1"},{"campo":"instanceType","valor":"t4g.medium"}].',
        items: {
          type: 'object',
          properties: { campo: { type: 'string' }, valor: { type: 'string' } },
          required: ['campo', 'valor'],
        },
      },
      limite: { type: 'integer', description: 'Quantos itens devolver, de 1 a 20. Padrão 10.' },
    },
    required: ['servico', 'filtros'],
  },
};

const FERRAMENTA_ATRIBUTO = {
  name: 'valores_de_atributo_aws',
  description: 'Lista os valores que um atributo assume num serviço da AWS (ex.: os instanceType do AmazonRDS, os databaseEngine, as storageClass do AmazonS3). Use quando não souber o nome exato de um valor antes de filtrar com consultar_preco_aws, ou quando uma consulta voltou vazia.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      servico: { type: 'string', description: 'Código do serviço, ex.: AmazonRDS.' },
      atributo: { type: 'string', description: 'Nome do atributo, ex.: instanceType, databaseEngine, storageClass.' },
    },
    required: ['servico', 'atributo'],
  },
};

const FERRAMENTA_PERGUNTA = {
  name: 'perguntar_ao_operador',
  description: 'Pausa o preenchimento e pergunta ao operador o que falta no material e muda a proposta de fato: número de usuários, volume de dados, picos de acesso, se o cliente já tem nuvem, uma dúvida decisiva de escopo ou de valor. Junte tudo numa chamada só, no começo, antes de consultar preços. A resposta volta como resultado desta ferramenta; resposta nula quer dizer que o operador não sabe.',
  eager_input_streaming: true,
  input_schema: {
    type: 'object',
    properties: {
      perguntas: {
        type: 'array',
        description: 'De 1 a 4 perguntas curtas.',
        items: {
          type: 'object',
          properties: {
            pergunta: { type: 'string', description: 'A pergunta, curta e direta.' },
            exemplo: { type: 'string', description: 'Um exemplo de resposta, ex.: "cerca de 300 usuários".' },
          },
          required: ['pergunta'],
        },
      },
    },
    required: ['perguntas'],
  },
};

/** Tetos do laço. Cada rodada é uma ida ao modelo; as consultas são idas à
 *  AWS. Um preenchimento normal usa três ou quatro rodadas e umas seis
 *  consultas - os tetos só existem para um laço torto não correr até o fim do
 *  tempo da função. */
const MAX_RODADAS = 12;
const MAX_CONSULTAS = 24;
const MAX_PERGUNTAS = 2;

type Bloco = Record<string, any>;
interface Mensagem { role: 'user' | 'assistant'; content: Bloco[] }

/**
 * O preenchimento parado numa pergunta ao operador.
 *
 * O servidor não guarda nada entre um pedido e outro: a conversa inteira vai
 * para a tela junto com a pergunta e volta com a resposta. O material do card
 * não viaja - ele é montado de novo, igual, no pedido seguinte, e o cache de
 * prompt da Anthropic devolve o que já foi lido pela fração do preço.
 */
interface Pausa {
  /** A conversa depois do material: as rodadas do modelo e os resultados. */
  conversa: Mensagem[];
  /** O `tool_use` da pergunta, que a resposta vai fechar. */
  perguntaId: string;
  /** Resultados de outras ferramentas pedidas na mesma rodada da pergunta. */
  prontos: Bloco[];
  consultas: number;
  perguntas: number;
  /** O dólar do começo: a resposta não pode chegar com outra cotação, senão o
   *  material muda e o cache se perde. */
  dolar: { valor: number; data: string } | null;
}

/** Valida o que o modelo pediu a uma ferramenta. Com a entrada em fluxo, a API
 *  não confere o formato, então a conferência é daqui. */
function entradaValida(nome: string, e: any): string | null {
  if (!e || typeof e !== 'object') return 'entrada vazia';
  if (nome === 'consultar_preco_aws') {
    if (!/^[A-Za-z0-9]{2,60}$/.test(String(e.servico ?? ''))) return 'servico inválido';
    if (!Array.isArray(e.filtros) || e.filtros.length > 12) return 'filtros deve ser uma lista de até 12';
    if (e.filtros.some((f: any) => typeof f?.campo !== 'string' || typeof f?.valor !== 'string')) {
      return 'cada filtro precisa de campo e valor em texto';
    }
    return null;
  }
  if (nome === 'valores_de_atributo_aws') {
    if (!/^[A-Za-z0-9]{2,60}$/.test(String(e.servico ?? ''))) return 'servico inválido';
    if (!/^[A-Za-z0-9]{1,60}$/.test(String(e.atributo ?? ''))) return 'atributo inválido';
    return null;
  }
  if (nome === 'perguntar_ao_operador') {
    if (!Array.isArray(e.perguntas) || !e.perguntas.length || e.perguntas.length > 4) {
      return 'perguntas deve ter de 1 a 4 itens';
    }
    if (e.perguntas.some((q: any) => !String(q?.pergunta ?? '').trim())) return 'pergunta vazia';
    return null;
  }
  return 'ferramenta desconhecida';
}

const resultado = (id: string, conteudo: unknown, erro = false): Bloco => ({
  type: 'tool_result',
  tool_use_id: id,
  content: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo),
  ...(erro ? { is_error: true } : {}),
});

/** Roda uma ferramenta de consulta (a pergunta não passa por aqui). */
async function rodarFerramenta(
  aws: CredencialAws | null, nome: string, entrada: any,
): Promise<{ conteudo: unknown; erro: boolean }> {
  if (!aws) {
    return { conteudo: 'A consulta à AWS não está configurada neste portal.', erro: true };
  }
  if (nome === 'consultar_preco_aws') {
    const r = await consultarPrecosAws(aws, {
      servico: entrada.servico,
      filtros: entrada.filtros.map((f: any) => ({ campo: String(f.campo), valor: String(f.valor) })),
      limite: Number(entrada.limite) || 10,
    });
    if (!r.ok) return { conteudo: r.erro, erro: true };
    if (!r.itens.length) {
      return {
        conteudo: 'Nenhum item com esses filtros. Confira os nomes com valores_de_atributo_aws ou afrouxe um filtro.',
        erro: false,
      };
    }
    // Teto de tamanho: a resposta volta para o contexto do modelo a cada
    // rodada seguinte, e vinte itens com a ficha inteira pesariam à toa.
    return { conteudo: JSON.stringify({ itens: r.itens, haMais: r.haMais }).slice(0, 12000), erro: false };
  }
  const r = await valoresDeAtributoAws(aws, entrada.servico, entrada.atributo);
  if (!r.ok) return { conteudo: r.erro, erro: true };
  return { conteudo: { valores: r.valores }, erro: false };
}

// ── Uma rodada em fluxo ─────────────────────────────────────────────────────

/** Tira a marca de cache dos blocos, para a segunda tentativa quando a conta
 *  recusa o cache. */
const semMarca = (mensagens: Mensagem[]): Mensagem[] => mensagens.map(m => ({
  ...m,
  content: m.content.map(b => { const { cache_control, ...resto } = b; return resto; }),
}));

/**
 * Uma ida ao modelo, em fluxo, montando os blocos da resposta à medida que
 * chegam.
 *
 * Os blocos voltam inteiros, do jeito que a API os mandou - o pensamento com a
 * assinatura, o pedido de ferramenta com a entrada -, porque na rodada
 * seguinte eles precisam ser devolvidos exatamente assim. O texto é contado a
 * quem pediu enquanto chega: é por ele que a janela sabe que parte da
 * proposta está sendo escrita.
 */
async function rodadaEmFluxo(p: {
  apiKey: string;
  corpo: Record<string, any>;
  betas: string[];
  uso: UsoDeTokens;
  aoLer: (texto: string) => void;
}): Promise<
  | { ok: true; blocos: Bloco[]; parada: string }
  | { ok: false; status: number; erro: string; semCache?: boolean }
> {
  const aberta = await abrirChamada(p.apiKey, { ...p.corpo, stream: true }, p.betas);
  if (!aberta.ok) return aberta;
  const leitor = aberta.res.body?.getReader();
  if (!leitor) return { ok: false, status: 502, erro: 'A Anthropic respondeu sem corpo.' };
  p.uso.chamadas++;

  const decodificador = new TextDecoder();
  const blocos: Bloco[] = [];
  const entradas: Record<number, string> = {};
  let sobra = '';
  let texto = '';
  let parada = '';

  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    sobra += decodificador.decode(value, { stream: true });
    const partes = sobra.split('\n\n');
    sobra = partes.pop() ?? '';
    for (const parte of partes) {
      const linhaDeDados = parte.split('\n').find(l => l.startsWith('data:'));
      if (!linhaDeDados) continue;
      let ev: any;
      try { ev = JSON.parse(linhaDeDados.slice(5).trim()); } catch { continue; }

      if (ev.type === 'error') {
        return { ok: false, status: 502, erro: String(ev.error?.message ?? 'A Anthropic interrompeu o preenchimento.') };
      }
      if (ev.type === 'message_start') somarUso(p.uso, ev.message?.usage);
      if (ev.type === 'message_delta') {
        somarUso(p.uso, ev.usage);
        if (ev.delta?.stop_reason) parada = String(ev.delta.stop_reason);
      }
      if (ev.type === 'content_block_start') {
        const b = { ...(ev.content_block ?? {}) };
        if (b.type === 'tool_use') entradas[ev.index] = '';
        blocos[ev.index] = b;
      }
      if (ev.type === 'content_block_delta') {
        const b = blocos[ev.index];
        const d = ev.delta ?? {};
        if (!b) continue;
        if (d.type === 'text_delta') {
          b.text = String(b.text ?? '') + String(d.text ?? '');
          texto += String(d.text ?? '');
          p.aoLer(texto);
        } else if (d.type === 'thinking_delta') {
          b.thinking = String(b.thinking ?? '') + String(d.thinking ?? '');
        } else if (d.type === 'signature_delta') {
          b.signature = String(d.signature ?? '');
        } else if (d.type === 'input_json_delta') {
          entradas[ev.index] = (entradas[ev.index] ?? '') + String(d.partial_json ?? '');
        }
      }
      if (ev.type === 'content_block_stop') {
        const b = blocos[ev.index];
        if (b?.type === 'tool_use') {
          const cru = entradas[ev.index] ?? '';
          try {
            b.input = cru.trim() ? JSON.parse(cru) : {};
          } catch {
            // Entrada que não é JSON: o bloco segue com o texto cru guardado à
            // parte, e a rodada seguinte devolve o erro ao modelo para ele
            // pedir de novo, em vez de derrubar o preenchimento.
            b.input = {};
            Object.defineProperty(b, 'entradaInvalida', { value: cru, enumerable: false });
          }
        }
      }
    }
  }
  return { ok: true, blocos: blocos.filter(Boolean), parada };
}

// ── A porta de entrada ──────────────────────────────────────────────────────

/** O resultado de um pedido: a proposta pronta, ou a pergunta que o parou. */
export type SaidaDoPreenchimento =
  | { status: number; body: any }
  | { status: 200; pausa: { perguntas: PerguntaDaIa[]; estado: string } };

export async function preencherProposta(
  db: Client,
  pedido: {
    oportunidadeId: string;
    contexto: string;
    informado?: Informado;
    /** A volta de uma pergunta: o estado que a tela guardou e as respostas. */
    retomada?: { estado: string; respostas: RespostaDoOperador[] };
  },
  avisar: (e: EventoDaProposta) => void = () => {},
): Promise<SaidaDoPreenchimento> {
  const cred = await getAnthropicCredential(db);
  if (!cred) {
    return {
      status: 503,
      body: { error: 'A chave da Anthropic ainda não foi configurada. Configurações > Integrações.' },
    };
  }

  let pausa: Pausa | null = null;
  if (pedido.retomada) {
    try { pausa = JSON.parse(pedido.retomada.estado) as Pausa; } catch { pausa = null; }
    if (!pausa || !Array.isArray(pausa.conversa) || !pausa.perguntaId) {
      return { status: 400, body: { error: 'O preenchimento que estava parado não pôde ser retomado. Comece de novo.' } };
    }
  }

  // Na volta de uma pergunta, o material é montado de novo sem contar nada à
  // tela: ela já mostrou essa parte, e a janela não deve andar para trás.
  const material = await montarMaterial(db, pedido.oportunidadeId, pausa ? () => {} : avisar);
  if (!material) return { status: 404, body: { error: 'Oportunidade não encontrada.' } };

  const [aws, dolar] = await Promise.all([
    getAwsPrecosCredential(db).catch(() => null),
    pausa ? Promise.resolve(pausa.dolar) : cotacaoDoDolar(),
  ]);

  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const infraTexto = [
    `# Para a infra\n\nHoje é ${hoje}.`,
    dolar
      ? `Dólar para a conversão: R$ ${dolar.valor.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} (PTAX de venda do Banco Central de ${dolar.data.split('-').reverse().join('/')}).`
      : 'A cotação do dólar não pôde ser consultada agora. Deixe os valores de infra como "[a confirmar: câmbio]" e diga isso na fonte.',
    aws
      ? 'A tabela de preços da AWS está disponível pelas ferramentas.'
      : 'A consulta à tabela da AWS não está configurada neste portal. Monte a infra com a estrutura e as premissas, deixe os valores como "[a confirmar]" e diga na fonte que os preços ainda precisam ser consultados.',
  ].join('\n');

  const informado = pedido.informado ? blocoDoInformado(pedido.informado) : null;
  const conteudo: Bloco[] = [
    { type: 'text', text: material.texto },
    ...(informado ? [{ type: 'text', text: informado }] : []),
    {
      type: 'text',
      text: pedido.contexto
        ? `# Contexto do operador\n\nO que quem está montando a proposta quer que você leve em conta, e que vale acima do resto do material quando os dois discordarem:\n\n${pedido.contexto}`
        : '# Contexto do operador\n\nNenhum. Use só o material acima.',
    },
    // A marca de cache fica no fim do que não muda entre as rodadas: tudo até
    // aqui é lido do cache na segunda rodada em diante, e na volta de uma
    // pergunta também.
    { type: 'text', text: infraTexto, cache_control: { type: 'ephemeral' } },
  ];

  const ferramentas = aws
    ? [FERRAMENTA_PRECO, FERRAMENTA_ATRIBUTO, FERRAMENTA_PERGUNTA]
    : [FERRAMENTA_PERGUNTA];

  // Na volta, a resposta fecha a pergunta que ficou aberta, junto com o que
  // mais tinha sido pedido naquela rodada.
  const conversa: Mensagem[] = pausa ? [...pausa.conversa] : [];
  let consultas = pausa?.consultas ?? 0;
  let perguntas = pausa?.perguntas ?? 0;
  if (pausa && pedido.retomada) {
    const respostas = pedido.retomada.respostas.map(r => ({
      id: r.id,
      resposta: r.resposta == null || !String(r.resposta).trim()
        ? 'O operador não sabe. Siga com uma suposição razoável e abra mais a distância entre os cenários.'
        : String(r.resposta).slice(0, 1000),
    }));
    conversa.push({ role: 'user', content: [...pausa.prontos, resultado(pausa.perguntaId, { respostas })] });
  }

  avisar({ tipo: 'pensando' });
  const uso: UsoDeTokens = usoZerado();
  // O Opus 5 pode recusar um pedido pelos classificadores de segurança; com o
  // `fallbacks`, a própria API refaz o pedido em outro modelo em vez de
  // devolver a recusa. Numa proposta comercial é improvável, e por isso mesmo
  // não vale deixar o operador sem rascunho quando acontecer.
  const comFallback = /^claude-(opus-5|fable-5-1)/.test(cred.model);
  let comCache = true;
  let secao: SecaoEscrita | null = null;
  let ultimoAviso = 0;
  let textoFinal = '';

  for (let rodada = 0; rodada < MAX_RODADAS; rodada++) {
    const mensagens: Mensagem[] = [{ role: 'user', content: conteudo }, ...conversa];
    const r = await rodadaEmFluxo({
      apiKey: cred.apiKey,
      betas: comFallback ? ['server-side-fallback-2026-07-01'] : [],
      uso,
      corpo: {
        model: cred.model,
        max_tokens: 32000,
        system: INSTRUCOES,
        tools: ferramentas,
        messages: comCache ? mensagens : semMarca(mensagens),
        ...(comFallback ? { fallbacks: 'default' } : {}),
      },
      aoLer: texto => {
        const atual = [...PARTES].reverse().find(p => texto.includes(p.chave))?.secao ?? null;
        if (atual && atual !== secao) {
          secao = atual;
          avisar({ tipo: 'secao', secao: atual });
        }
        if (texto.length - ultimoAviso >= 400) {
          ultimoAviso = texto.length;
          avisar({ tipo: 'escrevendo', letras: texto.length });
        }
      },
    });
    if (!r.ok) {
      if (r.semCache && comCache) { comCache = false; rodada--; continue; }
      return { status: r.status, body: { error: r.erro } };
    }

    conversa.push({ role: 'assistant', content: r.blocos });
    if (r.parada === 'refusal') {
      return { status: 502, body: { error: 'A IA recusou este preenchimento. Tente reescrever o contexto.' } };
    }
    if (r.parada === 'max_tokens') {
      return { status: 502, body: { error: 'A resposta da IA passou do tamanho máximo. Tente de novo.' } };
    }
    if (r.parada !== 'tool_use') {
      textoFinal = r.blocos.filter(b => b.type === 'text').map(b => String(b.text ?? '')).join('');
      break;
    }

    // As ferramentas pedidas nesta rodada. A pergunta para tudo; as consultas
    // correm em paralelo, porque três preços são três idas à AWS ao mesmo
    // tempo, e não uma fila.
    const pedidos = r.blocos.filter(b => b.type === 'tool_use');
    const pergunta = pedidos.find(b => b.name === 'perguntar_ao_operador' && !(b as any).entradaInvalida);
    const podePerguntar = !!pergunta && perguntas < MAX_PERGUNTAS
      && !entradaValida('perguntar_ao_operador', pergunta.input);

    const resultados = await Promise.all(pedidos.filter(b => b !== pergunta || !podePerguntar).map(async b => {
      const cru = (b as any).entradaInvalida as string | undefined;
      if (cru !== undefined) return resultado(b.id, { INVALID_JSON: cru }, true);
      const invalida = entradaValida(b.name, b.input);
      if (invalida) return resultado(b.id, `Entrada inválida: ${invalida}.`, true);
      if (b.name === 'perguntar_ao_operador') {
        return resultado(b.id, 'Já foram feitas perguntas ao operador. Siga com o que tem e com os três cenários.', true);
      }
      if (consultas >= MAX_CONSULTAS) {
        return resultado(b.id, 'Limite de consultas atingido. Escreva a proposta com os preços que já tem.', true);
      }
      consultas++;
      avisar({ tipo: 'aws', rotulo: NOME_DO_SERVICO[b.input.servico] ?? String(b.input.servico), consultas });
      const f = await rodarFerramenta(aws, b.name, b.input);
      return resultado(b.id, f.conteudo, f.erro);
    }));

    if (pergunta && podePerguntar) {
      perguntas++;
      const lista: PerguntaDaIa[] = pergunta.input.perguntas.slice(0, 4).map((q: any, i: number) => ({
        id: `p${i + 1}`,
        pergunta: limpo(q.pergunta, 300),
        exemplo: limpo(q.exemplo, 160),
      }));
      const estado: Pausa = {
        conversa, perguntaId: pergunta.id, prontos: resultados, consultas, perguntas, dolar,
      };
      return { status: 200, pausa: { perguntas: lista, estado: JSON.stringify(estado) } };
    }
    conversa.push({ role: 'user', content: resultados });
  }

  if (!textoFinal) {
    return { status: 502, body: { error: 'A IA não terminou o preenchimento. Tente de novo.' } };
  }

  avisar({ tipo: 'conferindo' });
  const lido = recortarJson(textoFinal);
  if ('erro' in lido) {
    // O motivo e o fim da resposta ficam no log: sem eles, "fora do formato"
    // não diz por onde começar a consertar.
    console.error('[proposta-ia] resposta fora do formato:', lido.erro,
      '| fim da resposta:', textoFinal.slice(-300));
    return { status: 502, body: { error: 'A IA respondeu fora do formato. Tente de novo.' } };
  }
  return {
    status: 200,
    body: {
      proposta: conferirProposta(lido.valor),
      reunioes: material.reunioes,
      modelo: cred.model,
      consultasAws: consultas,
      uso,
    },
  };
}

/** Exposto para teste: a leitura da resposta é o ponto que mais quebra, e dá
 *  para conferi-la sem gastar uma chamada ao modelo. */
export const _recortarJson = recortarJson;
