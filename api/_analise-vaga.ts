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
import { getAnthropicCredential } from './_credentials';

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

/** Texto longo da ficha entra cortado. Um resumo profissional tem meia página;
 *  o que passa disso é currículo colado inteiro, e a partir daí cada pessoa
 *  encareceria a análise das outras. */
const LIMITE_TEXTO_LONGO = 2000;

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
  tipo: 'interno' | 'externo';
  id: string;
  nome: string;
  foto_url: string | null;
}

export interface Dossie {
  texto: string;
  pessoas: Map<string, PessoaDoDossie>;
}

/** Monta o dossiê da casa inteira em texto. Texto, e não JSON: o modelo lê os
 *  dois, mas quem revisa o prompt lê um só. */
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
  for (const h of habilidades.rows) {
    const chave = `${h.tipo}:${h.pessoa_id}`;
    const nivel = h.nivel == null ? '?' : String(h.nivel);
    const tempo = h.tempo ? `, ${String(h.tempo)}` : '';
    habDe.set(chave, [...(habDe.get(chave) ?? []), `${String(h.nome)} (nível ${nivel}/5${tempo})`]);
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

  const pessoas = new Map<string, PessoaDoDossie>();
  const blocos: string[] = [];

  /** Uma linha de "Campo: valor | Campo: valor", pulando o que está em branco.
   *  Campo vazio impresso como "-" ensinaria o modelo a tratar ausência como
   *  resposta. */
  const linha = (pares: [string, unknown][]) =>
    pares.map(([r, v]) => [r, corte(v, 200)] as const)
      .filter(([, v]) => v !== '')
      .map(([r, v]) => `${r}: ${v}`)
      .join(' | ');

  const avaliacao = (chave: string) => {
    const a = notasDe.get(chave);
    if (!a?.quantas) return 'Avaliação da casa: ainda não avaliado';
    const media = Math.round((a.total / a.quantas) * 10) / 10;
    return `Avaliação da casa (1 a 10): ${a.texto.join(', ')} | Média ${String(media).replace('.', ',')}`;
  };

  for (const u of internos.rows) {
    const ref = `interno:${String(u.id)}`;
    pessoas.set(ref, {
      ref, tipo: 'interno', id: String(u.id), nome: String(u.nome),
      foto_url: u.foto_url != null ? String(u.foto_url) : null,
    });
    const hab = habDe.get(ref) ?? [];
    blocos.push([
      `### ${ref} - ${String(u.nome)} (JÁ É DO TIME)`,
      linha([['Papel na casa', u.papel], ['Na casa desde', String(u.criado_em ?? '').slice(0, 10)]]),
      hab.length ? `Habilidades declaradas: ${hab.join(', ')}` : 'Habilidades declaradas: nenhuma cadastrada',
      avaliacao(ref),
    ].filter(Boolean).join('\n'));
  }

  for (const t of externos.rows) {
    const ref = `externo:${String(t.id)}`;
    pessoas.set(ref, {
      ref, tipo: 'externo', id: String(t.id), nome: String(t.nome),
      foto_url: t.foto_url != null ? String(t.foto_url) : null,
    });
    const hab = habDe.get(ref) ?? [];
    const cnpj = t.possui_cnpj == null ? '' : (Number(t.possui_cnpj) === 1 ? 'sim' : 'não');
    blocos.push([
      `### ${ref} - ${String(t.nome)} (INTERESSADO, ainda não trabalha aqui)`,
      linha([
        ['Interesse', t.interesse], ['Vaga a que se candidatou', t.vaga],
        ['Senioridade', t.senioridade], ['Tempo de experiência', t.tempo_experiencia],
        ['Inglês', t.nivel_ingles], ['Outro idioma', t.outro_idioma],
      ]),
      linha([
        ['Onde mora', [t.cidade, t.uf].filter(Boolean).join('/')],
        ['Modelo de trabalho', t.modelo_trabalho], ['Contratação', t.contratacao],
        ['Tem CNPJ', cnpj], ['Regime', t.regime_fiscal],
        ['Origem', t.origem], ['Indicado por', t.indicado_por],
        ['Candidatura em', String(t.candidatura_em ?? t.criado_em ?? '').slice(0, 10)],
      ]),
      hab.length ? `Habilidades declaradas: ${hab.join(', ')}` : 'Habilidades declaradas: nenhuma cadastrada',
      avaliacao(ref),
      corte(t.resumo) ? `Resumo profissional (escrito pela pessoa): ${corte(t.resumo)}` : '',
      corte(t.case_sucesso) ? `Case que a pessoa contou: ${corte(t.case_sucesso)}` : '',
      corte(t.observacoes) ? `Observações internas da casa: ${corte(t.observacoes)}` : '',
    ].filter(Boolean).join('\n'));
  }

  const cabecalho = [
    `Pessoas no banco: ${pessoas.size} (${internos.rows.length} do time, ${externos.rows.length} interessados).`,
    `Competências avaliadas pela casa: ${comps.rows.map(c => String(c.nome)).join(', ')}.`,
    'Escalas: habilidade declarada vai de 1 a 5 e é autoavaliação; a avaliação da casa vai de 1 a 10 e foi dada por quem trabalha aqui.',
  ].join('\n');

  return { texto: `${cabecalho}\n\n${blocos.join('\n\n')}`, pessoas };
}

