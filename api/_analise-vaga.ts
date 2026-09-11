// ─────────────────────────────────────────────────────────────────────────────
//  Análise de vaga: quem, no banco de talentos, se encaixa no que se pediu.
//
//  A pessoa cola o texto da vaga - ou solta o PDF do cliente, ou o print da
//  conversa - e a resposta é uma lista ordenada do time e dos interessados, do
//  que mais encaixa ao que menos. Quem lê e ordena é o modelo da Anthropic, e
//  não uma conta de palavras-chave daqui: casar "React" com "React" qualquer
//  `LIKE` faz, mas entender que "precisamos tirar um ERP do papel em quatro
//  meses" pede autonomia e experiência de ponta a ponta, e não uma habilidade
//  em particular, é leitura - e leitura é o que se está comprando aqui.
//
//  ── Por que em três etapas ──────────────────────────────────────────────────
//
//  A primeira versão mandava o banco inteiro numa chamada só e pedia o parecer
//  completo de todo mundo. Com 37 pessoas isso já eram 17 mil tokens de entrada
//  e uns 8 mil de saída, e a saída é o que custa o tempo: três a cinco minutos
//  de espera, medidos. Com mil pessoas não ficaria lento, pararia de funcionar
//  - 460 mil tokens de entrada não cabem na janela do modelo, e o checklist de
//  mil pessoas não cabe no teto de saída.
//
//  Então o trabalho é repartido como um processo seletivo de verdade:
//
//   1. LER A VAGA - uma chamada curta ao modelo bom, com os anexos, que devolve
//      o título, o resumo, os requisitos e o que ficou faltando. É a régua, e
//      ela precisa existir antes de qualquer comparação. Saída minúscula.
//   2. TRIAGEM - o banco inteiro em linhas de uma linha, em lotes paralelos, num
//      modelo barato e rápido, devolvendo só uma nota por pessoa. Nada de
//      justificativa: ninguém lê o parecer do centésimo colocado.
//   3. PARECER - só quem passou da triagem, com o dossiê completo e o checklist
//      item a item, no modelo bom, também em lotes paralelos.
//
//  O dossiê é montado no servidor, e é ele o único mundo do modelo: se um dado
//  não está no dossiê, o modelo não o tem para inventar. Por isso o que vai
//  junto é o que responde "esta pessoa dá conta?" - o que ela declarou saber,
//  há quanto tempo, como a casa a avaliou, o que ela já entregou - e nada mais.
//
//  Fica de fora, de propósito: e-mail, telefone, nascimento e sexo. Os dois
//  primeiros porque contato não decide encaixe, e mandar para fora o que não
//  decide nada é regalar dado à toa. Os dois últimos porque isto aqui é uma
//  decisão de trabalho, e idade e sexo não entram numa decisão de trabalho -
//  ausentes do dossiê, não há como pesarem na conta nem por descuido.
//
//  A chave da API vem do cofre (Configurações > Integrações), com queda para a
//  env var. Sem chave, a ação diz isso em uma frase e não tenta nada.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import { getAnthropicCredential } from './_credentials.js';

/** Um anexo que a pessoa colou ou soltou na gaveta. `base64` pode vir como
 *  data URL (é o que o navegador entrega); o prefixo sai aqui. */
export interface AnexoDaVaga {
  nome: string;
  tipo: string;
  base64: string;
}

/** O que o modelo aceita ler. Imagem cobre o print da conversa e a foto do
 *  quadro; PDF cobre a descrição que veio do cliente. Formato fora desta lista
 *  não é enviado - a API recusaria, e recusar aqui dá uma frase melhor. */
const TIPOS_DE_IMAGEM = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TIPO_PDF = 'application/pdf';

/** Por anexo, já em bytes decodificados. O corpo inteiro da função é de 20 MB,
 *  e base64 engorda um terço: cinco anexos de 5 MB não caberiam. */
const LIMITE_ANEXO = 5 * 1024 * 1024;
const MAX_ANEXOS = 5;

/** Texto longo da ficha entra cortado no parecer. Um resumo profissional tem
 *  meia página; o que passa disso é currículo colado inteiro. */
const LIMITE_TEXTO_LONGO = 2000;

/** E na triagem entra muito menos: ali o resumo serve para dizer de que assunto
 *  a pessoa é, e não para ser lido. Duas linhas bastam, e cada linha a mais se
 *  multiplica por quantas pessoas existirem no banco. */
const LIMITE_RESUMO_NA_TRIAGEM = 160;

// ── Os números do funil ─────────────────────────────────────────────────────
//
//  Todos saem da mesma conta: o que custa tempo é o que o modelo ESCREVE. Um
//  parecer com checklist custa umas 150 palavras por pessoa; uma nota de
//  triagem custa quatro tokens.

/** Pessoas por chamada de triagem. Com 150 o lote fica em uns 15 mil tokens de
 *  entrada, que é confortável, e mil pessoas viram sete chamadas simultâneas. */
const LOTE_TRIAGEM = 150;

/** Quantas passam da triagem para o parecer detalhado. Vinte e quatro é o que
 *  se lê: ninguém abre o trigésimo colocado de uma lista de vaga. */
const TETO_PARECER = 24;

/** Pessoas por chamada de parecer. Os lotes rodam em paralelo, então este número
 *  é o que decide a espera: oito pessoas com checklist são uns trinta segundos
 *  de escrita, e é o que a tela espera no total em vez de somar tudo. */
const LOTE_PARECER = 8;

/** O modelo da triagem. Não é o configurado em Integrações de propósito: a
 *  triagem é grosseira por definição - ela só decide quem merece leitura - e
 *  pagar o modelo caro para escrever um número por pessoa é onde a conta
 *  estourava. Se a conta não enxergar este modelo, a triagem cai no modelo
 *  configurado sozinha. */
const MODELO_DE_TRIAGEM = 'claude-haiku-4-5-20251001';

/** A partir de quantas letras vale marcar um bloco para o cache de prompt. O
 *  mínimo da API é da ordem de 2 mil tokens; abaixo disso a marca não pega e só
 *  ocupa espaço. */
const MINIMO_PARA_CACHE = 8000;

