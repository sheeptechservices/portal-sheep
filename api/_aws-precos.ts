// ─────────────────────────────────────────────────────────────────────────────
//  A tabela de preços da AWS, e o dólar para trazê-la a reais.
//
//  Custo de infraestrutura não é especialidade da casa, então a proposta não
//  chuta: a IA consulta a Price List Query API, que é a tabela oficial e
//  atualizada, e converte pela PTAX do Banco Central do dia.
//
//  A API da AWS exige assinatura SigV4 em toda chamada. Ela vai escrita aqui,
//  com o `crypto` do Node, em vez de trazer o SDK da AWS inteiro para três
//  chamadas. A credencial é de um usuário IAM só com `pricing:GetProducts`,
//  `pricing:GetAttributeValues` e `pricing:DescribeServices`: não custa nada e
//  não enxerga nada da conta além da tabela pública de preços.
// ─────────────────────────────────────────────────────────────────────────────
import { createHash, createHmac } from 'crypto';

export interface CredencialAws {
  accessKeyId: string;
  secretAccessKey: string;
}

// ── A assinatura ────────────────────────────────────────────────────────────

const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const hmac = (chave: Buffer | string, v: string) => createHmac('sha256', chave).update(v, 'utf8').digest();

/** Codifica um pedaço de caminho ou de consulta como a AWS pede: tudo que não é
 *  letra, número ou `-_.~` vira `%XX`, em maiúsculas. */
const codificar = (v: string) => encodeURIComponent(v)
  .replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Assina uma requisição com SigV4 e devolve os cabeçalhos a mandar.
 *
 * Genérica de propósito - método, caminho, consulta e corpo quaisquer -, para
 * poder ser conferida contra o conjunto de testes oficial da AWS, e não só
 * contra a chamada que a proposta faz.
 */
export function assinarSigV4(p: {
  cred: CredencialAws;
  regiao: string;
  servico: string;
  metodo: string;
  host: string;
  caminho?: string;
  consulta?: Record<string, string>;
  cabecalhos?: Record<string, string>;
  corpo?: string;
  /** Só para teste: a hora da assinatura. Em uso é agora. */
  quando?: Date;
}): Record<string, string> {
  const quando = p.quando ?? new Date();
  const amzDate = quando.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dia = amzDate.slice(0, 8);
  const corpo = p.corpo ?? '';

  const cabecalhos: Record<string, string> = {
    ...(p.cabecalhos ?? {}),
    host: p.host,
    'x-amz-date': amzDate,
  };
  const nomes = Object.keys(cabecalhos).map(n => n.toLowerCase()).sort();
  const porNome = Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), v]));
  const canonicos = nomes.map(n => `${n}:${String(porNome[n]).trim().replace(/\s+/g, ' ')}\n`).join('');
  const assinados = nomes.join(';');

  const consulta = Object.entries(p.consulta ?? {})
    .map(([k, v]) => [codificar(k), codificar(v)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  const pedidoCanonico = [
    p.metodo.toUpperCase(),
    p.caminho ?? '/',
    consulta,
    canonicos,
    assinados,
    sha256(corpo),
  ].join('\n');

  const escopo = `${dia}/${p.regiao}/${p.servico}/aws4_request`;
  const paraAssinar = ['AWS4-HMAC-SHA256', amzDate, escopo, sha256(pedidoCanonico)].join('\n');
  const chave = hmac(hmac(hmac(hmac(`AWS4${p.cred.secretAccessKey}`, dia), p.regiao), p.servico), 'aws4_request');
  const assinatura = createHmac('sha256', chave).update(paraAssinar, 'utf8').digest('hex');

  return {
    ...cabecalhos,
    Authorization: `AWS4-HMAC-SHA256 Credential=${p.cred.accessKeyId}/${escopo}, `
      + `SignedHeaders=${assinados}, Signature=${assinatura}`,
  };
}

// ── A Price List Query API ──────────────────────────────────────────────────

/** A API de preços só responde nestas regiões, e a tabela é a mesma em todas.
 *  A região do recurso consultado vai no filtro, e não aqui. */
const REGIAO_DA_API = 'us-east-1';
const HOST = `api.pricing.${REGIAO_DA_API}.amazonaws.com`;

async function chamar(cred: CredencialAws, operacao: string, carga: unknown)
  : Promise<{ ok: true; dados: any } | { ok: false; erro: string; status: number }> {
  const corpo = JSON.stringify(carga);
  const cabecalhos = assinarSigV4({
    cred, regiao: REGIAO_DA_API, servico: 'pricing', metodo: 'POST', host: HOST, corpo,
    cabecalhos: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': `AWSPriceListService.${operacao}`,
    },
  });
  let res: Response;
  try {
    res = await fetch(`https://${HOST}/`, { method: 'POST', headers: cabecalhos, body: corpo });
  } catch (e: any) {
    return { ok: false, status: 502, erro: e?.message || 'Sem conexão com a AWS.' };
  }
  const dados: any = await res.json().catch(() => null);
  if (res.ok) return { ok: true, dados };
  const tipo = String(dados?.__type ?? '').split('#').pop() ?? '';
  const detalhe = String(dados?.message ?? dados?.Message ?? `HTTP ${res.status}`);
  if (res.status === 403 || /UnrecognizedClient|InvalidSignature|AccessDenied/i.test(tipo)) {
    return {
      ok: false, status: 403,
      erro: /AccessDenied/i.test(tipo)
        ? 'A chave da AWS não tem permissão de ler a tabela de preços (pricing:GetProducts).'
        : 'A chave da AWS foi recusada. Confira o Access Key ID e a Secret.',
    };
  }
  return { ok: false, status: res.status, erro: `A AWS recusou a consulta: ${detalhe}` };
}