// ── O que se pede ao modelo ──────────────────────────────────────────────────

const INSTRUCOES = `Você é o recrutador técnico da Sheep Technology, uma empresa de tecnologia brasileira. Recebe a descrição de uma vaga ou de uma demanda e o dossiê completo do banco de talentos da casa, e devolve a lista de todas as pessoas do dossiê, da que mais se encaixa à que menos se encaixa.

Como avaliar:
- Leia a vaga inteira antes de olhar as pessoas. Se ela vier em anexo (PDF ou print), o anexo é a fonte principal e o texto digitado é o complemento.
- Pese o que a vaga de fato pede: as habilidades, mas também senioridade, autonomia, tempo em problema parecido, idioma, modelo de trabalho e forma de contratação, quando a vaga falar disso.
- Habilidade declarada é autoavaliação e vale menos do que evidência: o case contado, o tempo de uso e a avaliação da casa valem mais.
- Quem já é do time entra na lista como todo mundo, mas diga na justificativa que tirá-lo de onde está tem custo.
- Ausência de dado não é nota baixa nem nota alta: é ausência, e você diz isso.
- Nunca invente formação, empresa, certificação ou habilidade que não esteja no dossiê. Se a base não tem ninguém adequado, diga isso em "observacoes" e ainda assim ordene quem existe.
- Não considere nem infira idade, sexo, aparência, estado civil, religião ou origem: nada disso decide encaixe, e nada disso está no dossiê.

Quanto escrever, que é o que decide o tempo da resposta:
- O checklist é obrigatório para TODAS as pessoas, com um item por requisito. É por ele que se compara gente, e uma lista que existe só para os primeiros não compara nada.
- As DEZ primeiras pessoas levam justificativa de até duas frases. Da décima primeira em diante, uma frase curta e só - quem já ficou para trás não precisa de parecer, e cada palavra ali é mais espera para quem pediu.
- A nota de cada item do checklist tem no máximo oito palavras, sempre.

Como escrever:
- Português do Brasil, direto, sem floreio e sem linguagem de anúncio.
- Nunca use travessão longo nem travessão médio. Onde eles caberiam, use hífen cercado de espaços.
- A justificativa de cada pessoa tem no máximo duas frases, e cita o que no dossiê sustenta a nota. "Tem React há 3 anos e o case dele é uma migração de front" vale; "perfil alinhado à vaga" não vale nada.
- Ponto forte e lacuna são frases curtas, de no máximo dez palavras.

A aderência vai de 0 a 100 e é a resposta à pergunta "quanto desta vaga esta pessoa cobre hoje". Use a régua toda: encaixe forte fica acima de 75, encaixe possível entre 45 e 75, e quem não tem nada a ver com a vaga fica abaixo de 25.`;