const corte = (v: unknown, max = LIMITE_TEXTO_LONGO) => {
  const s = v == null ? '' : String(v).trim();
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max)} [...]` : s;
};

/** Quem entrou no dossiê, para conferir a resposta do modelo contra a base. O
 *  nome que a tela mostra sai daqui, e não do que o modelo escreveu: modelo
 *  erra a grafia de um nome próprio, e nome errado numa lista de gente é o tipo
 *  de erro que desacredita a lista inteira. */
export interface PessoaDoDossie {
  ref: string;
  /** O apelido curto que vai e volta do modelo, tipo `p12`.
   *
   *  Não é o `ref`: o ref é um UUID, que custa uns quinze tokens para entrar e
   *  outros quinze para voltar escrito. Mil pessoas seriam trinta mil tokens
   *  gastos em identificador. O de-para mora aqui, e a tela nunca vê o apelido. */
  cod: string;
  tipo: 'interno' | 'externo';
  id: string;
  nome: string;
  foto_url: string | null;
  /** Uma linha só, para a triagem. */
  linha: string;
  /** A ficha inteira, para o parecer. */
  bloco: string;
}

export interface Dossie {
  pessoas: Map<string, PessoaDoDossie>;
  /** De apelido curto para pessoa, que é o caminho de volta das respostas. */
  porCodigo: Map<string, PessoaDoDossie>;
  /** As escalas, explicadas uma vez só no alto de cada chamada. */
  cabecalho: string;
}

/** Monta o dossiê da casa inteira. Texto, e não JSON: o modelo lê os dois, mas
 *  quem revisa o prompt lê um só.
 *
 *  Cada pessoa sai em duas versões, da mesma consulta: a linha da triagem e a
 *  ficha do parecer. Montar as duas aqui é o que garante que a segunda etapa
 *  fala da mesma gente que a primeira. */
export async function montarDossie(db: Client): Promise<Dossie> {
  const [comps, internos, externos, habilidades, notas] = await Promise.all([
    db.execute('SELECT id, nome FROM talento_competencias WHERE ativa = 1 ORDER BY ordem, id'),
    db.execute('SELECT id, nome, papel, foto_url, criado_em FROM usuarios WHERE ativo = 1 ORDER BY nome'),
    db.execute(`SELECT id, nome, foto_url, interesse, origem, observacoes, criado_em,
                       cidade, uf, vaga, modelo_trabalho, contratacao, resumo, senioridade,
                       tempo_experiencia, nivel_ingles, outro_idioma, possui_cnpj,
                       regime_fiscal, case_sucesso, indicado_por, candidatura_em
                FROM talentos_externos ORDER BY nome`),
    db.execute('SELECT tipo, pessoa_id, nome, tempo, nivel FROM talento_habilidades ORDER BY nivel DESC, nome'),
    db.execute('SELECT tipo, pessoa_id, competencia_id, nota FROM talento_notas'),
  ]);

  const nomeDaComp = new Map(comps.rows.map(c => [Number(c.id), String(c.nome)]));

  const habDe = new Map<string, string[]>();
  /** Só o nome e o nível, para a linha da triagem: "há 2 anos" é contexto de
   *  leitura fina, e leitura fina é a etapa seguinte. */
  const habCurtaDe = new Map<string, string[]>();
  for (const h of habilidades.rows) {
    const chave = `${h.tipo}:${h.pessoa_id}`;
    const nivel = h.nivel == null ? '?' : String(h.nivel);
    const tempo = h.tempo ? `, ${String(h.tempo)}` : '';
    habDe.set(chave, [...(habDe.get(chave) ?? []), `${String(h.nome)} (nível ${nivel}/5${tempo})`]);
    habCurtaDe.set(chave, [...(habCurtaDe.get(chave) ?? []), `${String(h.nome)} ${nivel}`]);
  }

  const notasDe = new Map<string, { texto: string[]; total: number; quantas: number }>();
  for (const n of notas.rows) {
    const chave = `${n.tipo}:${n.pessoa_id}`;
    const atual = notasDe.get(chave) ?? { texto: [], total: 0, quantas: 0 };
    atual.texto.push(`${nomeDaComp.get(Number(n.competencia_id)) ?? 'Competência'} ${Number(n.nota)}`);
    atual.total += Number(n.nota ?? 0);
    atual.quantas += 1;
    notasDe.set(chave, atual);
  }

  const media = (chave: string): number | null => {
    const a = notasDe.get(chave);
    if (!a?.quantas) return null;
    return Math.round((a.total / a.quantas) * 10) / 10;
  };

  const avaliacao = (chave: string) => {
    const a = notasDe.get(chave);
    if (!a?.quantas) return 'Avaliação da casa: ainda não avaliado';
    const m = String(media(chave)).replace('.', ',');
    return `Avaliação da casa (1 a 10): ${a.texto.join(', ')} | Média ${m}`;
  };

  /** Uma linha de "Campo: valor | Campo: valor", pulando o que está em branco.
   *  Campo vazio impresso como "-" ensinaria o modelo a tratar ausência como
   *  resposta. */
  const linhaDeCampos = (pares: [string, unknown][]) =>
    pares.map(([r, v]) => [r, corte(v, 200)] as const)
      .filter(([, v]) => v !== '')
      .map(([r, v]) => `${r}: ${v}`)
      .join(' | ');

  /** A linha da triagem: campos separados por barra, sem rótulo. O rótulo é
   *  para quem lê uma ficha; aqui são mil linhas iguais, e a posição já diz o
   *  que é cada pedaço. */
  const emLinha = (cod: string, partes: unknown[]) =>
    `${cod} ${partes.map(p => String(p ?? '').trim()).filter(Boolean).join(' | ')}`;

  const pessoas = new Map<string, PessoaDoDossie>();
  const porCodigo = new Map<string, PessoaDoDossie>();
  let n = 0;

  for (const u of internos.rows) {
    const ref = `interno:${String(u.id)}`;
    const cod = `p${++n}`;
    const m = media(ref);
    const p: PessoaDoDossie = {
      ref, cod, tipo: 'interno', id: String(u.id), nome: String(u.nome),
      foto_url: u.foto_url != null ? String(u.foto_url) : null,
      linha: emLinha(cod, [
        String(u.nome), 'JÁ É DO TIME', u.papel,
        (habCurtaDe.get(ref) ?? []).join(', '),
        m == null ? '' : `casa ${String(m).replace('.', ',')}`,
      ]),
      bloco: [
        `### ${cod} - ${String(u.nome)} (JÁ É DO TIME)`,
        linhaDeCampos([['Papel na casa', u.papel], ['Na casa desde', String(u.criado_em ?? '').slice(0, 10)]]),
        (habDe.get(ref) ?? []).length
          ? `Habilidades declaradas: ${(habDe.get(ref) ?? []).join(', ')}`
          : 'Habilidades declaradas: nenhuma cadastrada',
        avaliacao(ref),
      ].filter(Boolean).join('\n'),
    };
    pessoas.set(ref, p);
    porCodigo.set(cod, p);
  }

  for (const t of externos.rows) {
    const ref = `externo:${String(t.id)}`;
    const cod = `p${++n}`;
    const m = media(ref);
    const cnpj = t.possui_cnpj == null ? '' : (Number(t.possui_cnpj) === 1 ? 'sim' : 'não');
    const p: PessoaDoDossie = {
      ref, cod, tipo: 'externo', id: String(t.id), nome: String(t.nome),
      foto_url: t.foto_url != null ? String(t.foto_url) : null,
      linha: emLinha(cod, [
        String(t.nome), t.senioridade, t.tempo_experiencia,
        (habCurtaDe.get(ref) ?? []).join(', '),
        m == null ? '' : `casa ${String(m).replace('.', ',')}`,
        [t.modelo_trabalho, t.contratacao].filter(Boolean).join('/'),
        t.nivel_ingles ? `inglês ${String(t.nivel_ingles)}` : '',
        corte(t.resumo, LIMITE_RESUMO_NA_TRIAGEM),
      ]),
      bloco: [
        `### ${cod} - ${String(t.nome)} (INTERESSADO, ainda não trabalha aqui)`,
        linhaDeCampos([
          ['Interesse', t.interesse], ['Vaga a que se candidatou', t.vaga],
          ['Senioridade', t.senioridade], ['Tempo de experiência', t.tempo_experiencia],
          ['Inglês', t.nivel_ingles], ['Outro idioma', t.outro_idioma],
        ]),
        linhaDeCampos([
          ['Onde mora', [t.cidade, t.uf].filter(Boolean).join('/')],
          ['Modelo de trabalho', t.modelo_trabalho], ['Contratação', t.contratacao],
          ['Tem CNPJ', cnpj], ['Regime', t.regime_fiscal],
          ['Origem', t.origem], ['Indicado por', t.indicado_por],
          ['Candidatura em', String(t.candidatura_em ?? t.criado_em ?? '').slice(0, 10)],
        ]),
        (habDe.get(ref) ?? []).length
          ? `Habilidades declaradas: ${(habDe.get(ref) ?? []).join(', ')}`
          : 'Habilidades declaradas: nenhuma cadastrada',
        avaliacao(ref),
        corte(t.resumo) ? `Resumo profissional (escrito pela pessoa): ${corte(t.resumo)}` : '',
        corte(t.case_sucesso) ? `Case que a pessoa contou: ${corte(t.case_sucesso)}` : '',
        corte(t.observacoes) ? `Observações internas da casa: ${corte(t.observacoes)}` : '',
      ].filter(Boolean).join('\n'),
    };
    pessoas.set(ref, p);
    porCodigo.set(cod, p);
  }

  const cabecalho = [
    `Pessoas no banco: ${pessoas.size} (${internos.rows.length} do time, ${externos.rows.length} interessados).`,
    `Competências avaliadas pela casa: ${comps.rows.map(c => String(c.nome)).join(', ')}.`,
    'Escalas: habilidade declarada vai de 1 a 5 e é autoavaliação; a avaliação da casa vai de 1 a 10 e foi dada por quem trabalha aqui.',
  ].join('\n');

  return { pessoas, porCodigo, cabecalho };
}

