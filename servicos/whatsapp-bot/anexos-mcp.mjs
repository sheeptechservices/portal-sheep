// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: anexa a um comentário do portal, ou a uma
//  entrega, um arquivo que chegou pelo WhatsApp.
//
//  O `comentar` do portal recebe o anexo em base64, e o modelo não tem como
//  produzir isso: ele vê a imagem, mas não tem os bytes dela. Esta ferramenta
//  recebe o caminho do arquivo na pasta de mídias, lê, converte e chama o
//  `comentar` do portal com o mesmo token do bot.
//
//  Só lê dentro da pasta de mídias: um caminho que aponte para fora é recusado,
//  então ela não vira uma porta para ler segredos. É ação de escrita, e o bot
//  só a libera na mensagem que confirma uma proposta, como as do portal.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, statSync } from 'node:fs';
import { resolve, basename, sep } from 'node:path';
import { createInterface } from 'node:readline';

const MIDIA_DIR = resolve(process.env.MIDIA_DIR ?? '/app/trabalho/midia');
const PORTAL_MCP_URL = process.env.PORTAL_MCP_URL ?? '';
const PORTAL_MCP_TOKEN = process.env.PORTAL_MCP_TOKEN ?? '';
/** O pedido ao portal passa por uma função da Vercel, que aceita até 4,5 MB de
 *  corpo; em base64 o arquivo cresce um terço. */
const ANEXO_MAX = 3 * 1024 * 1024;
const TIPOS = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const FERRAMENTA = {
  name: 'comentar_com_anexo',
  title: 'Comentar na tarefa com anexo',
  description: 'Escreve um comentário numa tarefa do portal anexando arquivos que chegaram pelo WhatsApp. '
    + 'Use o caminho do arquivo original indicado na mensagem (pasta de mídias). Até 3 MB por arquivo. '
    + 'Altera o portal: só rode depois da confirmação da pessoa.',
  inputSchema: {
    type: 'object',
    properties: {
      tarefa_id: { type: 'integer', description: 'Número da tarefa.' },
      texto: { type: 'string', description: 'Texto do comentário. Aceita a marcação leve do portal.' },
      responder_a: { type: 'integer', description: 'Id do comentário a responder, se for resposta.' },
      mencionar: { type: 'array', items: { type: 'string' }, description: 'Pessoas a marcar (id ou e-mail).' },
      arquivos: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            caminho: { type: 'string', description: 'Caminho do arquivo na pasta de mídias.' },
            nome: { type: 'string', description: 'Nome com que o anexo aparece. Padrão: o nome original.' },
          },
          required: ['caminho'],
        },
      },
    },
    required: ['tarefa_id', 'arquivos'],
  },
};

/** A mesma leitura do arquivo, para uma entrega: material dela ou evidência de
 *  uma etapa (o comprovante do envio, o aceite do cliente). */
const NA_ENTREGA = {
  name: 'anexar_arquivo_na_entrega',
  title: 'Anexar arquivo na entrega',
  description: 'Anexa numa entrega do portal arquivos que chegaram pelo WhatsApp. Use o caminho do arquivo '
    + 'original indicado na mensagem (pasta de mídias). tipo "arquivo" (padrão) é material da entrega; '
    + '"evidencia" é a prova de uma etapa: etapa "Entrega" (comprovante do que foi enviado) ou "Validação" '
    + '(aceite do cliente), que liberam marcar a entrega como Entregue ou Validada. Até 3 MB por arquivo. '
    + 'Altera o portal: só rode depois da confirmação da pessoa.',
  inputSchema: {
    type: 'object',
    properties: {
      entrega_id: { type: 'integer', description: 'Id da entrega (ver_projeto, secao entregas).' },
      tipo: { type: 'string', enum: ['arquivo', 'evidencia'] },
      etapa: { type: 'string', enum: ['Entrega', 'Validação'], description: 'Só para evidência. Padrão Entrega.' },
      comentario: { type: 'string', description: 'Só para evidência: o que o arquivo comprova.' },
      substituir: { type: 'boolean', description: 'Só para evidência: troca a prova anterior da etapa.' },
      arquivos: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          properties: {
            caminho: { type: 'string', description: 'Caminho do arquivo na pasta de mídias.' },
            nome: { type: 'string', description: 'Nome com que o anexo aparece. Padrão: o nome original.' },
          },
          required: ['caminho'],
        },
      },
    },
    required: ['entrega_id', 'arquivos'],
  },
};

/** O nome com que o arquivo chegou: o bot grava "<carimbo>-<sorteio>-<nome>". */
const nomeOriginal = (arq) => basename(arq).replace(/^\d+-[0-9a-f]{8}-/, '');

function lerAnexo({ caminho, nome }) {
  const arq = resolve(String(caminho ?? ''));
  if (!arq.startsWith(MIDIA_DIR + sep)) throw new Error(`o arquivo precisa estar na pasta de mídias (${MIDIA_DIR})`);
  let tam;
  try { tam = statSync(arq).size; } catch { throw new Error(`não achei o arquivo ${basename(arq)}: ele pode ter passado dos dois dias guardado`); }
  if (tam > ANEXO_MAX) {
    throw new Error(`${nomeOriginal(arq)} tem ${(tam / 1024 / 1024).toFixed(1)} MB, e o anexo pelo bot vai até 3 MB. Anexe direto pelo portal.`);
  }
  const final = String(nome ?? '').trim() || nomeOriginal(arq);
  const ext = final.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return { nome: final, tipo: TIPOS[ext] ?? 'application/octet-stream', base64: readFileSync(arq).toString('base64') };
}