const FORMATO = `Responda com UM objeto JSON e nada mais: sem texto antes, sem texto depois, sem cerca de codigo. Esta e a forma exata, e todas as chaves sao obrigatorias:

{
  "titulo": "o cargo ou a demanda, em poucas palavras",
  "resumo": "de duas a quatro frases sobre o que a vaga precisa",
  "requisitos": ["um requisito por item, do mais ao menos decisivo"],
  "faltou": "o que a descricao nao disse e faria diferenca na escolha, ou string vazia",
  "ranking": [
    {
      "ref": "o identificador exato do dossie, como externo:abc123",
      "aderencia": 91,
      "veredito": "forte",
      "justificativa": "no maximo duas frases, apoiadas no dossie",
      "checklist": [
        { "situacao": "atende", "nota": "React ha 4 anos, nivel 5" },
        { "situacao": "nao", "nota": "Nao declarou TypeScript" }
      ]
    }
  ],
  "observacoes": "o recado final: se a base nao cobre a vaga, que perfil falta contratar, o que checar numa conversa"
}

"aderencia" e um numero inteiro de 0 a 100. "veredito" e uma destas tres palavras: "forte", "possivel", "fraco". "ranking" traz TODAS as pessoas do dossie, da maior aderencia a menor, e nenhuma pode ficar de fora.

O "checklist" e a parte mais importante da resposta, e obedece a tres regras sem excecao:
1. Ele tem UM item para CADA requisito de "requisitos", na mesma ordem em que voce os escreveu ali. Se sao seis requisitos, sao seis itens - para todas as pessoas, inclusive as que nao se encaixam.
2. "situacao" e uma destas tres palavras: "atende" (o dossie mostra que sim), "parcial" (chega perto, ou o dossie so sugere) e "nao" (o dossie nao mostra, ou mostra o contrario). Ausencia de dado e "nao", e a nota diz que e ausencia.
3. "nota" explica aquele item naquela pessoa em no maximo oito palavras, apoiada no dossie: "React ha 4 anos, nivel 5" vale; "atende ao requisito" nao vale nada.`;

// ── A chamada, em fluxo ──────────────────────────────────────────────────────
//
//  A resposta vem em fluxo (`stream: true`) por causa da tela, e não da API: uma
//  ida de um minuto sem notícia nenhuma parece travada, e o que se pode contar
//  durante ela - quantas pessoas já foram avaliadas, e quais - é justamente o
//  que a pessoa quer saber. O JSON da ferramenta chega em pedaços; a cada
//  pedaço, o que já dá para ler vira aviso.

/** O que a análise conta enquanto acontece. */
export type EventoDaAnalise =
  /** O dossiê ficou pronto: são estas as pessoas que entram na comparação. */
  | { tipo: 'dossie'; total: number }
  /** O modelo abriu o bloco de raciocínio: ele está lendo e pesando, e ainda não
   *  escreveu letra nenhuma da resposta. É o trecho mais longo da espera - meio
   *  minuto, medido -, e sem este aviso ele passa em silêncio. */
  | { tipo: 'pensando' }
  /** O modelo terminou de escrever o que entendeu da vaga. */
  | { tipo: 'vaga'; titulo: string }
  /** Mais uma pessoa avaliada. */
  | { tipo: 'pessoa'; feitas: number; total: number; nome: string }
  /** Chegou mais texto, mas nenhuma pessoa fechou ainda. É o sinal de vida da
   *  parte em que o modelo escreve o que entendeu da vaga, que leva alguns
   *  segundos sem nada a contar. */
  | { tipo: 'escrevendo'; letras: number }
  /** O ranking acabou e o recado final está sendo escrito. */
  | { tipo: 'fechando' };