// ── O que se pede ao modelo, etapa por etapa ────────────────────────────────

const COMO_ESCREVER = `Português do Brasil, direto, sem floreio e sem linguagem de anúncio. Nunca use travessão longo nem travessão médio: onde eles caberiam, use hífen cercado de espaços.`;

const REGRAS_DE_JUSTICA = `Não considere nem infira idade, sexo, aparência, estado civil, religião ou origem: nada disso decide encaixe, e nada disso está no dossiê. Nunca invente formação, empresa, certificação ou habilidade que não esteja no dossiê.`;

/** Etapa 1. A régua da vaga, que as duas etapas seguintes usam. */
const INSTRUCOES_VAGA = `Você é o recrutador técnico da Sheep Technology, uma empresa de tecnologia brasileira. Recebe a descrição de uma vaga ou de uma demanda, escrita ou em anexo, e devolve o que ela de fato pede.

- Se a vaga vier em anexo (PDF ou print), o anexo é a fonte principal e o texto digitado é o complemento.
- Os requisitos são de quatro a oito, do mais decisivo ao menos, e cada um é verificável numa ficha de pessoa: "React com dois anos ou mais" vale; "perfil dinâmico" não vale nada.
- Requisito é o que a vaga pede, e não o que seria bom ter: senioridade, autonomia, tempo em problema parecido, idioma, modelo de trabalho e forma de contratação entram quando a vaga falar deles.
- ${COMO_ESCREVER}

Responda com UM objeto JSON e nada mais, sem cerca de código:

{
  "titulo": "o cargo ou a demanda, em poucas palavras",
  "resumo": "de duas a quatro frases sobre o que a vaga precisa",
  "requisitos": ["um requisito por item, do mais ao menos decisivo"],
  "faltou": "o que a descricao nao disse e faria diferenca na escolha, ou string vazia"
}`;

/** Etapa 2. Uma nota por pessoa, e nada além disso. */
const INSTRUCOES_TRIAGEM = `Você é o recrutador técnico da Sheep Technology. Recebe uma lista compacta de pessoas do banco de talentos da casa e os requisitos de uma vaga, e dá a cada pessoa uma nota de 0 a 100 que responde "quanto desta vaga esta pessoa cobre hoje".

Esta é a triagem: ela só decide quem merece leitura detalhada depois. Então não escreva justificativa, parecer nem comentário - só a nota.

- Use a régua toda: encaixe forte fica acima de 75, encaixe possível entre 45 e 75, e quem não tem nada a ver com a vaga fica abaixo de 25.
- Habilidade declarada é autoavaliação e vale menos do que a avaliação da casa, que foi dada por quem trabalha com a pessoa.
- Ausência de dado não é nota baixa nem nota alta: na dúvida entre duas notas, fique com a maior, porque quem ficar de fora aqui não é lido depois.
- Quem já é do time é avaliado como todo mundo.
- ${REGRAS_DE_JUSTICA}

Responda com UM objeto JSON e nada mais, sem cerca de código, com TODAS as pessoas da lista e nenhuma a mais:

{"notas":[{"p":"p12","n":78},{"p":"p13","n":41}]}

"p" é o código exato da pessoa, como aparece no começo da linha dela. "n" é um inteiro de 0 a 100.`;

