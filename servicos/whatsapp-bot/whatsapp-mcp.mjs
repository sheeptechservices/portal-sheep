// ─────────────────────────────────────────────────────────────────────────────
//  Servidor MCP do próprio bot: os grupos do WhatsApp em que o número da casa
//  está.
//
//  É o que deixa pedir no privado "cria um chamado da última solicitação da
//  Vanda no grupo": o bot lista os grupos (com o projeto do portal vinculado a
//  cada um), lê as mensagens recentes do grupo e baixa um print ou arquivo que
//  alguém mandou lá.
//
//  Quase tudo aqui é leitura: listar, ler, baixar, ver quem está no grupo e
//  procurar um contato. As escritas são enviar_no_grupo e enviar_para_pessoa,
//  que mandam texto ou áudio (na voz do bot) num grupo ou no privado de alguém:
//  o bot só as libera na conversa privada com o número autorizado e na
//  mensagem que confirma a proposta, com o destino e o texto à vista.
//  Nada mais é escrito: não reage, não marca como lido. O histórico vem da
//  própria Evolution, que guarda as mensagens que o número recebe.
//
//  Fala MCP pela entrada e saída padrão: uma mensagem JSON-RPC por linha.
// ─────────────────────────────────────────────────────────────────────────────
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { docxParaTexto, xlsxParaTexto } from './documentos.mjs';
import { digitos, pessoasDoGrupo, planoDeEnvio } from './mensagem-grupo.mjs';
import { falar, paraFala } from './voz.mjs';
import { transcrever, AUDIO_MAX_SEGUNDOS } from './transcricao.mjs';

