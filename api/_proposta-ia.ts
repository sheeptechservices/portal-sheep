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
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import {
  FIREFLIES_KEY, getAnthropicCredential, getIntegrationCredential, obterTranscricaoFireflies,
} from './_credentials.js';
import { pedirEmFluxo, usoZerado, type UsoDeTokens } from './_analise-vaga.js';

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
  /** Terminou de escrever e está conferindo o que veio. */
  | { tipo: 'conferindo' };

export type SecaoEscrita = 'capa' | 'projeto' | 'entregas' | 'operacao' | 'cronograma' | 'investimento';

/** As partes na ordem em que o JSON é escrito, com a chave que abre cada uma.
 *  É por ela que o progresso sabe onde o modelo está. */
const PARTES: { secao: SecaoEscrita; chave: string }[] = [
  { secao: 'capa', chave: '"cliente"' },
  { secao: 'projeto', chave: '"projeto"' },
  { secao: 'entregas', chave: '"entregas"' },
  { secao: 'operacao', chave: '"comoFunciona"' },
  { secao: 'cronograma', chave: '"cronograma"' },
  { secao: 'investimento', chave: '"investimento"' },
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

Responda só com o JSON, sem texto antes nem depois, exatamente neste formato:
{"cliente":"","subtitulo":"","projeto":"","ganhos":[""],"entregas":[{"nome":"","resumo":"","itens":[""]}],"comoFunciona":{"linhaFina":"","passos":[{"titulo":"","texto":""}],"nota":""},"cronograma":{"meses":4,"fases":[{"nome":"","de":1,"ate":1,"sub":[""],"entregas":[""]}]},"investimento":{"opcoes":[{"titulo":"","valor":"","unidade":"","destaque":null,"bullets":[""]}],"time":[{"papel":"","quantidade":1,"dedicacao":"","descricao":"","naoCobrado":false}],"memoria":""}}`;

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
  };
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

export async function preencherProposta(
  db: Client,
  pedido: { oportunidadeId: string; contexto: string; informado?: Informado },
  avisar: (e: EventoDaProposta) => void = () => {},
): Promise<{ status: number; body: any }> {
  const cred = await getAnthropicCredential(db);
  if (!cred) {
    return {
      status: 503,
      body: { error: 'A chave da Anthropic ainda não foi configurada. Configurações > Integrações.' },
    };
  }

  const material = await montarMaterial(db, pedido.oportunidadeId, avisar);
  if (!material) return { status: 404, body: { error: 'Oportunidade não encontrada.' } };

  const informado = pedido.informado ? blocoDoInformado(pedido.informado) : null;
  const conteudo = [
    { type: 'text', text: material.texto },
    ...(informado ? [{ type: 'text', text: informado }] : []),
    {
      type: 'text',
      text: pedido.contexto
        ? `# Contexto do operador\n\nO que quem está montando a proposta quer que você leve em conta, e que vale acima do resto do material quando os dois discordarem:\n\n${pedido.contexto}`
        : '# Contexto do operador\n\nNenhum. Use só o material acima.',
    },
  ];

  avisar({ tipo: 'pensando' });
  const uso: UsoDeTokens = usoZerado();
  let secao: SecaoEscrita | null = null;
  let ultimoAviso = 0;
  const fluxo = await pedirEmFluxo(
    { apiKey: cred.apiKey, modelo: cred.model, system: INSTRUCOES, conteudo, maxTokens: 12000, uso },
    texto => {
      // A parte em que o modelo está é a última cuja chave já apareceu.
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
  );
  if (!fluxo.ok || !fluxo.texto) {
    return { status: fluxo.status ?? 502, body: { error: fluxo.erro ?? 'A IA não respondeu.' } };
  }

  avisar({ tipo: 'conferindo' });
  const lido = recortarJson(fluxo.texto);
  if ('erro' in lido) {
    // O motivo e o começo da resposta ficam no log: sem eles, "fora do formato"
    // não diz por onde começar a consertar.
    console.error('[proposta-ia] resposta fora do formato:', lido.erro,
      '| fim da resposta:', fluxo.texto.slice(-300));
    return { status: 502, body: { error: 'A IA respondeu fora do formato. Tente de novo.' } };
  }
  return {
    status: 200,
    body: {
      proposta: conferirProposta(lido.valor),
      reunioes: material.reunioes,
      modelo: cred.model,
      uso,
    },
  };
}

/** Exposto para teste: a leitura da resposta é o ponto que mais quebra, e dá
 *  para conferi-la sem gastar uma chamada ao modelo. */
export const _recortarJson = recortarJson;