/** Etapa 3. O parecer de quem passou. */
const INSTRUCOES_PARECER = `Você é o recrutador técnico da Sheep Technology. Recebe os requisitos de uma vaga e a ficha completa das pessoas que passaram na triagem do banco de talentos, e escreve o parecer de cada uma.

Como avaliar:
- Pese o que a vaga de fato pede: as habilidades, mas também senioridade, autonomia, tempo em problema parecido, idioma, modelo de trabalho e forma de contratação.
- Habilidade declarada é autoavaliação e vale menos do que evidência: o case contado, o tempo de uso e a avaliação da casa valem mais.
- Quem já é do time entra na lista como todo mundo, mas diga na justificativa que tirá-lo de onde está tem custo.
- Ausência de dado não é nota baixa nem nota alta: é ausência, e você diz isso.
- ${REGRAS_DE_JUSTICA}

Como escrever:
- ${COMO_ESCREVER}
- A justificativa de cada pessoa tem no máximo duas frases, e cita o que na ficha sustenta a nota. "Tem React há 3 anos e o case dele é uma migração de front" vale; "perfil alinhado à vaga" não vale nada.
- A nota de cada item do checklist tem no máximo oito palavras, sempre.

A aderência vai de 0 a 100 e é a resposta à pergunta "quanto desta vaga esta pessoa cobre hoje". Use a régua toda: encaixe forte fica acima de 75, encaixe possível entre 45 e 75, e quem não tem nada a ver com a vaga fica abaixo de 25. A nota da triagem que veio junto é um palpite grosseiro: confirme ou corrija, sem se prender a ela.`;

const FORMATO_PARECER = `Responda com UM objeto JSON e nada mais: sem texto antes, sem texto depois, sem cerca de codigo.

{
  "ranking": [
    {
      "p": "o codigo exato da pessoa, como p12",
      "aderencia": 91,
      "veredito": "forte",
      "justificativa": "no maximo duas frases, apoiadas na ficha",
      "checklist": [
        { "situacao": "atende", "nota": "React ha 4 anos, nivel 5" },
        { "situacao": "nao", "nota": "Nao declarou TypeScript" }
      ]
    }
  ]
}

"aderencia" e um numero inteiro de 0 a 100. "veredito" e uma destas tres palavras: "forte", "possivel", "fraco". "ranking" traz TODAS as pessoas que voce recebeu, da maior aderencia a menor, e nenhuma pode ficar de fora.

O "checklist" e a parte mais importante da resposta, e obedece a tres regras sem excecao:
1. Ele tem UM item para CADA requisito da vaga, na mesma ordem em que eles foram listados. Se sao seis requisitos, sao seis itens - para todas as pessoas, inclusive as que nao se encaixam.
2. "situacao" e uma destas tres palavras: "atende" (a ficha mostra que sim), "parcial" (chega perto, ou a ficha so sugere) e "nao" (a ficha nao mostra, ou mostra o contrario). Ausencia de dado e "nao", e a nota diz que e ausencia.
3. "nota" explica aquele item naquela pessoa em no maximo oito palavras, apoiada na ficha: "React ha 4 anos, nivel 5" vale; "atende ao requisito" nao vale nada.`;

/** O recado final sai junto do lote mais forte, e não numa chamada própria: ele
 *  fala justamente de quem está no topo, e uma chamada a mais seria mais espera
 *  para dizer o que este lote já tem na frente. */
const PEDIDO_DE_OBSERVACOES = `Este é o lote das pessoas mais fortes da triagem, então acrescente ao JSON uma chave "observacoes" no primeiro nível: o recado final para quem pediu a análise, em duas a quatro frases. Se a base não cobre a vaga, diga que perfil falta contratar e o que checar numa conversa.`;

// ── A conversa com a API ─────────────────────────────────────────────────────

/** O que a análise conta enquanto acontece. */
export type EventoDaAnalise =
  /** O dossiê ficou pronto: são estas as pessoas que entram na comparação. */
  | { tipo: 'dossie'; total: number }
  /** O modelo terminou de ler a vaga e escreveu o que entendeu dela. */
  | { tipo: 'vaga'; titulo: string }
  /** A triagem andou: tantas pessoas de tantas já foram pontuadas. */
  | { tipo: 'triagem'; feitas: number; total: number }
  /** Mais uma pessoa com parecer escrito. */
  | { tipo: 'pessoa'; feitas: number; total: number; nome: string }
  /** Chegou mais texto, mas nenhuma pessoa fechou ainda. É o sinal de vida do
   *  trecho em que o modelo escreve e ainda não há nada a contar. */
  | { tipo: 'escrevendo'; letras: number }
  /** Os pareceres acabaram e o relatório está sendo montado. */
  | { tipo: 'fechando' };

type Aviso = (e: EventoDaAnalise) => void;

/** O cache de prompt é opcional: se a conta ou a versão da API recusarem a
 *  marca, a análise segue sem ela em vez de falhar. Uma recusa basta para o
 *  processo inteiro parar de mandá-la. */
let cacheAceito = true;

type Resposta =
  | { ok: true; res: Response }
  | { ok: false; status: number; erro: string; semCache?: boolean };

/** Abre a chamada, com uma segunda tentativa quando a recusa é de fila cheia.
 *  429 e 529 são "volte já"; 401 e 400 são "não adianta insistir". */
async function abrirChamada(apiKey: string, corpo: unknown): Promise<Resposta> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(corpo),
      });
    } catch (e: any) {
      return { ok: false, status: 502, erro: e?.message || 'Sem conexão com a Anthropic.' };
    }
    if (res.ok) return { ok: true, res };
    const dados: any = await res.json().catch(() => null);
    const detalhe = dados?.error?.message ? String(dados.error.message) : `HTTP ${res.status}`;
    if ((res.status === 429 || res.status === 529) && tentativa === 0) {
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }
    // Recusa por causa do cache: quem chamou tenta de novo sem a marca.
    if (res.status === 400 && /cache/i.test(detalhe)) {
      cacheAceito = false;
      return { ok: false, status: 400, erro: detalhe, semCache: true };
    }
    const erro = res.status === 401 || res.status === 403
      ? 'A chave da Anthropic foi recusada. Confira em Configurações > Integrações.'
      : res.status === 429 || res.status === 529
        ? 'A Anthropic está sobrecarregada agora. Tente de novo em alguns instantes.'
        : `A Anthropic recusou a análise: ${detalhe}`;
    return { ok: false, status: 502, erro };
  }
  return { ok: false, status: 502, erro: 'A Anthropic não respondeu.' };
}