const EVOLUTION_URL = (process.env.EVOLUTION_URL ?? '').replace(/\/+$/, '');
const INSTANCIA = encodeURIComponent(process.env.EVOLUTION_INSTANCIA ?? '');
const CHAVE = process.env.EVOLUTION_APIKEY ?? '';
const PORTAL_MCP_URL = process.env.PORTAL_MCP_URL ?? '';
const PORTAL_MCP_TOKEN = process.env.PORTAL_MCP_TOKEN ?? '';
const MIDIA_DIR = resolve(process.env.MIDIA_DIR ?? '/app/trabalho/midia');
const MIDIA_MAX = 20 * 1024 * 1024;

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const FERRAMENTAS = [
  {
    name: 'listar_grupos',
    title: 'Listar grupos do WhatsApp',
    description: 'Os grupos do WhatsApp em que o número da casa está, do mais recente para o mais antigo, '
      + 'com o projeto do portal vinculado a cada um (quando houver vínculo). Sem vínculo, o nome do grupo '
      + 'costuma dizer o cliente.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ler_grupo',
    title: 'Ler mensagens de um grupo',
    description: 'As mensagens mais recentes de um grupo, da mais antiga para a mais nova, com quem mandou, '
      + 'quando (horário de Brasília) e o texto. Imagem, áudio e documento aparecem marcados, com o id para '
      + 'baixar_midia_do_grupo.',
    inputSchema: {
      type: 'object',
      properties: {
        grupo: { type: 'string', description: 'Id do grupo (de listar_grupos) ou parte do nome.' },
        limite: { type: 'integer', minimum: 1, maximum: 200, description: 'Quantas mensagens trazer. Padrão 40.' },
        pessoa: { type: 'string', description: 'Só as mensagens de quem tem este nome (parte dele basta).' },
      },
      required: ['grupo'],
    },
  },
  {
    name: 'baixar_midia_do_grupo',
    title: 'Baixar arquivo ou ouvir áudio de um grupo',
    description: 'Baixa a imagem, o PDF, o Word ou o Excel de uma mensagem do grupo (id de ler_grupo) para a '
      + 'pasta de mídias, e devolve o caminho para ler com Read e o do original, para anexar com comentar_com_anexo. '
      + 'Num áudio, devolve a transcrição automática em transcricao (pode ter palavra trocada).',
    inputSchema: {
      type: 'object',
      properties: {
        grupo: { type: 'string', description: 'Id do grupo ou parte do nome.' },
        mensagem_id: { type: 'string', description: 'O id da mensagem, de ler_grupo.' },
      },
      required: ['grupo', 'mensagem_id'],
    },
  },
  {
    name: 'participantes_do_grupo',
    title: 'Quem está num grupo',
    description: 'Os participantes de um grupo, com o número e o nome que aparece nas mensagens (quem nunca '
      + 'escreveu no grupo vem sem nome). Use para achar o número de quem vai ser marcado em enviar_no_grupo.',
    inputSchema: {
      type: 'object',
      properties: { grupo: { type: 'string', description: 'Id do grupo ou parte do nome.' } },
      required: ['grupo'],
    },
  },
  {
    name: 'enviar_no_grupo',
    title: 'Enviar mensagem num grupo',
    description: 'Manda uma mensagem num grupo, com o número da casa: texto, marcando quem estiver em mencionar, '
      + 'ou áudio (em_audio), na voz do bot. Para marcar, ponha no texto @ seguido do número da pessoa (o mesmo de '
      + 'mencionar); número que faltar no texto entra no fim. Áudio não marca ninguém. Escreve para fora e não se '
      + 'desfaz: só rode depois da confirmação.',
    inputSchema: {
      type: 'object',
      properties: {
        grupo: { type: 'string', description: 'O id do grupo (termina em @g.us), de listar_grupos.' },
        texto: { type: 'string', description: 'O texto exato, como vai aparecer no grupo; no áudio, o que vai ser falado.' },
        mencionar: { type: 'array', items: { type: 'string' }, description: 'Os números de quem marcar, com DDI e DDD (de participantes_do_grupo). Só no texto.' },
        em_audio: { type: 'boolean', description: 'Manda como mensagem de voz em vez de texto.' },
      },
      required: ['grupo', 'texto'],
    },
  },
  {
    name: 'procurar_contato',
    title: 'Procurar contato',
    description: 'Procura pelo nome, entre os contatos do número da casa, o número de WhatsApp de uma pessoa, '
      + 'para mandar no privado dela com enviar_para_pessoa.',
    inputSchema: {
      type: 'object',
      properties: { nome: { type: 'string', description: 'O nome, ou parte dele.' } },
      required: ['nome'],
    },
  },
  {
    name: 'enviar_para_pessoa',
    title: 'Enviar mensagem no privado de alguém',
    description: 'Manda uma mensagem no privado de uma pessoa, com o número da casa: texto, ou áudio (em_audio) na '
      + 'voz do bot. O número vem de procurar_contato ou de participantes_do_grupo. Escreve para fora e não se '
      + 'desfaz: só rode depois da confirmação.',
    inputSchema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'O número com DDI e DDD, como 5531999990000.' },
        texto: { type: 'string', description: 'O texto exato da mensagem; no áudio, o que vai ser falado.' },
        em_audio: { type: 'boolean', description: 'Manda como mensagem de voz em vez de texto.' },
      },
      required: ['numero', 'texto'],
    },
  },
];

// ── Evolution e portal ──────────────────────────────────────────────────────

async function evolution(metodo, caminho, corpo) {
  const r = await fetch(`${EVOLUTION_URL}${caminho}`, {
    method: metodo,
    headers: { apikey: CHAVE, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`a Evolution recusou (${r.status})`);
  return r.json();
}

/** Os projetos do portal com o grupo vinculado. Falhar aqui não impede de
 *  listar os grupos: só fica sem o vínculo. */
async function vinculos() {
  try {
    const r = await fetch(PORTAL_MCP_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${PORTAL_MCP_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'listar_projetos', arguments: {} } }),
      signal: AbortSignal.timeout(30_000),
    });
    const cru = await r.text();
    const json = r.headers.get('content-type')?.includes('text/event-stream')
      ? cru.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean).pop()
      : cru;
    const texto = JSON.parse(json ?? '{}').result?.content?.find(c => c.type === 'text')?.text ?? '{}';
    const projetos = JSON.parse(texto).projetos ?? [];
    const mapa = new Map();
    for (const p of projetos) {
      if (p.whatsapp?.grupo_id) mapa.set(p.whatsapp.grupo_id, { id: String(p.id), nome: p.nome, cliente: p.cliente ?? null });
    }
    return mapa;
  } catch {
    return new Map();
  }
}