/** Confere a chave com a consulta mais barata que existe: a descrição de um
 *  serviço só. Não custa nada e não depende de filtro nenhum dar certo. */
export async function validarChaveAws(cred: CredencialAws): Promise<{ ok: boolean; error?: string }> {
  if (!cred.accessKeyId.trim() || !cred.secretAccessKey.trim()) {
    return { ok: false, error: 'Informe o Access Key ID e a Secret Access Key.' };
  }
  const r = await chamar(cred, 'DescribeServices', {
    ServiceCode: 'AmazonEC2', FormatVersion: 'aws_v1', MaxResults: 1,
  });
  return r.ok ? { ok: true } : { ok: false, error: r.erro };
}

/** Os atributos que dizem o que é o item. O resto da ficha da AWS (dezenas de
 *  campos por item) só gastaria contexto do modelo sem ajudar a escolher. */
const ATRIBUTOS_UTEIS = [
  'instanceType', 'vcpu', 'memory', 'storage', 'networkPerformance', 'operatingSystem',
  'databaseEngine', 'deploymentOption', 'instanceFamily', 'volumeApiName', 'volumeType',
  'storageClass', 'productFamily', 'group', 'groupDescription', 'usagetype', 'regionCode',
  'location', 'cacheEngine', 'transferType', 'fromLocation', 'toLocation', 'servicename',
];

export interface ItemDePreco {
  familia: string;
  atributos: Record<string, string>;
  /** Preço sob demanda, em dólar, por unidade. */
  precos: { usd: number; unidade: string; descricao: string; faixa?: string }[];
}

/**
 * Os itens da tabela que casam com os filtros, com o preço sob demanda.
 *
 * Cada filtro é igualdade exata (`TERM_MATCH`) sobre um atributo da AWS, como
 * `regionCode = sa-east-1` ou `instanceType = t4g.medium`. Reservas e planos
 * de economia ficam de fora: a proposta estima pelo preço de tabela, que é o
 * teto, e quem contratar pode descer dele.
 */