/** O que a análise gastou, somado de todas as chamadas. Fica guardado no
 *  relatório: "está consumindo token demais" é uma reclamação que só se resolve
 *  com número, e o número tem de estar do lado da análise que o gerou. */
export interface UsoDeTokens {
  chamadas: number;
  entrada: number;
  saida: number;
  /** Entrada que veio do cache de prompt, que custa uma fração da outra. */
  cache_lido: number;
  cache_escrito: number;
}

const usoZerado = (): UsoDeTokens =>
  ({ chamadas: 0, entrada: 0, saida: 0, cache_lido: 0, cache_escrito: 0 });

/** Soma o que a API informou. Vem de dois lugares - a resposta inteira, nas
 *  chamadas comuns, e os eventos `message_start` e `message_delta`, no fluxo. */
function somarUso(uso: UsoDeTokens, u: any) {
  if (!u) return;
  uso.entrada += Number(u.input_tokens ?? 0);
  uso.saida += Number(u.output_tokens ?? 0);
  uso.cache_lido += Number(u.cache_read_input_tokens ?? 0);
  uso.cache_escrito += Number(u.cache_creation_input_tokens ?? 0);
}

interface Pedido {
  apiKey: string;
  modelo: string;
  system: string;
  conteudo: any[];
  maxTokens: number;
  uso: UsoDeTokens;
}

/** Uma chamada comum, sem fluxo: manda, espera, devolve o texto. Serve às
 *  etapas curtas - ler a vaga e triar -, em que não há nada para contar no meio
 *  do caminho e o que chega é pequeno. */
async function pedir(p: Pedido): Promise<{ ok: true; texto: string } | { ok: false; status: number; erro: string }> {
  for (let volta = 0; volta < 2; volta++) {
    const corpo = {
      model: p.modelo,
      max_tokens: p.maxTokens,
      system: p.system,
      messages: [{ role: 'user', content: p.conteudo }],
    };
    const aberta = await abrirChamada(p.apiKey, corpo);
    if (!aberta.ok) {
      if (aberta.semCache && volta === 0) { p.conteudo = semCache(p.conteudo); continue; }
      return { ok: false, status: aberta.status, erro: aberta.erro };
    }
    const dados: any = await aberta.res.json().catch(() => null);
    p.uso.chamadas++;
    somarUso(p.uso, dados?.usage);
    const texto = (dados?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => String(b.text ?? ''))
      .join('');
    if (!texto) return { ok: false, status: 502, erro: 'A Anthropic respondeu sem texto.' };
    return { ok: true, texto };
  }
  return { ok: false, status: 502, erro: 'A Anthropic não respondeu.' };
}

/** Tira a marca de cache de todos os blocos, para a segunda tentativa. */
const semCache = (conteudo: any[]) =>
  conteudo.map(b => { const { cache_control, ...resto } = b; return resto; });

interface Fluxo {
  ok: boolean;
  texto?: string;
  /** A resposta bateu no teto e foi remendada: falta gente no fim do lote. */
  cortado?: boolean;
  status?: number;
  erro?: string;
}

/**
 * Uma chamada em fluxo. É a do parecer, que é a demorada: uma ida de um minuto
 * sem notícia nenhuma parece travada, e o que se pode contar durante ela -
 * quantas pessoas já foram avaliadas, e quais - é justamente o que quem pediu
 * quer saber.
 */
async function pedirEmFluxo(p: Pedido, aoLer: (texto: string) => void): Promise<Fluxo> {
  let conteudo = p.conteudo;
  for (let volta = 0; volta < 2; volta++) {
    const aberta = await abrirChamada(p.apiKey, {
      model: p.modelo,
      max_tokens: p.maxTokens,
      system: p.system,
      messages: [{ role: 'user', content: conteudo }],
      stream: true,
    });
    if (!aberta.ok) {
      if (aberta.semCache && volta === 0) { conteudo = semCache(conteudo); continue; }
      return { ok: false, status: aberta.status, erro: aberta.erro };
    }

    const leitor = aberta.res.body?.getReader();
    if (!leitor) return { ok: false, status: 502, erro: 'A Anthropic respondeu sem corpo.' };
    const decodificador = new TextDecoder();
    let sobra = '';
    let texto = '';
    p.uso.chamadas++;

    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      sobra += decodificador.decode(value, { stream: true });
      // Evento de SSE termina em linha em branco; o que sobrar fica para a
      // próxima leitura, porque um evento pode chegar partido ao meio.
      const partes = sobra.split('\n\n');
      sobra = partes.pop() ?? '';
      for (const parte of partes) {
        const linha = parte.split('\n').find(l => l.startsWith('data:'));
        if (!linha) continue;
        let evento: any;
        try { evento = JSON.parse(linha.slice(5).trim()); } catch { continue; }
        if (evento.type === 'error') {
          return { ok: false, status: 502, erro: String(evento.error?.message ?? 'A Anthropic interrompeu a análise.') };
        }
        if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
          texto += String(evento.delta.text ?? '');
          aoLer(texto);
        }
        // A entrada vem no começo e a saída no fim, em eventos diferentes.
        if (evento.type === 'message_start') somarUso(p.uso, evento.message?.usage);
        if (evento.type === 'message_delta') somarUso(p.uso, evento.usage);
      }
    }
    return { ok: true, texto };
  }
  return { ok: false, status: 502, erro: 'A Anthropic não respondeu.' };
}

/** O JSON dentro do que o modelo escreveu: da primeira chave em diante, e ate a
 *  ultima que fechar. Cerca de codigo, "Claro, aqui esta" e frase emendada no
 *  fim ficam de fora sem derrubar a analise. */
function recortarJson(texto: string): string | null {
  const abre = texto.indexOf('{');
  if (abre < 0) return null;
  const fecha = texto.lastIndexOf('}');
  return fecha > abre ? texto.slice(abre, fecha + 1) : texto.slice(abre);
}

/**
 * Fecha um JSON que parou no meio.
 *
 * Corta no último item completo do ranking - o último `}` que fecha uma pessoa -
 * e fecha na mão o que ficou aberto. Não tenta adivinhar o que faltava: o que
 * não chegou inteiro não entra.
 */