type Aviso = (e: EventoDaAnalise) => void;

interface Fluxo {
  ok: boolean;
  /** O JSON da ferramenta, inteiro, quando deu certo. */
  input?: any;
  /** A resposta bateu no teto e foi remendada: falta gente no fim da lista. */
  cortado?: boolean;
  status?: number;
  erro?: string;
  stopReason?: string;
}

/** Lê a resposta em fluxo, remontando o JSON da ferramenta e avisando o que dá
 *  para saber no meio do caminho. */
async function lerFluxo(res: Response, dossie: Dossie, avisar: Aviso): Promise<Fluxo> {
  const leitor = res.body?.getReader();
  if (!leitor) return { ok: false, status: 502, erro: 'A Anthropic respondeu sem corpo.' };
  const decodificador = new TextDecoder();

  let sobra = '';
  /** Tudo o que o modelo escreveu, inclusive o que vier antes ou depois do JSON. */
  let json = '';
  let stopReason: string | undefined;
  let contadas = 0;
  let tituloAvisado = false;
  /** O último sinal de vida. Um por segundo basta: ele existe para provar que a
   *  resposta está vindo, e não para medir nada. */
  let ultimoSinal = 0;

  /** O que já dá para ler no JSON parcial vira aviso. Rodar sobre o texto
   *  inteiro a cada pedaço é barato: são poucos milhares de letras, e evita a
   *  contabilidade frágil de casar um `ref` partido entre dois pedaços. */
  const olhar = () => {
    if (!tituloAvisado) {
      const t = /"titulo"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(json);
      if (t) { tituloAvisado = true; avisar({ tipo: 'vaga', titulo: t[1] }); }
    }
    const agora = Date.now();
    if (agora - ultimoSinal > 1000) {
      ultimoSinal = agora;
      avisar({ tipo: 'escrevendo', letras: json.length });
    }
    const refs = [...json.matchAll(/"ref"\s*:\s*"([^"]+)"/g)];
    for (let i = contadas; i < refs.length; i++) {
      const p = dossie.pessoas.get(refs[i][1]);
      avisar({
        tipo: 'pessoa',
        feitas: i + 1,
        total: dossie.pessoas.size,
        nome: p?.nome ?? refs[i][1],
      });
    }
    contadas = refs.length;
  };

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
      if (evento.type === 'content_block_start' && evento.content_block?.type === 'thinking') {
        avisar({ tipo: 'pensando' });
      }
      if (evento.type === 'content_block_delta' && evento.delta?.type === 'text_delta') {
        json += String(evento.delta.text ?? '');
        olhar();
      }
      if (evento.type === 'message_delta' && evento.delta?.stop_reason) {
        stopReason = String(evento.delta.stop_reason);
      }
      // Só o fim do bloco que traz a resposta conta como fechamento: o bloco de
      // raciocínio também termina, e anunciá-lo diria "escrevendo o recado
      // final" quando nem a primeira pessoa tinha sido avaliada.
      if (evento.type === 'content_block_stop' && json.length > 0) avisar({ tipo: 'fechando' });
    }
  }

  const cru = recortarJson(json);
  if (!cru) return { ok: false, status: 502, erro: 'A Anthropic respondeu sem a análise.', stopReason };
  try {
    return { ok: true, input: JSON.parse(cru), stopReason };
  } catch {
    // JSON cortado no meio: aproveita-se o que chegou inteiro. A chamada já foi
    // paga e já custou um minuto de espera - devolver nada por causa da última
    // linha é jogar as duas coisas fora, e quem lê prefere trinta pessoas com um
    // aviso a uma tela de erro.
    const salvo = remendarJson(cru);
    if (salvo) return { ok: true, input: salvo, cortado: true, stopReason };
    return {
      ok: false,
      status: 502,
      erro: stopReason === 'max_tokens'
        ? 'A resposta bateu no teto de tamanho antes de dar para aproveitar nada. Tente de novo.'
        : 'A Anthropic respondeu, mas não no formato esperado. Tente de novo.',
      stopReason,
    };
  }
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
  // Percorre o texto guardando o que esta aberto, e anota o ultimo ponto em que
  // uma pessoa do ranking acabou de fechar - dentro de um array, dentro do
  // objeto de cima. Dali para tras esta tudo inteiro.
  const pilha: string[] = [];
  let emTexto = false;
  let escapado = false;
  let corte = -1;
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
        corte = i + 1;
        pilhaNoCorte = [...pilha];
      }
    }
  }
  if (corte < 0) return null;
  const remate = [...pilhaNoCorte].reverse().map(a => (a === '{' ? '}' : ']')).join('');
  try { return JSON.parse(json.slice(0, corte) + remate); } catch { return null; }
}