async function grupos() {
  const [conversas, todos, mapa] = await Promise.all([
    evolution('POST', `/chat/findChats/${INSTANCIA}`, {}).catch(() => []),
    evolution('GET', `/group/fetchAllGroups/${INSTANCIA}?getParticipants=false`).catch(() => []),
    vinculos(),
  ]);
  const porId = new Map();
  for (const c of Array.isArray(conversas) ? conversas : []) {
    const id = String(c.remoteJid ?? '');
    if (!id.endsWith('@g.us')) continue;
    porId.set(id, { id, nome: c.name ?? c.pushName ?? null, atualizado: c.updatedAt ?? null, membros: null });
  }
  for (const g of Array.isArray(todos) ? todos : []) {
    const atual = porId.get(g.id) ?? { id: g.id, nome: null, atualizado: null, membros: null };
    porId.set(g.id, { ...atual, nome: g.subject ?? atual.nome, membros: g.size ?? atual.membros });
  }
  return [...porId.values()]
    .map(g => ({ ...g, projeto: mapa.get(g.id) ?? null }))
    .sort((a, b) => String(b.atualizado ?? '').localeCompare(String(a.atualizado ?? '')));
}

async function acharGrupo(pedido) {
  const lista = await grupos();
  const p = String(pedido ?? '').trim();
  const achado = lista.find(g => g.id === p)
    ?? lista.find(g => semAcento(g.nome) === semAcento(p))
    ?? lista.find(g => semAcento(g.nome).includes(semAcento(p)) || (g.projeto && semAcento(g.projeto.nome).includes(semAcento(p))));
  if (!achado) {
    throw new Error(`não achei o grupo "${p}". Grupos: ${lista.map(g => g.nome ?? g.id).join(', ') || 'nenhum'}`);
  }
  return achado;
}

// ── As mensagens ────────────────────────────────────────────────────────────

function miolo(m) {
  let x = m ?? {};
  for (let i = 0; i < 4; i++) {
    const dentro = x.ephemeralMessage?.message ?? x.viewOnceMessage?.message ?? x.viewOnceMessageV2?.message
      ?? x.documentWithCaptionMessage?.message ?? x.editedMessage?.message;
    if (!dentro) break;
    x = dentro;
  }
  return x;
}

const quandoBrasilia = (segundos) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(Number(segundos) * 1000));

/** Uma mensagem guardada pela Evolution, do jeito que o modelo precisa ler. */
function linha(reg) {
  const m = miolo(reg.message);
  if (m.reactionMessage || m.protocolMessage || m.senderKeyDistributionMessage && Object.keys(m).length === 1) return null;
  let texto = m.conversation ?? m.extendedTextMessage?.text ?? '';
  let midia = null;
  if (m.imageMessage) { midia = 'imagem'; texto = m.imageMessage.caption ?? ''; }
  else if (m.documentMessage) { midia = `documento "${m.documentMessage.fileName ?? 'sem nome'}"`; texto = m.documentMessage.caption ?? ''; }
  else if (m.audioMessage) midia = 'áudio';
  else if (m.videoMessage) { midia = 'vídeo'; texto = m.videoMessage.caption ?? ''; }
  else if (m.stickerMessage) return null;
  if (!texto && !midia) return null;
  const ctx = Object.values(m).find(v => v && typeof v === 'object' && v.contextInfo)?.contextInfo ?? reg.contextInfo ?? {};
  const citada = ctx.quotedMessage ? miolo(ctx.quotedMessage) : null;
  const textoCitado = citada ? (citada.conversation ?? citada.extendedTextMessage?.text ?? citada.imageMessage?.caption ?? '') : '';
  const k = reg.key ?? {};
  return {
    id: k.id,
    quando: quandoBrasilia(reg.messageTimestamp),
    quem: k.fromMe ? 'Sheep (número da casa)' : (reg.pushName ?? 'sem nome'),
    numero: k.fromMe ? null : (digitos(k.participantAlt ?? k.participantPn ?? '') || null),
    ...(midia ? { midia } : {}),
    texto,
    ...(textoCitado ? { respondendo_a: textoCitado.slice(0, 200) } : {}),
  };
}