function remendarJson(json: string): any | null {
  const pilha: string[] = [];
  let emTexto = false;
  let escapado = false;
  let corteEm = -1;
  let pilhaNoCorte: string[] = [];
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (emTexto) {
      if (escapado) escapado = false;
      else if (c === '\\') escapado = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === '{' || c === '[') pilha.push(c);
    else if (c === '}' || c === ']') {
      pilha.pop();
      if (c === '}' && pilha.length === 2 && pilha[1] === '[') {
        corteEm = i + 1;
        pilhaNoCorte = [...pilha];
      }
    }
  }
  if (corteEm < 0) return null;
  const remate = [...pilhaNoCorte].reverse().map(a => (a === '{' ? '}' : ']')).join('');
  try { return JSON.parse(json.slice(0, corteEm) + remate); } catch { return null; }
}

/** O JSON que o modelo escreveu, inteiro ou remendado. */
function lerJson(texto: string): { valor: any; cortado: boolean } | null {
  const cru = recortarJson(texto);
  if (!cru) return null;
  try { return { valor: JSON.parse(cru), cortado: false }; } catch { /* segue para o remendo */ }
  const salvo = remendarJson(cru);
  return salvo ? { valor: salvo, cortado: true } : null;
}

/** Reparte uma lista em lotes de tamanho fixo. */
function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

/** Um bloco de texto para o modelo, marcado para cache quando for grande o
 *  bastante para valer a pena. O que se marca é sempre o que se repete entre
 *  análises: o dossiê, e nunca a vaga. */
const blocoDeTexto = (text: string, cachear = false) =>
  cachear && cacheAceito && text.length >= MINIMO_PARA_CACHE
    ? { type: 'text', text, cache_control: { type: 'ephemeral' } }
    : { type: 'text', text };

// ── As três etapas ───────────────────────────────────────────────────────────

interface Briefing {
  titulo: string;
  resumo: string;
  requisitos: string[];
  faltou: string | null;
}

/** Etapa 1: ler a vaga. É a única que enxerga os anexos - dali em diante o que
 *  circula é o briefing, que é texto curto e cabe em toda chamada sem pesar. */
async function lerAVaga(
  apiKey: string, modelo: string, texto: string, anexos: AnexoDaVaga[], uso: UsoDeTokens,
): Promise<{ ok: true; briefing: Briefing } | { ok: false; status: number; erro: string }> {
  // Os anexos primeiro, e o texto depois: documento antes da pergunta é o que a
  // própria Anthropic recomenda, e aqui o que se digita costuma ser justamente
  // o comentário sobre o que foi anexado.
  const conteudo: any[] = [];
  for (const a of anexos) {
    const dados = String(a.base64 ?? '').split(',').pop() ?? '';
    if (!dados) continue;
    if (a.tipo === TIPO_PDF) {
      conteudo.push({ type: 'document', source: { type: 'base64', media_type: TIPO_PDF, data: dados } });
    } else if (TIPOS_DE_IMAGEM.includes(a.tipo)) {
      conteudo.push({ type: 'image', source: { type: 'base64', media_type: a.tipo, data: dados } });
    }
  }
  conteudo.push(blocoDeTexto([
    'A VAGA / DEMANDA:',
    texto.trim() || '(sem texto digitado - está tudo no anexo acima)',
  ].join('\n')));

  const r = await pedir({ apiKey, modelo, system: INSTRUCOES_VAGA, conteudo, maxTokens: 1500, uso });
  if (!r.ok) return r;
  const lido = lerJson(r.texto);
  if (!lido) return { ok: false, status: 502, erro: 'A Anthropic não devolveu a leitura da vaga no formato esperado.' };
  const v = lido.valor;
  const requisitos: string[] = (Array.isArray(v?.requisitos) ? v.requisitos : []).map(String).filter(Boolean);
  if (requisitos.length === 0) {
    return { ok: false, status: 502, erro: 'A leitura da vaga saiu sem requisitos. Descreva a vaga com um pouco mais de detalhe.' };
  }
  return {
    ok: true,
    briefing: {
      titulo: String(v?.titulo ?? 'Vaga sem título'),
      resumo: String(v?.resumo ?? ''),
      requisitos,
      faltou: String(v?.faltou ?? '').trim() || null,
    },
  };
}

/** O briefing em texto, do jeito que as etapas seguintes o recebem. */
const briefingEmTexto = (b: Briefing) => [
  `A VAGA: ${b.titulo}`,
  b.resumo,
  '',
  'REQUISITOS, do mais decisivo ao menos:',
  ...b.requisitos.map((r, i) => `${i + 1}. ${r}`),
].join('\n');

/** Etapa 2: uma nota para cada pessoa do banco, em lotes paralelos.
 *
 *  Lote que falhar não derruba a análise: as pessoas dele ficam sem nota e
 *  aparecem no fim da lista, que é o mesmo tratamento de quem o modelo esquece.
 *  Só se TODOS falharem é que não há análise a entregar. */
async function triar(
  apiKey: string, modelo: string, dossie: Dossie, briefing: Briefing, avisar: Aviso,
  uso: UsoDeTokens,
): Promise<{ ok: true; notas: Map<string, number> } | { ok: false; status: number; erro: string }> {
  const gente = [...dossie.pessoas.values()];
  const lotes = emLotes(gente, LOTE_TRIAGEM);
  const notas = new Map<string, number>();
  let feitas = 0;
  let falhas = 0;
  let ultimoErro = 'A triagem não saiu.';

  await Promise.all(lotes.map(async lote => {
    const conteudo = [
      // O dossiê primeiro, e marcado para cache: ele é o que se repete entre
      // uma análise e outra, e o que vem antes da vaga é o que o cache alcança.
      blocoDeTexto(`${dossie.cabecalho}\n\nAS PESSOAS:\n${lote.map(p => p.linha).join('\n')}`, true),
      blocoDeTexto([
        briefingEmTexto(briefing),
        '',
        `Dê a nota das ${lote.length} pessoas acima. Responda só com o JSON.`,
      ].join('\n')),
    ];
    const r = await pedir({
      apiKey, modelo, system: INSTRUCOES_TRIAGEM, conteudo, uso,
      // Uma nota são uns doze tokens; a folga é para o modelo que resolve
      // escrever a chave por extenso.
      maxTokens: Math.min(8000, 200 + lote.length * 25),
    });
    if (!r.ok) { falhas++; ultimoErro = r.erro; return; }
    const lido = lerJson(r.texto);
    for (const item of (Array.isArray(lido?.valor?.notas) ? lido!.valor.notas : [])) {
      const p = dossie.porCodigo.get(String(item?.p ?? '').trim());
      const n = Number(item?.n);
      if (p && Number.isFinite(n)) notas.set(p.ref, Math.max(0, Math.min(100, Math.round(n))));
    }
    feitas += lote.length;
    avisar({ tipo: 'triagem', feitas, total: gente.length });
  }));

  if (falhas === lotes.length) return { ok: false, status: 502, erro: ultimoErro };
  return { ok: true, notas };
}