/** Abre a chamada, com uma segunda tentativa quando a recusa é de fila cheia.
 *  429 e 529 são "volte já"; 401 e 400 são "não adianta insistir". */
async function abrirChamada(apiKey: string, corpo: unknown): Promise<
  { ok: true; res: Response } | { ok: false; status: number; erro: string }
> {
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
    if ((res.status === 429 || res.status === 529) && tentativa === 0) {
      await new Promise(r => setTimeout(r, 2500));
      continue;
    }
    const detalhe = dados?.error?.message ? String(dados.error.message) : `HTTP ${res.status}`;
    const erro = res.status === 401 || res.status === 403
      ? 'A chave da Anthropic foi recusada. Confira em Configurações > Integrações.'
      : res.status === 429 || res.status === 529
        ? 'A Anthropic está sobrecarregada agora. Tente de novo em alguns instantes.'
        : `A Anthropic recusou a análise: ${detalhe}`;
    return { ok: false, status: 502, erro };
  }
  return { ok: false, status: 502, erro: 'A Anthropic não respondeu.' };
}

export interface PedidoDeAnalise {
  texto: string;
  anexos: AnexoDaVaga[];
}

/**
 * A análise inteira: monta o dossiê, manda para o modelo, acompanha o fluxo e
 * devolve o relatório já conferido contra a base.
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
  conteudo.push({
    type: 'text',
    text: [
      'A VAGA / DEMANDA:',
      texto.trim() || '(sem texto digitado - está tudo no anexo acima)',
      '',
      'O BANCO DE TALENTOS DA CASA:',
      dossie.texto,
      '',
      `Ordene as ${dossie.pessoas.size} pessoas acima, da que mais se encaixa à que menos se encaixa. Use o ref exato de cada uma, e responda só com o JSON.`,
    ].join('\n'),
  });

  const aberta = await abrirChamada(cred.apiKey, {
    model: cred.model,
    // Sem `tools` de proposito. Com a saida estruturada por ferramenta, o modelo
    // devolvia o input achatado - `{"vaga": "\n<parameter name=\"titulo\">..."` -,
    // e um schema aninhado que volta assim nao tem titulo, nem ranking, nem ref:
    // a analise inteira se perdia depois de dois minutos. JSON escrito como texto
    // e o caminho batido, e a resposta ja nasce aberta na chave de baixo, o que
    // tira do modelo a chance de comecar com "Claro, aqui esta".
    // Teto de saída, com folga de sobra: uma casa de trinta e três pessoas
    // gastou uns dez mil na medição, então 24 mil dá espaço para uma rodada
    // mais falante sem cortar nada. Não se paga pelo teto, e sim pelo que for
    // escrito - o tamanho de verdade quem governa é a instrução de encurtar a
    // cauda do ranking. Com 8000, que era o número antigo, a análise inteira se
    // perdia depois de quase dois minutos.
    max_tokens: 24000,
    system: `${INSTRUCOES}\n\n${FORMATO}`,
    // Sem pôr a chave de abertura na boca do modelo: este modelo recusa
    // conversa que termina com o assistente. O preço é ter de tolerar um "Claro,
    // aqui está" antes do JSON, e é o que `recortarJson` faz.
    messages: [{ role: 'user', content: conteudo }],
    stream: true,
  });
  if (!aberta.ok) return { status: aberta.status, body: { error: aberta.erro } };

  const fluxo = await lerFluxo(aberta.res, dossie, avisar);
  if (!fluxo.ok) return { status: fluxo.status ?? 502, body: { error: fluxo.erro } };

  return {
    status: 200,
    body: { ...montarRelatorio(fluxo.input, dossie, cred.model), cortado: !!fluxo.cortado },
  };
}

/** A resposta do modelo conferida contra o dossiê: ref que não existe sai, o
 *  nome e a foto vêm da base, e quem ficou de fora entra no fim sem nota
 *  inventada. */
