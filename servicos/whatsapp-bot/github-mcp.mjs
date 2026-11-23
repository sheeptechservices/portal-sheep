// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: os repositórios dos projetos no GitHub, só de
//  leitura.
//
//  "O que mudou no portal da 3SA essa semana?", "tem pull request aberto na
//  Orteconte?", "onde fica a tela de login no repositório do Click?". Os
//  repositórios de cada projeto vêm da ficha dele no portal (ver_projeto, campo
//  repositorios); daqui o bot lê o repositório: arquivos, código, commits e
//  pull requests. Nada aqui escreve no GitHub.
//
//  O acesso é um token do GitHub de granularidade fina, só de leitura e só nos
//  repositórios liberados nele (GITHUB_TOKEN_LEITURA). É o token que decide o
//  que o bot alcança: repositório fora dele responde "não encontrado". E só o
//  dono, no privado, tem estas ferramentas: código de cliente não circula em
//  grupo.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline';

const API = (process.env.GITHUB_API ?? 'https://api.github.com').replace(/\/+$/, '');
const TOKEN = process.env.GITHUB_TOKEN_LEITURA ?? '';

/** Teto de cada resposta: o Claude Code corta o que passa, e o corte levaria
 *  junto o fim. */
const TETO = 24_000;
/** O pedaço de um arquivo que cabe numa leitura. */
const TETO_ARQUIVO = 20_000;

const repoParam = { type: 'string', description: 'O repositório: o endereço que está na ficha do projeto (https://github.com/dono/nome) ou dono/nome.' };

const FERRAMENTAS = [
  {
    name: 'github_repositorio',
    title: 'Ver repositório',
    description: 'Como está um repositório: descrição, branch padrão, linguagens, branches, quando mudou pela última vez e quantos pull requests estão abertos.',
    inputSchema: { type: 'object', properties: { repo: repoParam }, required: ['repo'] },
  },
  {
    name: 'github_arquivos',
    title: 'Listar arquivos',
    description: 'O que há numa pasta do repositório (a raiz, sem caminho): pastas e arquivos, com o tamanho.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoParam,
        caminho: { type: 'string', description: 'A pasta, como src/admin. Vazio é a raiz.' },
        ref: { type: 'string', description: 'Branch, tag ou commit. Vazio é a branch padrão.' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'github_ler_arquivo',
    title: 'Ler arquivo',
    description: 'O conteúdo de um arquivo de texto do repositório, com o número das linhas. Arquivo grande vem em partes: use de_linha para continuar.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoParam,
        caminho: { type: 'string', description: 'O arquivo, como src/admin/Login.tsx.' },
        ref: { type: 'string', description: 'Branch, tag ou commit. Vazio é a branch padrão.' },
        de_linha: { type: 'integer', minimum: 1, description: 'A linha de onde começar. Padrão 1.' },
      },
      required: ['repo', 'caminho'],
    },
  },
  {
    name: 'github_buscar',
    title: 'Buscar no código',
    description: 'Os arquivos do repositório em que um termo aparece (nome de função, texto da tela, rota). A busca do GitHub olha a branch padrão.',
    inputSchema: {
      type: 'object',
      properties: { repo: repoParam, termo: { type: 'string', description: 'O que procurar.' } },
      required: ['repo', 'termo'],
    },
  },
  {
    name: 'github_commits',
    title: 'Listar commits',
    description: 'Os commits, do mais novo para o mais antigo: mensagem, autor e quando (horário de Brasília). Filtra por período, autor, arquivo ou branch.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoParam,
        desde: { type: 'string', description: 'A partir desta data, AAAA-MM-DD.' },
        ate: { type: 'string', description: 'Até esta data, AAAA-MM-DD, inclusive.' },
        autor: { type: 'string', description: 'Login do GitHub ou e-mail de quem fez.' },
        caminho: { type: 'string', description: 'Só os que mexeram neste arquivo ou pasta.' },
        ref: { type: 'string', description: 'Branch. Vazio é a branch padrão.' },
        limite: { type: 'integer', minimum: 1, maximum: 100, description: 'Quantos trazer. Padrão 20.' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'github_ver_commit',
    title: 'Ver commit',
    description: 'Um commit por inteiro: a mensagem, quem fez, quando, e o que mudou em cada arquivo (as linhas trocadas, encurtadas quando são muitas).',
    inputSchema: {
      type: 'object',
      properties: { repo: repoParam, sha: { type: 'string', description: 'O código do commit (os 7 primeiros caracteres bastam).' } },
      required: ['repo', 'sha'],
    },
  },
  {
    name: 'github_pull_requests',
    title: 'Listar pull requests',
    description: 'Os pull requests: número, título, quem abriu, de qual branch para qual, se é rascunho e quando mudou.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: repoParam,
        estado: { type: 'string', enum: ['abertos', 'fechados', 'todos'], description: 'Padrão: abertos.' },
        limite: { type: 'integer', minimum: 1, maximum: 50, description: 'Quantos trazer. Padrão 20.' },
      },
      required: ['repo'],
    },
  },
  {
    name: 'github_ver_pull_request',
    title: 'Ver pull request',
    description: 'Um pull request por inteiro: a descrição, o estado (aberto, juntado, fechado), as revisões e os arquivos que ele muda.',
    inputSchema: {
      type: 'object',
      properties: { repo: repoParam, numero: { type: 'integer', minimum: 1, description: 'O número do pull request.' } },
      required: ['repo', 'numero'],
    },
  },
];