interface ParecerDaPessoa {
  ref: string;
  aderencia: number;
  veredito: string;
  justificativa: string;
  checklist: { situacao: string; nota: string }[];
}

/** Etapa 3: o parecer de quem passou, em lotes paralelos.
 *
 *  O primeiro lote é o das pessoas mais fortes, e é ele que escreve o recado
 *  final: é sobre elas que o recado fala, e uma chamada só para isso seria mais
 *  espera para dizer o que este lote já tem na frente. */
async function escreverPareceres(
  apiKey: string, modelo: string, dossie: Dossie, briefing: Briefing,
  escolhidos: { pessoa: PessoaDoDossie; nota: number | null }[],
  textoDaVaga: string, avisar: Aviso, uso: UsoDeTokens,
): Promise<{ pareceres: Map<string, ParecerDaPessoa>; observacoes: string; cortado: boolean }> {
  const lotes = emLotes(escolhidos, LOTE_PARECER);
  const pareceres = new Map<string, ParecerDaPessoa>();
  let observacoes = '';
  let cortado = false;
  let feitas = 0;
  /** O que cada lote já contou, para o total não andar duas vezes pela mesma
   *  pessoa quando o texto parcial é relido. */
  const contadasPorLote = new Array(lotes.length).fill(0);
  let ultimoSinal = 0;

  await Promise.all(lotes.map(async (lote, i) => {
    const primeiro = i === 0;
    const conteudo = [
      blocoDeTexto([
        dossie.cabecalho,
        '',
        'AS PESSOAS QUE PASSARAM NA TRIAGEM:',
        ...lote.map(({ pessoa, nota }) =>
          `${pessoa.bloco}\nNota da triagem: ${nota == null ? 'sem nota' : nota}`),
      ].join('\n\n')),
      blocoDeTexto([
        briefingEmTexto(briefing),
        briefing.faltou ? `\nO que a descrição não disse: ${briefing.faltou}` : '',
        textoDaVaga.trim() ? `\nTexto original de quem pediu:\n${corte(textoDaVaga, 4000)}` : '',
        '',
        `Escreva o parecer das ${lote.length} pessoas acima, da maior aderência à menor.`,
        primeiro ? PEDIDO_DE_OBSERVACOES : '',
        'Responda só com o JSON.',
      ].filter(Boolean).join('\n')),
    ];

    const fluxo = await pedirEmFluxo({
      apiKey, modelo, system: `${INSTRUCOES_PARECER}\n\n${FORMATO_PARECER}`, conteudo, uso,
      // Um parecer com checklist dá umas 250 palavras por pessoa; o dobro disso
      // é folga suficiente para não cortar ninguém no fim do lote.
      maxTokens: Math.min(16000, 1000 + lote.length * 900),
    }, texto => {
      // O que já dá para ler no JSON parcial vira aviso. Rodar sobre o texto
      // inteiro a cada pedaço é barato: são poucos milhares de letras.
      const codigos = [...texto.matchAll(/"p"\s*:\s*"([^"]+)"/g)];
      if (codigos.length > contadasPorLote[i]) {
        feitas += codigos.length - contadasPorLote[i];
        contadasPorLote[i] = codigos.length;
        const ultimo = dossie.porCodigo.get(codigos[codigos.length - 1][1]);
        avisar({
          tipo: 'pessoa',
          feitas: Math.min(feitas, escolhidos.length),
          total: escolhidos.length,
          nome: ultimo?.nome ?? '',
        });
      }
      const agora = Date.now();
      if (agora - ultimoSinal > 1000) {
        ultimoSinal = agora;
        avisar({ tipo: 'escrevendo', letras: texto.length });
      }
    });

    if (!fluxo.ok || !fluxo.texto) return;
    const lido = lerJson(fluxo.texto);
    if (!lido) return;
    if (lido.cortado) cortado = true;
    if (primeiro && typeof lido.valor?.observacoes === 'string') {
      observacoes = String(lido.valor.observacoes).trim();
    }
    for (const item of (Array.isArray(lido.valor?.ranking) ? lido.valor.ranking : [])) {
      const p = dossie.porCodigo.get(String(item?.p ?? '').trim());
      if (!p) continue;
      const nota = Number(item?.aderencia);
      pareceres.set(p.ref, {
        ref: p.ref,
        aderencia: Number.isFinite(nota) ? Math.max(0, Math.min(100, Math.round(nota))) : 0,
        veredito: ['forte', 'possivel', 'fraco'].includes(item?.veredito) ? String(item.veredito) : 'possivel',
        justificativa: String(item?.justificativa ?? '').trim(),
        checklist: (Array.isArray(item?.checklist) ? item.checklist : []).map((c: any) => ({
          situacao: String(c?.situacao ?? ''),
          nota: String(c?.nota ?? '').trim(),
        })),
      });
    }
  }));

  return { pareceres, observacoes, cortado };
}

export interface PedidoDeAnalise {
  texto: string;
  anexos: AnexoDaVaga[];
}

/**
 * A análise inteira: monta o dossiê, lê a vaga, tria o banco, escreve o parecer
 * de quem passou e devolve o relatório já conferido contra a base.
 *
 * `avisar` recebe o andamento. Quem chama decide o que fazer com ele - o
 * endpoint repassa para o navegador, e um teste só coleciona.
 */