function montarRelatorio(input: any, dossie: Dossie, modelo: string) {
  // Os requisitos da vaga são a régua, e é a mesma para todo mundo: o checklist
  // de cada pessoa é montado a partir DESTA lista, e não do que o modelo
  // repetiu em cada linha. Assim ninguém aparece medido por uma régua própria,
  // e item que o modelo esqueceu vira "sem leitura" em vez de sumir.
  const requisitos: string[] = (Array.isArray(input?.requisitos) ? input.requisitos : []).map(String);
  const SITUACOES = ['atende', 'parcial', 'nao'];
  const checklistDe = (bruto: any) => requisitos.map((requisito, i) => {
    const item = Array.isArray(bruto) ? bruto[i] : null;
    return {
      requisito,
      situacao: SITUACOES.includes(item?.situacao) ? String(item.situacao) : 'sem',
      nota: String(item?.nota ?? '').trim(),
    };
  });

  const vistos = new Set<string>();
  const bruto: any[] = Array.isArray(input?.ranking) ? input.ranking : [];
  const ranking = bruto
    .map(item => {
      const p = dossie.pessoas.get(String(item?.ref ?? ''));
      if (!p || vistos.has(p.ref)) return null;
      vistos.add(p.ref);
      const nota = Number(item?.aderencia);
      return {
        ref: p.ref,
        tipo: p.tipo,
        id: p.id,
        nome: p.nome,
        foto_url: p.foto_url,
        aderencia: Number.isFinite(nota) ? Math.max(0, Math.min(100, Math.round(nota))) : 0,
        veredito: ['forte', 'possivel', 'fraco'].includes(item?.veredito) ? item.veredito : 'possivel',
        justificativa: String(item?.justificativa ?? '').trim(),
        checklist: checklistDe(item?.checklist),
      };
    })
    .filter(Boolean) as any[];

  // Quem o modelo esqueceu entra no fim, sem nota inventada: sumir da lista
  // faria parecer que a pessoa não está no banco.
  const esquecidos = [...dossie.pessoas.values()]
    .filter(p => !vistos.has(p.ref))
    .map(p => ({
      ref: p.ref, tipo: p.tipo, id: p.id, nome: p.nome, foto_url: p.foto_url,
      aderencia: null, veredito: 'fraco', justificativa: 'A análise não chegou a esta pessoa.',
      checklist: checklistDe(null),
    }));

  // A tela recebe a leitura agrupada em `vaga`, mas o modelo escreve os campos
  // no primeiro nivel: o aninhamento no pedido foi justamente o que fez a
  // resposta voltar achatada e inutil.
  return {
    vaga: {
      titulo: String(input?.titulo ?? 'Vaga sem título'),
      resumo: String(input?.resumo ?? ''),
      requisitos: (Array.isArray(input?.requisitos) ? input.requisitos : []).map(String),
      faltou: String(input?.faltou ?? '').trim() || null,
    },
    ranking: [...ranking, ...esquecidos],
    observacoes: String(input?.observacoes ?? '').trim(),
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