// ── O GitHub ────────────────────────────────────────────────────────────────

/** Dono e nome a partir do endereço da ficha (com /tree/..., .git, barra no
 *  fim) ou de "dono/nome". */
export function repoDe(texto) {
  const t = String(texto ?? '').trim();
  const m = /github\.com[/:]([^/\s]+)\/([^/\s#?]+)/i.exec(t) ?? /^([\w.-]+)\/([\w.-]+)$/.exec(t);
  if (!m) throw new Error(`"${t}" não parece um repositório do GitHub: use o endereço da ficha do projeto ou dono/nome`);
  return { dono: m[1], nome: m[2].replace(/\.git$/i, '') };
}

/** Os acentos soltos depois do NFD, montados por código para o caractere não
 *  aparecer no arquivo. */
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

const caminhoSeguro = (c) => String(c ?? '').trim().replace(/^\/+|\/+$/g, '').split('/').map(encodeURIComponent).join('/');

async function github(caminho, { aceitar = 'application/vnd.github+json' } = {}) {
  if (!TOKEN) throw new Error('o acesso ao GitHub não está configurado no bot (falta o token de leitura)');
  const r = await fetch(`${API}${caminho}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: aceitar,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'portal-sheep-bot',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (r.status === 404) throw new Error('não encontrado: o repositório, o arquivo ou o commit não existe, ou o token do bot não tem acesso a esse repositório');
  if (r.status === 401) throw new Error('o token do GitHub do bot foi recusado (expirou ou foi revogado)');
  if (r.status === 403 || r.status === 429) {
    const resto = r.headers.get('x-ratelimit-remaining');
    throw new Error(resto === '0' ? 'o limite de consultas ao GitHub acabou por agora; tente daqui a pouco' : 'o GitHub recusou o acesso a isso com o token do bot');
  }
  if (!r.ok) throw new Error(`o GitHub respondeu ${r.status}`);
  return r.json();
}

const emBrasilia = (iso) => (iso ? new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(iso)) : null);
const curto = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}... (${t.length - n} caracteres a mais)` : t; };
/** A data do pedido (AAAA-MM-DD) no começo ou no fim do dia em Brasília. */
const diaEmBrasilia = (d, fim) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ''))) throw new Error('data no formato AAAA-MM-DD');
  return new Date(`${d}T${fim ? '23:59:59' : '00:00:00'}-03:00`).toISOString();
};