export async function analisarVaga(
  db: Client,
  { texto, anexos }: PedidoDeAnalise,
  avisar: Aviso = () => {},
): Promise<{ status: number; body: any }> {
  const cred = await getAnthropicCredential(db);
  if (!cred) {
    return {
      status: 503,
      body: { error: 'A chave da Anthropic ainda não foi configurada. Configurações > Integrações.' },
    };
  }

  const dossie = await montarDossie(db);
  if (dossie.pessoas.size === 0) {
    return { status: 400, body: { error: 'O banco de talentos está vazio - não há quem comparar.' } };
  }
  avisar({ tipo: 'dossie', total: dossie.pessoas.size });

  const uso = usoZerado();
  const comecou = Date.now();

  // ── 1. Ler a vaga ──
  const leitura = await lerAVaga(cred.apiKey, cred.model, texto, anexos, uso);
  if (!leitura.ok) return { status: leitura.status, body: { error: leitura.erro } };
  const briefing = leitura.briefing;
  avisar({ tipo: 'vaga', titulo: briefing.titulo });

  // ── 2. Triar o banco ──
  //
  //  O modelo da triagem é o barato. Se a conta não o enxergar, a etapa refaz
  //  no modelo configurado: melhor uma triagem cara que nenhuma análise.
  let triagem = await triar(cred.apiKey, MODELO_DE_TRIAGEM, dossie, briefing, avisar, uso);
  if (!triagem.ok && cred.model !== MODELO_DE_TRIAGEM) {
    triagem = await triar(cred.apiKey, cred.model, dossie, briefing, avisar, uso);
  }
  if (!triagem.ok) return { status: triagem.status, body: { error: triagem.erro } };
  const notas = triagem.notas;

  // ── 3. O parecer de quem passou ──
  //
  //  Sem nota nenhuma a pessoa vai para o fim da fila, e não para o começo:
  //  gastar o parecer caro em quem a triagem não alcançou tiraria a vaga de
  //  quem ela alcançou.
  const ordenados = [...dossie.pessoas.values()]
    .map(pessoa => ({ pessoa, nota: notas.get(pessoa.ref) ?? null }))
    .sort((a, b) => (b.nota ?? -1) - (a.nota ?? -1));
  const escolhidos = ordenados.slice(0, TETO_PARECER).filter(x => x.nota != null);
  // Banco pequeno e triagem que não pegou ninguém: o parecer sai do topo da
  // ordem mesmo assim, senão a análise devolveria uma lista sem leitura nenhuma.
  const paraParecer = escolhidos.length ? escolhidos : ordenados.slice(0, TETO_PARECER);

  const { pareceres, observacoes, cortado } = await escreverPareceres(
    cred.apiKey, cred.model, dossie, briefing, paraParecer, texto, avisar, uso,
  );
  avisar({ tipo: 'fechando' });

  return {
    status: 200,
    body: {
      ...montarRelatorio({ dossie, briefing, notas, pareceres, observacoes, modelo: cred.model }),
      cortado,
      uso: { ...uso, segundos: Math.round((Date.now() - comecou) / 100) / 10 },
    },
  };
}

/** A resposta do modelo conferida contra o dossiê: o nome e a foto vêm da base,
 *  e quem só passou pela triagem entra depois de quem teve parecer - a nota da
 *  triagem é um palpite grosseiro, e misturar as duas leituras numa ordem só
 *  poria um palpite na frente de uma leitura. */
function montarRelatorio({ dossie, briefing, notas, pareceres, observacoes, modelo }: {
  dossie: Dossie;
  briefing: Briefing;
  notas: Map<string, number>;
  pareceres: Map<string, ParecerDaPessoa>;
  observacoes: string;
  modelo: string;
}) {
  // Os requisitos da vaga são a régua, e é a mesma para todo mundo: o checklist
  // de cada pessoa é montado a partir DESTA lista, e não do que o modelo
  // repetiu em cada linha. Assim ninguém aparece medido por uma régua própria,
  // e item que o modelo esqueceu vira "sem leitura" em vez de sumir.
  const SITUACOES = ['atende', 'parcial', 'nao'];
  const checklistDe = (bruto: { situacao: string; nota: string }[] | null) =>
    briefing.requisitos.map((requisito, i) => {
      const item = bruto?.[i] ?? null;
      return {
        requisito,
        situacao: item && SITUACOES.includes(item.situacao) ? item.situacao : 'sem',
        nota: item?.nota ?? '',
      };
    });

  const daPessoa = (p: PessoaDoDossie) => ({
    ref: p.ref, tipo: p.tipo, id: p.id, nome: p.nome, foto_url: p.foto_url,
  });

  const comParecer = [...pareceres.values()]
    .map(x => {
      const p = dossie.pessoas.get(x.ref)!;
      return {
        ...daPessoa(p),
        aderencia: x.aderencia,
        veredito: x.veredito,
        justificativa: x.justificativa,
        checklist: checklistDe(x.checklist),
      };
    })
    .sort((a, b) => b.aderencia - a.aderencia);

  // Quem ficou na triagem aparece com a nota dela e sem checklist, marcado como
  // tal: sumir da lista faria parecer que a pessoa não está no banco, e mostrar
  // um checklist vazio faria parecer que ela foi lida e não atendeu nada.
  const soTriagem = [...dossie.pessoas.values()]
    .filter(p => !pareceres.has(p.ref))
    .map(p => ({
      ...daPessoa(p),
      aderencia: notas.get(p.ref) ?? null,
      veredito: 'fraco',
      justificativa: '',
      so_triagem: true,
      checklist: [] as ReturnType<typeof checklistDe>,
    }))
    .sort((a, b) => (b.aderencia ?? -1) - (a.aderencia ?? -1));

  return {
    vaga: {
      titulo: briefing.titulo,
      resumo: briefing.resumo,
      requisitos: briefing.requisitos,
      faltou: briefing.faltou,
    },
    ranking: [...comParecer, ...soTriagem],
    observacoes,
    modelo,
    analisado_em: new Date().toISOString(),
  };
}

/** Confere os anexos antes de qualquer chamada: tipo que o modelo não lê e
 *  arquivo grande demais viram frase aqui, e não erro da API lá. */
export function conferirAnexos(
  anexos: unknown,
): { ok: true; anexos: AnexoDaVaga[] } | { ok: false; error: string } {
  if (!Array.isArray(anexos)) return { ok: true, anexos: [] };
  if (anexos.length > MAX_ANEXOS) {
    return { ok: false, error: `São no máximo ${MAX_ANEXOS} anexos por análise.` };
  }
  const limpos: AnexoDaVaga[] = [];
  for (const a of anexos) {
    const tipo = String((a as any)?.tipo ?? '');
    const nome = String((a as any)?.nome ?? 'anexo');
    if (tipo !== TIPO_PDF && !TIPOS_DE_IMAGEM.includes(tipo)) {
      return { ok: false, error: `"${nome}" não é imagem nem PDF - a IA só lê esses dois.` };
    }
    const conteudo = String((a as any)?.base64 ?? '').split(',').pop() ?? '';
    if (!conteudo) return { ok: false, error: `"${nome}" chegou vazio.` };
    // Cada 4 letras de base64 são 3 bytes: dá para medir sem decodificar.
    if (conteudo.length * 0.75 > LIMITE_ANEXO) {
      return { ok: false, error: `"${nome}" passa de 5 MB.` };
    }
    limpos.push({ nome, tipo, base64: conteudo });
  }
  return { ok: true, anexos: limpos };
}
