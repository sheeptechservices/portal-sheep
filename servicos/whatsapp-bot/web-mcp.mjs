// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: ler uma página da web.
//
//  O WebFetch do Claude Code sai da VPS, e há sites que a VPS não alcança (o
//  servidor deles não aceita conexão vinda do endereço dela) e sites montados
//  em JavaScript, que chegam como uma casca vazia. Aqui a página é lida direto
//  e, se a conexão falha ou o texto vem curto demais, por um leitor externo
//  (r.jina.ai), que abre o site de fora, monta o JavaScript e devolve o texto.
//
//  Só lê: não envia formulário, não guarda nada. O endereço tem de ser público
//  (http ou https, fora da rede interna), para a ferramenta não virar porta de
//  entrada para os serviços da própria VPS.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { createInterface } from 'node:readline';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const LEITOR = (process.env.LEITOR_WEB_URL ?? 'https://r.jina.ai/').replace(/\/*$/, '/');
const LEITOR_CHAVE = process.env.LEITOR_WEB_CHAVE ?? '';
const TEXTO_MAX = 40_000;
const BAIXAR_MAX = 3 * 1024 * 1024;
/** Abaixo disso o texto direto não é a página: é a casca de um site em
 *  JavaScript, ou uma tela de bloqueio. */
const TEXTO_MIN = 400;
const NAVEGADOR = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
/** O conversor de imagem: busca de fora (alcança o site que a VPS não
 *  alcança), passa SVG e qualquer formato para PNG, corta a borda vazia e
 *  limita o tamanho. */
const CONVERSOR = (process.env.CONVERSOR_IMAGEM_URL ?? 'https://wsrv.nl/').replace(/\/*$/, '/');
const MIDIA_DIR = process.env.MIDIA_DIR ?? '/app/trabalho/midia';
/** O teto da logo no portal. */
const LOGO_MAX = 700 * 1024;

const FERRAMENTAS = [
  {
    name: 'ler_pagina',
    title: 'Ler uma página da web',
    description: 'Lê o texto de uma página (um link que a pessoa mandou, o site de uma empresa). Abre direto e, '
      + 'quando o site não responde à VPS ou é montado em JavaScript, lê por um leitor externo, que abre de fora. '
      + 'Devolve o título, o texto e por onde leu. Use esta antes de dizer que não conseguiu abrir um link.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'O endereço da página, com ou sem https://.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'baixar_logo',
    title: 'Baixar a logo de uma empresa',
    description: 'Baixa a imagem de uma logo pelo endereço dela (PNG, JPG, WEBP, SVG, de um site), converte '
      + 'em PNG com a borda vazia cortada e grava na pasta de mídias. Devolve o caminho, para conferir com '
      + 'Read e depois anexar ao cliente com anexar_logo_do_cliente. O endereço vem de ler_pagina (a imagem '
      + 'do cabeçalho do site oficial, a og:image ou o ícone).',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'O endereço da imagem da logo.' },
      },
      required: ['url'],
    },
  },
];

// ── O endereço ──────────────────────────────────────────────────────────────

function ipInterno(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return ipInterno(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/** O endereço normalizado, ou o erro: só http(s), só fora da rede interna. */
async function enderecoPublico(cru) {
  let texto = String(cru ?? '').trim();
  if (!texto) throw new Error('diga o endereço da página');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(texto)) texto = `https://${texto}`;
  let u;
  try { u = new URL(texto); } catch { throw new Error(`endereço inválido: ${cru}`); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('só leio páginas http ou https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !isIP(host)) throw new Error('esse endereço não é de um site público');
  const ips = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map(x => x.address);
  if (ips.some(ipInterno)) throw new Error('esse endereço é da rede interna, e não leio');
  return { url: u.href, resolveu: ips.length > 0 };
}

// ── A leitura direta ────────────────────────────────────────────────────────

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodificar = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m);

/** O texto legível de um HTML: sem script, estilo e menu de código, com uma
 *  quebra de linha onde o bloco termina. O JSON-LD fica, porque muitas vezes é
 *  ali que o site diz quem é a empresa. */
function htmlParaTexto(html) {
  const titulo = decodificar(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '');
  const descricao = decodificar(html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1] ?? '');
  const ld = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim());
  const corpo = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article|\/header|\/footer)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  const texto = decodificar(corpo).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  return { titulo, texto: [descricao, texto, ...ld.map(j => `Dados estruturados da página: ${j}`)].filter(Boolean).join('\n\n') };
}

async function lerDireto(url) {
  const r = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': NAVEGADOR, Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5', 'Accept-Language': 'pt-BR,pt;q=0.9' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
  // Um redirecionamento para a rede interna também não vale.
  await enderecoPublico(r.url || url);
  const tipo = String(r.headers.get('content-type') ?? '');
  if (/pdf|image\/|audio\/|video\/|octet-stream|zip/.test(tipo)) throw new Error(`não é uma página de texto (${tipo.split(';')[0]})`);
  const bruto = Buffer.from(await r.arrayBuffer());
  const html = bruto.subarray(0, BAIXAR_MAX).toString('utf8');
  return /html|xml/.test(tipo) || /^\s*</.test(html) ? htmlParaTexto(html) : { titulo: '', texto: html.trim() };
}