/** A resposta com teto: lista grande perde o fim e avisa. */
function caber(obj, lista) {
  let saida = obj;
  while (lista && Array.isArray(saida[lista]) && saida[lista].length > 1 && JSON.stringify(saida).length > TETO) {
    saida = { ...saida, [lista]: saida[lista].slice(0, Math.floor(saida[lista].length * 0.7)), aviso: 'Lista encurtada para caber: peça com filtro ou limite menor.' };
  }
  return saida;
}

const EXECUTAR = {
  async github_repositorio(a) {
    const { dono, nome } = repoDe(a.repo);
    const base = `/repos/${dono}/${nome}`;
    const [r, linguagens, branches, prs] = await Promise.all([
      github(base),
      github(`${base}/languages`).catch(() => ({})),
      github(`${base}/branches?per_page=30`).catch(() => []),
      github(`${base}/pulls?state=open&per_page=50`).catch(() => []),
    ]);
    const total = Object.values(linguagens).reduce((s, n) => s + Number(n), 0) || 1;
    return {
      repositorio: r.full_name, descricao: r.description ?? null, privado: !!r.private, link: r.html_url,
      branch_padrao: r.default_branch, ultima_mudanca: emBrasilia(r.pushed_at),
      linguagens: Object.entries(linguagens).map(([l, n]) => `${l} ${Math.round(Number(n) * 100 / total)}%`),
      branches: (Array.isArray(branches) ? branches : []).map(b => b.name),
      pull_requests_abertos: Array.isArray(prs) ? prs.length : null,
    };
  },

  async github_arquivos(a) {
    const { dono, nome } = repoDe(a.repo);
    const ref = a.ref ? `?ref=${encodeURIComponent(a.ref)}` : '';
    const r = await github(`/repos/${dono}/${nome}/contents/${caminhoSeguro(a.caminho)}${ref}`);
    if (!Array.isArray(r)) return { aviso: 'Isso é um arquivo, não uma pasta: leia com github_ler_arquivo.', caminho: r.path };
    const itens = r.map(x => ({ tipo: x.type === 'dir' ? 'pasta' : x.type === 'file' ? 'arquivo' : x.type, caminho: x.path, ...(x.type === 'file' ? { tamanho: x.size } : {}) }))
      .sort((x, y) => (x.tipo === y.tipo ? x.caminho.localeCompare(y.caminho) : x.tipo === 'pasta' ? -1 : 1));
    return caber({ pasta: a.caminho || '(raiz)', itens }, 'itens');
  },

  async github_ler_arquivo(a) {
    const { dono, nome } = repoDe(a.repo);
    if (!String(a.caminho ?? '').trim()) throw new Error('diga o caminho do arquivo');
    const ref = a.ref ? `?ref=${encodeURIComponent(a.ref)}` : '';
    const r = await github(`/repos/${dono}/${nome}/contents/${caminhoSeguro(a.caminho)}${ref}`);
    if (Array.isArray(r)) return { aviso: 'Isso é uma pasta: liste com github_arquivos.', caminho: a.caminho };
    if (r.type !== 'file') throw new Error(`isso não é um arquivo (${r.type})`);
    if (!r.content || r.encoding !== 'base64') throw new Error('o arquivo é grande demais para ler por aqui (mais de 1 MB)');
    const bruto = Buffer.from(r.content, 'base64');
    if (bruto.includes(0)) throw new Error('é um arquivo binário (imagem, PDF, executável): não há texto para ler');
    const linhas = bruto.toString('utf8').split(/\r?\n/);
    const de = Math.max(1, Number(a.de_linha ?? 1) || 1);
    let texto = '';
    let ate = de - 1;
    for (let i = de - 1; i < linhas.length; i++) {
      const linha = `${i + 1}: ${linhas[i]}\n`;
      if (texto.length + linha.length > TETO_ARQUIVO && ate >= de) break;
      texto += linha;
      ate = i + 1;
    }
    return {
      arquivo: r.path, total_de_linhas: linhas.length, linhas: `${de} a ${ate}`,
      ...(ate < linhas.length ? { continua: `Há mais: chame de novo com de_linha ${ate + 1}.` } : {}),
      conteudo: texto,
    };
  },

  async github_buscar(a) {
    const { dono, nome } = repoDe(a.repo);
    const termo = String(a.termo ?? '').trim();
    if (termo.length < 2) throw new Error('diga o que procurar');
    const r = await github(`/search/code?per_page=30&q=${encodeURIComponent(`${termo} repo:${dono}/${nome}`)}`).catch(() => null);
    if (r && (r.total_count ?? 0) > 0) {
      return caber({ termo, onde: 'no conteúdo', total: r.total_count, arquivos: (r.items ?? []).map(x => x.path) }, 'arquivos');
    }
    // A busca no conteúdo do GitHub nem sempre alcança repositório privado de
    // organização (o índice dela é à parte e às vezes vazio). Sem nada por lá,
    // procura nos nomes e caminhos, pela árvore inteira, que sempre responde.
    const repo = await github(`/repos/${dono}/${nome}`);
    const arvore = await github(`/repos/${dono}/${nome}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`);
    const alvo = termo.normalize('NFD').replace(ACENTOS, '').toLowerCase();
    const achados = (arvore.tree ?? [])
      .filter(x => x.path.normalize('NFD').replace(ACENTOS, '').toLowerCase().includes(alvo))
      .map(x => (x.type === 'tree' ? `${x.path}/` : x.path));
    return caber({
      termo, onde: 'nos nomes dos arquivos e pastas', total: achados.length, arquivos: achados,
      aviso: 'A busca no conteúdo do código não achou nada (o índice do GitHub nem sempre cobre repositório privado). '
        + 'Isto é a busca pelo nome; para achar dentro do código, abra os arquivos prováveis com github_ler_arquivo.',
    }, 'arquivos');
  },

  async github_commits(a) {
    const { dono, nome } = repoDe(a.repo);
    const q = new URLSearchParams({ per_page: String(Math.min(100, Math.max(1, Number(a.limite ?? 20) || 20))) });
    if (a.desde) q.set('since', diaEmBrasilia(a.desde, false));
    if (a.ate) q.set('until', diaEmBrasilia(a.ate, true));
    if (a.autor) q.set('author', String(a.autor));
    if (a.caminho) q.set('path', String(a.caminho));
    if (a.ref) q.set('sha', String(a.ref));
    const r = await github(`/repos/${dono}/${nome}/commits?${q}`);
    return caber({
      repositorio: `${dono}/${nome}`, total: r.length,
      commits: r.map(c => ({
        sha: c.sha.slice(0, 7),
        mensagem: curto(c.commit?.message ?? '', 400),
        autor: c.commit?.author?.name ?? c.author?.login ?? null,
        quando: emBrasilia(c.commit?.author?.date),
      })),
    }, 'commits');
  },

  async github_ver_commit(a) {
    const { dono, nome } = repoDe(a.repo);
    const sha = String(a.sha ?? '').trim();
    if (!/^[0-9a-f]{4,40}$/i.test(sha)) throw new Error('o código do commit tem só letras de a a f e números');
    const c = await github(`/repos/${dono}/${nome}/commits/${sha}`);
    let orcamento = 16_000;
    const arquivos = (c.files ?? []).map(f => {
      const patch = f.patch ?? '';
      const parte = orcamento > 0 ? curto(patch, Math.min(3000, orcamento)) : '(diferença omitida para caber)';
      orcamento -= Math.min(patch.length, 3000);
      return { arquivo: f.filename, situacao: f.status, mais: f.additions, menos: f.deletions, diferenca: parte };
    });
    return caber({
      sha: c.sha.slice(0, 7), link: c.html_url,
      mensagem: curto(c.commit?.message ?? '', 2000),
      autor: c.commit?.author?.name ?? null, quando: emBrasilia(c.commit?.author?.date),
      total: { mais: c.stats?.additions ?? 0, menos: c.stats?.deletions ?? 0, arquivos: (c.files ?? []).length },
      arquivos,
    }, 'arquivos');
  },

  async github_pull_requests(a) {
    const { dono, nome } = repoDe(a.repo);
    const estado = { abertos: 'open', fechados: 'closed', todos: 'all' }[a.estado ?? 'abertos'] ?? 'open';
    const limite = Math.min(50, Math.max(1, Number(a.limite ?? 20) || 20));
    const r = await github(`/repos/${dono}/${nome}/pulls?state=${estado}&per_page=${limite}&sort=updated&direction=desc`);
    return caber({
      repositorio: `${dono}/${nome}`, total: r.length,
      pull_requests: r.map(p => ({
        numero: p.number, titulo: p.title, autor: p.user?.login ?? null,
        de: p.head?.ref, para: p.base?.ref, rascunho: !!p.draft,
        estado: p.merged_at ? 'juntado' : p.state === 'open' ? 'aberto' : 'fechado',
        atualizado: emBrasilia(p.updated_at), link: p.html_url,
      })),
    }, 'pull_requests');
  },

  async github_ver_pull_request(a) {
    const { dono, nome } = repoDe(a.repo);
    const n = Number(a.numero);
    if (!Number.isInteger(n) || n < 1) throw new Error('diga o número do pull request');
    const base = `/repos/${dono}/${nome}/pulls/${n}`;
    const [p, arquivos, revisoes] = await Promise.all([
      github(base),
      github(`${base}/files?per_page=100`).catch(() => []),
      github(`${base}/reviews?per_page=50`).catch(() => []),
    ]);
    return caber({
      numero: p.number, titulo: p.title, link: p.html_url, autor: p.user?.login ?? null,
      estado: p.merged_at ? 'juntado' : p.state === 'open' ? (p.draft ? 'rascunho' : 'aberto') : 'fechado',
      de: p.head?.ref, para: p.base?.ref,
      criado: emBrasilia(p.created_at), atualizado: emBrasilia(p.updated_at), juntado: emBrasilia(p.merged_at),
      descricao: curto(p.body ?? '', 4000),
      revisoes: (Array.isArray(revisoes) ? revisoes : []).map(r => ({ quem: r.user?.login ?? null, parecer: r.state, quando: emBrasilia(r.submitted_at) })),
      total: { mais: p.additions ?? 0, menos: p.deletions ?? 0, arquivos: p.changed_files ?? 0 },
      arquivos: (Array.isArray(arquivos) ? arquivos : []).map(f => ({ arquivo: f.filename, situacao: f.status, mais: f.additions, menos: f.deletions })),
    }, 'arquivos');
  },
};

// ── O protocolo ─────────────────────────────────────────────────────────────

const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'github', version: '1.0.0' },
    } });
  }
  if (id === undefined) return;
  if (method === 'ping') return enviar({ id, result: {} });
  if (method === 'tools/list') return enviar({ id, result: { tools: FERRAMENTAS } });
  if (method === 'tools/call') {
    const executar = EXECUTAR[params?.name];
    if (!executar) return enviar({ id, error: { code: -32602, message: `ferramenta desconhecida: ${params?.name}` } });
    try {
      const r = await executar(params.arguments ?? {});
      return enviar({ id, result: { content: [{ type: 'text', text: JSON.stringify(r) }] } });
    } catch (e) {
      return enviar({ id, result: { content: [{ type: 'text', text: `Não deu: ${e?.message ?? e}` }], isError: true } });
    }
  }
  return enviar({ id, error: { code: -32601, message: `método não suportado: ${method}` } });
}

// Importado só pelo repoDe nos testes; servidor de verdade só quando rodado direto.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  createInterface({ input: process.stdin }).on('line', (l) => {
    if (!l.trim()) return;
    let pedido;
    try { pedido = JSON.parse(l); } catch { return; }
    void tratar(pedido);
  });
}