export async function consultarPrecosAws(cred: CredencialAws, p: {
  servico: string;
  filtros: { campo: string; valor: string }[];
  limite?: number;
}): Promise<{ ok: true; itens: ItemDePreco[]; haMais: boolean } | { ok: false; erro: string }> {
  const limite = Math.max(1, Math.min(20, Math.round(p.limite ?? 10)));
  const r = await chamar(cred, 'GetProducts', {
    ServiceCode: p.servico,
    FormatVersion: 'aws_v1',
    MaxResults: limite,
    Filters: p.filtros.map(f => ({ Type: 'TERM_MATCH', Field: f.campo, Value: f.valor })),
  });
  if (!r.ok) return { ok: false, erro: r.erro };

  const itens: ItemDePreco[] = [];
  for (const cru of Array.isArray(r.dados?.PriceList) ? r.dados.PriceList : []) {
    let item: any;
    try { item = typeof cru === 'string' ? JSON.parse(cru) : cru; } catch { continue; }
    const atributos: Record<string, string> = {};
    const todos = item?.product?.attributes ?? {};
    for (const a of ATRIBUTOS_UTEIS) if (todos[a] != null) atributos[a] = String(todos[a]);
    const precos: ItemDePreco['precos'] = [];
    for (const termo of Object.values<any>(item?.terms?.OnDemand ?? {})) {
      for (const d of Object.values<any>(termo?.priceDimensions ?? {})) {
        const usd = Number(d?.pricePerUnit?.USD);
        if (!Number.isFinite(usd)) continue;
        const faixa = d?.beginRange != null && (d.beginRange !== '0' || d.endRange !== 'Inf')
          ? `${d.beginRange} a ${d.endRange}` : undefined;
        precos.push({ usd, unidade: String(d?.unit ?? ''), descricao: String(d?.description ?? ''), faixa });
      }
    }
    if (!precos.length) continue;
    itens.push({ familia: String(item?.product?.productFamily ?? ''), atributos, precos });
  }
  return { ok: true, itens, haMais: !!r.dados?.NextToken };
}

/** Os valores que um atributo assume num serviço - os tipos de instância que
 *  existem, os motores de banco, as classes de armazenamento. É o que o modelo
 *  consulta antes de filtrar, para não chutar um nome que a tabela não tem. */
export async function valoresDeAtributoAws(cred: CredencialAws, servico: string, atributo: string)
  : Promise<{ ok: true; valores: string[] } | { ok: false; erro: string }> {
  const r = await chamar(cred, 'GetAttributeValues', {
    ServiceCode: servico, AttributeName: atributo, MaxResults: 100,
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  const valores = (Array.isArray(r.dados?.AttributeValues) ? r.dados.AttributeValues : [])
    .map((v: any) => String(v?.Value ?? '')).filter(Boolean);
  return { ok: true, valores };
}

// ── O dólar ─────────────────────────────────────────────────────────────────

/** Data no formato da API do Banco Central: MM-DD-AAAA. */
const dataBcb = (d: Date) =>
  `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${d.getFullYear()}`;

/**
 * A PTAX de venda mais recente, do Banco Central.
 *
 * Pede os últimos dez dias, e não só hoje: em fim de semana, feriado ou antes
 * do fechamento do dia não há cotação de hoje, e a última útil é a que vale.
 * Sem resposta, devolve nulo - a proposta segue, e a IA marca o câmbio como
 * "a confirmar" em vez de inventar um.
 */
export async function cotacaoDoDolar(): Promise<{ valor: number; data: string } | null> {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 10 * 24 * 3600 * 1000);
  const url = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/'
    + 'CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)'
    + `?@dataInicial='${dataBcb(inicio)}'&@dataFinalCotacao='${dataBcb(hoje)}'`
    + '&$format=json&$orderby=dataHoraCotacao%20desc&$top=1';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const dados: any = await res.json().catch(() => null);
    const c = dados?.value?.[0];
    const valor = Number(c?.cotacaoVenda);
    if (!Number.isFinite(valor) || valor <= 0) return null;
    return { valor, data: String(c?.dataHoraCotacao ?? '').slice(0, 10) };
  } catch {
    return null;
  }
}