// ── O leitor externo ────────────────────────────────────────────────────────

async function lerPeloLeitor(url) {
  const r = await fetch(LEITOR + url, {
    headers: { Accept: 'text/plain', 'X-Return-Format': 'markdown', ...(LEITOR_CHAVE ? { Authorization: `Bearer ${LEITOR_CHAVE}` } : {}) },
    signal: AbortSignal.timeout(45_000),
  });
  const corpo = await r.text();
  if (!r.ok) throw new Error(`o leitor externo respondeu ${r.status}: ${corpo.slice(0, 160)}`);
  const titulo = corpo.match(/^Title:\s*(.*)$/m)?.[1]?.trim() ?? '';
  const texto = corpo.includes('Markdown Content:') ? corpo.split('Markdown Content:').slice(1).join('Markdown Content:').trim() : corpo.trim();
  return { titulo, texto };
}

const motivo = (e) => {
  const c = e?.cause?.code ?? e?.code;
  if (c === 'UND_ERR_CONNECT_TIMEOUT' || e?.name === 'TimeoutError') return 'o site não respondeu a tempo';
  if (c === 'ECONNREFUSED') return 'o site recusou a conexão';
  if (c === 'ENOTFOUND') return 'o endereço não existe';
  return e?.message ?? String(e);
};

async function lerPagina(a) {
  const { url, resolveu } = await enderecoPublico(a.url);
  let direto = null;
  let falhaDireta = resolveu ? null : 'o endereço não existe';
  if (resolveu) {
    try { direto = await lerDireto(url); } catch (e) { falhaDireta = motivo(e); }
  }
  let r = direto;
  let via = 'direto';
  if (!direto || direto.texto.length < TEXTO_MIN) {
    try {
      const externo = await lerPeloLeitor(url);
      if (externo.texto.length > (direto?.texto.length ?? 0)) { r = externo; via = 'leitor externo'; }
    } catch (e) {
      if (!direto) throw new Error(`não abri a página: direto, ${falhaDireta}; pelo leitor externo, ${motivo(e)}`);
    }
  }
  const cortado = r.texto.length > TEXTO_MAX;
  return {
    url,
    titulo: r.titulo || null,
    via,
    ...(via === 'leitor externo' && falhaDireta ? { aviso: `direto não abriu (${falhaDireta}); lido de fora` } : {}),
    texto: cortado ? `${r.texto.slice(0, TEXTO_MAX)}\n[o resto da página foi cortado]` : r.texto,
  };
}

// ── A logo ──────────────────────────────────────────────────────────────────

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function pedirAoConversor(url, extra) {
  const r = await fetch(`${CONVERSOR}?url=${encodeURIComponent(url)}&output=png&fit=inside&we&trim=8${extra}`, {
    headers: { 'User-Agent': NAVEGADOR }, signal: AbortSignal.timeout(40_000),
  });
  if (!r.ok) throw new Error(`o conversor respondeu ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (!bytes.subarray(0, 8).equals(PNG)) throw new Error('o endereço não é de uma imagem');
  return bytes;
}

async function baixarLogo(a) {
  const { url } = await enderecoPublico(a.url);
  let bytes;
  try {
    bytes = await pedirAoConversor(url, '&w=800&h=400');
    // PNG cheio de detalhe pode passar do teto do portal: menor, ele cabe.
    if (bytes.length > LOGO_MAX) bytes = await pedirAoConversor(url, '&w=480&h=240');
  } catch (e) {
    throw new Error(`não baixei a logo: ${motivo(e)}`);
  }
  if (bytes.length > LOGO_MAX) throw new Error('a logo passou de 700 KB mesmo reduzida: procure outra versão');
  mkdirSync(MIDIA_DIR, { recursive: true });
  const caminho = join(MIDIA_DIR, `${Date.now()}-${randomBytes(4).toString('hex')}-logo.png`);
  writeFileSync(caminho, bytes, { mode: 0o600 });
  // Largura e altura do cabeçalho do PNG, para saber o formato da marca.
  const largura = bytes.readUInt32BE(16);
  const altura = bytes.readUInt32BE(20);
  return { caminho, origem: url, largura, altura, kb: Math.round(bytes.length / 1024) };
}

// ── O protocolo ─────────────────────────────────────────────────────────────

const EXECUTAR = { ler_pagina: lerPagina, baixar_logo: baixarLogo };
const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'web', version: '1.0.0' },
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

createInterface({ input: process.stdin }).on('line', (l) => {
  if (!l.trim()) return;
  let pedido;
  try { pedido = JSON.parse(l); } catch { return; }
  void tratar(pedido);
});