/** Chama uma ferramenta do MCP do portal, que responde em JSON ou em SSE. */
async function chamarPortal(nome, argumentos) {
  const r = await fetch(PORTAL_MCP_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PORTAL_MCP_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: nome, arguments: argumentos } }),
    signal: AbortSignal.timeout(90_000),
  });
  const cru = await r.text();
  if (!r.ok) throw new Error(`o portal recusou (${r.status}): ${cru.slice(0, 200)}`);
  const json = r.headers.get('content-type')?.includes('text/event-stream')
    ? cru.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop()
    : cru;
  const resposta = JSON.parse(json ?? '{}');
  if (resposta.error) throw new Error(resposta.error.message ?? 'erro no portal');
  const texto = (resposta.result?.content ?? []).map(c => c.text).filter(Boolean).join('\n');
  if (resposta.result?.isError) throw new Error(texto || 'o portal não aceitou o comentário');
  return texto;
}

async function comentarComAnexo(a) {
  const anexos = (Array.isArray(a.arquivos) ? a.arquivos : []).map(lerAnexo);
  if (!anexos.length) throw new Error('faltou dizer qual arquivo anexar');
  const resultado = await chamarPortal('comentar', {
    tarefa_id: Number(a.tarefa_id),
    texto: String(a.texto ?? ''),
    ...(a.responder_a ? { responder_a: Number(a.responder_a) } : {}),
    ...(Array.isArray(a.mencionar) ? { mencionar: a.mencionar } : {}),
    anexos,
  });
  return `Comentário gravado na tarefa ${Number(a.tarefa_id)} com ${anexos.map(x => x.nome).join(', ')}. ${resultado}`.trim();
}

async function anexarNaEntrega(a) {
  const anexos = (Array.isArray(a.arquivos) ? a.arquivos : []).map(lerAnexo);
  if (!anexos.length) throw new Error('faltou dizer qual arquivo anexar');
  const evidencia = String(a.tipo ?? 'arquivo') === 'evidencia';
  const resultado = await chamarPortal('anexar_na_entrega', {
    entrega_id: Number(a.entrega_id),
    tipo: evidencia ? 'evidencia' : 'arquivo',
    ...(evidencia ? { etapa: a.etapa ?? 'Entrega', comentario: String(a.comentario ?? ''), substituir: a.substituir === true } : {}),
    anexos,
  });
  return `Anexado na entrega ${Number(a.entrega_id)}${evidencia ? ` como evidência da etapa ${a.etapa ?? 'Entrega'}` : ''}: ${anexos.map(x => x.nome).join(', ')}. ${resultado}`.trim();
}

/** A logo do cliente: a imagem que baixar_logo trouxe, ou a que a pessoa
 *  mandou pelo WhatsApp. Ela entra no carrossel de clientes do portal. */
const LOGO = {
  name: 'anexar_logo_do_cliente',
  title: 'Anexar a logo do cliente no portal',
  description: 'Grava (ou troca) a logo de um cliente no portal, que passa a aparecer no carrossel de clientes '
    + 'e nos seletores. Use o caminho que baixar_logo devolveu, ou o arquivo de imagem que a pessoa mandou '
    + '(pasta de mídias). PNG, WEBP ou JPEG, até 700 KB. Altera o portal: só rode depois da confirmação da pessoa.',
  inputSchema: {
    type: 'object',
    properties: {
      cliente: { type: 'string', description: 'O nome do cliente, ou um projeto dele.' },
      caminho: { type: 'string', description: 'Caminho da imagem na pasta de mídias.' },
    },
    required: ['cliente', 'caminho'],
  },
};

const IMAGENS = ['image/png', 'image/jpeg', 'image/webp'];

async function anexarLogo(a) {
  const arquivo = lerAnexo({ caminho: a.caminho });
  if (!IMAGENS.includes(arquivo.tipo)) throw new Error('a logo precisa ser PNG, WEBP ou JPEG: passe a imagem por baixar_logo, que converte');
  const resultado = await chamarPortal('definir_logo_do_cliente', { cliente: String(a.cliente ?? ''), imagem_base64: arquivo.base64 });
  return `Logo gravada. ${resultado}`.trim();
}

const FERRAMENTAS = { [FERRAMENTA.name]: comentarComAnexo, [NA_ENTREGA.name]: anexarNaEntrega, [LOGO.name]: anexarLogo };

// ── O protocolo ─────────────────────────────────────────────────────────────

const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);

async function tratar(pedido) {
  const { id, method, params } = pedido;
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'anexos', version: '1.0.0' },
    } });
  }
  if (id === undefined) return; // notificação: nada a responder
  if (method === 'ping') return enviar({ id, result: {} });
  if (method === 'tools/list') return enviar({ id, result: { tools: [FERRAMENTA, NA_ENTREGA, LOGO] } });
  if (method === 'tools/call') {
    const fazer = FERRAMENTAS[params?.name];
    if (!fazer) return enviar({ id, error: { code: -32602, message: `ferramenta desconhecida: ${params?.name}` } });
    try {
      const texto = await fazer(params.arguments ?? {});
      return enviar({ id, result: { content: [{ type: 'text', text: texto }] } });
    } catch (e) {
      return enviar({ id, result: { content: [{ type: 'text', text: `Não deu: ${e?.message ?? e}` }], isError: true } });
    }
  }
  return enviar({ id, error: { code: -32601, message: `método não suportado: ${method}` } });
}

createInterface({ input: process.stdin }).on('line', (linha) => {
  if (!linha.trim()) return;
  let pedido;
  try { pedido = JSON.parse(linha); } catch { return; }
  void tratar(pedido);
});