async function lerGrupo(a) {
  const g = await acharGrupo(a.grupo);
  const limite = Math.min(Math.max(Number(a.limite) || 40, 1), 200);
  // Com filtro de pessoa, busca mais para sobrar o bastante depois do filtro.
  const busca = a.pessoa ? Math.min(limite * 5, 500) : limite;
  const r = await evolution('POST', `/chat/findMessages/${INSTANCIA}`, { where: { key: { remoteJid: g.id } }, page: 1, offset: busca });
  const registros = r?.messages?.records ?? (Array.isArray(r) ? r : []);
  let mensagens = registros
    .slice()
    .sort((x, y) => Number(x.messageTimestamp) - Number(y.messageTimestamp))
    .map(linha)
    .filter(Boolean);
  if (a.pessoa) mensagens = mensagens.filter(m => semAcento(m.quem).includes(semAcento(a.pessoa)));
  mensagens = mensagens.slice(-limite);
  return { grupo: { id: g.id, nome: g.nome, projeto: g.projeto }, mensagens };
}

const TIPOS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

async function baixarMidia(a) {
  const g = await acharGrupo(a.grupo);
  const id = String(a.mensagem_id ?? '').trim();
  const r = await evolution('POST', `/chat/findMessages/${INSTANCIA}`, { where: { key: { id } }, page: 1, offset: 5 });
  const reg = (r?.messages?.records ?? []).find(x => x.key?.id === id && x.key?.remoteJid === g.id);
  if (!reg) throw new Error('não achei essa mensagem nesse grupo');
  const m = miolo(reg.message);
  const doc = m.documentMessage;
  // Áudio não vira arquivo para ler: vira texto, aqui mesmo.
  const audio = m.audioMessage ?? (String(doc?.mimetype ?? '').startsWith('audio/') ? doc : null);
  if (audio) {
    const segundos = Number(audio.seconds) || null;
    if (segundos && segundos > AUDIO_MAX_SEGUNDOS) throw new Error(`o áudio tem ${Math.round(segundos / 60)} min, e eu transcrevo até ${Math.round(AUDIO_MAX_SEGUNDOS / 60)} min`);
    const b = await evolution('POST', `/chat/getBase64FromMediaMessage/${INSTANCIA}`, { message: reg, convertToMp4: false });
    const som = Buffer.from(String(b?.base64 ?? ''), 'base64');
    if (!som.length || som.length > MIDIA_MAX) throw new Error('o áudio veio vazio ou grande demais');
    return { transcricao: await transcrever(som, MIDIA_DIR), segundos, de: reg.pushName ?? null, quando: quandoBrasilia(reg.messageTimestamp) };
  }
  const mime = String((m.imageMessage ?? doc)?.mimetype ?? '').split(';')[0];
  const nomeOriginal = String(doc?.fileName ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').slice(-100);
  const ext = TIPOS[mime] ?? nomeOriginal.toLowerCase().match(/\.(docx|xlsx|pdf|png|jpe?g|webp|gif)$/)?.[1];
  if (!ext) throw new Error('essa mensagem não tem imagem, PDF, Word ou Excel que eu consiga abrir');
  const b = await evolution('POST', `/chat/getBase64FromMediaMessage/${INSTANCIA}`, { message: reg, convertToMp4: false });
  const conteudo = Buffer.from(String(b?.base64 ?? ''), 'base64');
  if (!conteudo.length || conteudo.length > MIDIA_MAX) throw new Error('o arquivo veio vazio ou grande demais');
  const prefixo = `${Date.now()}-${randomBytes(4).toString('hex')}`;
  const nome = nomeOriginal || `imagem.${ext}`;
  const original = join(MIDIA_DIR, `${prefixo}-${nome}`);
  writeFileSync(original, conteudo, { mode: 0o600 });
  let leitura = original;
  const converter = ext === 'docx' ? docxParaTexto : ext === 'xlsx' ? xlsxParaTexto : null;
  if (converter) {
    leitura = `${original}.txt`;
    writeFileSync(leitura, `Conteúdo extraído de "${nome}". Formatação, imagens e gráficos não vêm junto.\n\n${converter(conteudo)}`, { mode: 0o600 });
  }
  return { caminho_para_ler: leitura, caminho_original: original, nome, de: reg.pushName ?? null };
}

// ── Quem está no grupo, e o envio ───────────────────────────────────────────

async function participantes(a) {
  const g = await acharGrupo(a.grupo);
  const [r, hist] = await Promise.all([
    evolution('GET', `/group/participants/${INSTANCIA}?groupJid=${encodeURIComponent(g.id)}`),
    evolution('POST', `/chat/findMessages/${INSTANCIA}`, { where: { key: { remoteJid: g.id } }, page: 1, offset: 500 }).catch(() => null),
  ]);
  const lista = pessoasDoGrupo(r?.participants ?? (Array.isArray(r) ? r : []), hist?.messages?.records ?? []);
  return { grupo: { id: g.id, nome: g.nome }, participantes: lista };
}

/** Manda o que o plano diz: o texto pelo sendText, ou a fala gerada aqui
 *  (voz.mjs) pelo sendWhatsAppAudio, como mensagem de voz. */
async function executarPlano(plano) {
  if (plano.tipo === 'texto') return evolution('POST', `/message/sendText/${INSTANCIA}`, plano.corpo);
  const ogg = await falar(paraFala(plano.falado), MIDIA_DIR);
  return evolution('POST', `/message/sendWhatsAppAudio/${INSTANCIA}`, { number: plano.numero, audio: ogg.toString('base64'), encoding: false });
}

async function enviarNoGrupo(a) {
  const g = await acharGrupo(a.grupo);
  // Pelo id que o modelo resolveu: parte do nome serve para achar, mas o envio
  // vai para o grupo exato que foi mostrado na confirmação.
  if (g.id !== String(a.grupo ?? '').trim()) throw new Error(`use o id do grupo (${g.id}), não o nome`);
  const plano = planoDeEnvio('enviar_no_grupo', { ...a, grupo: g.id });
  const r = await executarPlano(plano);
  return { ok: true, grupo: g.nome, como: plano.tipo, id: r?.key?.id ?? null, marcados: plano.corpo?.mentioned ?? [] };
}

async function enviarParaPessoa(a) {
  const plano = planoDeEnvio('enviar_para_pessoa', a);
  const r = await executarPlano(plano);
  return { ok: true, numero: plano.numero ?? plano.corpo.number, como: plano.tipo, id: r?.key?.id ?? null };
}

/** Os contatos do número da casa que têm o nome procurado, com o telefone. */
async function procurarContato(a) {
  const alvo = semAcento(a.nome);
  if (!alvo) throw new Error('faltou o nome');
  const r = await evolution('POST', `/chat/findContacts/${INSTANCIA}`, { where: {} });
  const lista = Array.isArray(r) ? r : r?.contacts ?? [];
  const vistos = new Set();
  const achados = [];
  for (const c of lista) {
    const nome = c.pushName ?? c.name ?? c.verifiedName ?? '';
    if (!semAcento(nome).includes(alvo)) continue;
    const jid = [c.remoteJid, c.remoteJidAlt, c.id].find(j => String(j ?? '').endsWith('@s.whatsapp.net'));
    const numero = digitos(jid ?? '');
    if (!numero || vistos.has(numero)) continue;
    vistos.add(numero);
    achados.push({ nome, numero });
  }
  return { contatos: achados.slice(0, 15), aviso: achados.length > 1 ? 'mais de um contato com esse nome: confirme qual com a pessoa' : null };
}

// ── O protocolo ─────────────────────────────────────────────────────────────

const enviar = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...msg })}\n`);
const EXECUTAR = {
  listar_grupos: () => grupos(), ler_grupo: lerGrupo, baixar_midia_do_grupo: baixarMidia,
  participantes_do_grupo: participantes, enviar_no_grupo: enviarNoGrupo,
  procurar_contato: procurarContato, enviar_para_pessoa: enviarParaPessoa,
};

async function tratar({ id, method, params }) {
  if (method === 'initialize') {
    return enviar({ id, result: {
      protocolVersion: params?.protocolVersion ?? '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'whatsapp', version: '1.0.0' },
    } });
  }
  if (id === undefined) return;
  if (method === 'ping') return enviar({ id, result: {} });
  if (method === 'tools/list') return enviar({ id, result: { tools: FERRAMENTAS } });
  if (method === 'tools/call') {
    const executar = EXECUTAR[params?.name];
    if (!executar) return enviar({ id, error: { code: -32602, message: `ferramenta desconhecida: ${params?.name}` } });
    try {
      const resultado = await executar(params.arguments ?? {});
      return enviar({ id, result: { content: [{ type: 'text', text: JSON.stringify(resultado) }] } });
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
