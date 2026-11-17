// ─────────────────────────────────────────────────────────────────────────────
//  Bot do WhatsApp da Sheep: o número da casa conversando com IA.
//
//  A Evolution avisa aqui (webhook) cada mensagem que chega ao número. Só uma
//  pessoa aciona o bot - o número autorizado -, no privado ou mencionando o
//  bot num grupo; o resto é descartado antes de gastar qualquer coisa. A
//  resposta sai do Claude Code rodando com a assinatura (CLAUDE_CODE_OAUTH_TOKEN),
//  ligado ao MCP do portal para consultar e mexer nos cards.
//
//  Ação que altera o portal nunca roda direto: as ferramentas de escrita só
//  ficam liberadas na mensagem que confirma uma proposta do próprio bot. Fora
//  dela o Claude Code recusa a chamada, por mais que o modelo tente.
//
//  Sem dependências: Node 22 (fetch e http nativos) e o executável `claude`.
// ─────────────────────────────────────────────────────────────────────────────
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const cfg = {
  porta: Number(process.env.PORT ?? 3000),
  segredo: process.env.WEBHOOK_SEGREDO ?? '',
  evolutionUrl: (process.env.EVOLUTION_URL ?? '').replace(/\/+$/, ''),
  instancia: process.env.EVOLUTION_INSTANCIA ?? '',
  evolutionChave: process.env.EVOLUTION_APIKEY ?? '',
  autorizado: (process.env.NUMERO_AUTORIZADO ?? '').replace(/\D/g, ''),
  mcpUrl: process.env.PORTAL_MCP_URL ?? '',
  mcpToken: process.env.PORTAL_MCP_TOKEN ?? '',
  claude: process.env.CLAUDE_BIN ?? 'claude',
  dados: process.env.DADOS_DIR ?? '/dados',
  trabalho: process.env.TRABALHO_DIR ?? '/app/trabalho',
  /** Conversa parada há mais que isto recomeça do zero. */
  sessaoMs: Number(process.env.SESSAO_HORAS ?? 6) * 3600_000,
  tempoMaxMs: Number(process.env.CLAUDE_TEMPO_SEG ?? 240) * 1000,
};

const faltando = Object.entries({
  WEBHOOK_SEGREDO: cfg.segredo, EVOLUTION_URL: cfg.evolutionUrl, EVOLUTION_INSTANCIA: cfg.instancia,
  EVOLUTION_APIKEY: cfg.evolutionChave, NUMERO_AUTORIZADO: cfg.autorizado,
  PORTAL_MCP_URL: cfg.mcpUrl, PORTAL_MCP_TOKEN: cfg.mcpToken,
}).filter(([, v]) => !v).map(([k]) => k);
if (faltando.length) {
  console.error(`[bot] configuração faltando: ${faltando.join(', ')}`);
  process.exit(1);
}

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── Ferramentas do portal ───────────────────────────────────────────────────

/** Só leitura: sempre liberadas. */
const LEITURA = ['listar_projetos', 'listar_tarefas', 'ver_tarefa', 'listar_pessoas',
  'listar_status', 'listar_etiquetas', 'baixar_anexo'];
/** Alteram o portal: só na mensagem que confirma uma proposta. */
const ESCRITA = ['criar_tarefa', 'editar_tarefa', 'excluir_tarefa', 'comentar', 'excluir_comentario',
  'adicionar_subtarefa', 'editar_subtarefa', 'excluir_subtarefa', 'joinha_comentario'];
const doPortal = (nome) => `mcp__portal__${nome}`;

// O MCP do portal com o token fixo: escrito uma vez, legível só por este
// processo. O token não vai na linha de comando, onde apareceria na lista de
// processos.
mkdirSync(cfg.dados, { recursive: true });
mkdirSync(cfg.trabalho, { recursive: true });
const mcpConfig = join(cfg.trabalho, '.mcp-portal.json');
writeFileSync(mcpConfig, JSON.stringify({
  mcpServers: {
    portal: { type: 'http', url: cfg.mcpUrl, headers: { Authorization: `Bearer ${cfg.mcpToken}` } },
  },
}), { mode: 0o600 });

// ── Estado das conversas ────────────────────────────────────────────────────

const arquivoEstado = join(cfg.dados, 'estado.json');
/** Por conversa: a sessão do Claude Code, se há uma ação esperando o "sim" e
 *  quando foi a última mensagem. */
let estado = {};
try { estado = JSON.parse(readFileSync(arquivoEstado, 'utf8')); } catch { estado = {}; }
function gravarEstado() {
  const tmp = `${arquivoEstado}.tmp`;
  writeFileSync(tmp, JSON.stringify(estado));
  renameSync(tmp, arquivoEstado);
}

// ── Quem mandou e se é com o bot ────────────────────────────────────────────

const digitos = (jid) => String(jid ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** O número autorizado, nas duas grafias que o WhatsApp usa para celular
 *  brasileiro: com e sem o nono dígito depois do DDD. */
const formasAutorizadas = (() => {
  const n = cfg.autorizado;
  const formas = new Set([n]);
  if (/^55\d{2}9\d{8}$/.test(n)) formas.add(n.slice(0, 4) + n.slice(5));
  if (/^55\d{10}$/.test(n)) formas.add(`${n.slice(0, 4)}9${n.slice(4)}`);
  return formas;
})();

/** O próprio número do bot, aprendido do campo `sender` que a Evolution manda. */
let jidDoBot = null;

function textoDa(msg) {
  return msg?.conversation
    ?? msg?.extendedTextMessage?.text
    ?? msg?.imageMessage?.caption
    ?? msg?.videoMessage?.caption
    ?? msg?.documentMessage?.caption
    ?? '';
}

/** Decide se a mensagem é com o bot. Devolve o que é preciso para responder,
 *  ou nulo para ignorar - e o motivo vai para o log, para depuração. */
function filtrar(corpo) {
  const evento = String(corpo?.event ?? '').toLowerCase().replace(/_/g, '.');
  if (evento !== 'messages.upsert') return null;
  const d = corpo.data ?? {};
  const k = d.key ?? {};
  if (corpo.sender) jidDoBot = String(corpo.sender);
  if (k.fromMe) return null;
  const chat = String(k.remoteJid ?? '');
  const grupo = chat.endsWith('@g.us');
  const texto = String(textoDa(d.message)).trim();
  if (!texto) return null;

  const candidatos = grupo
    ? [k.participant, k.participantAlt, k.participantPn, d.participant, k.senderPn]
    : [k.remoteJid, k.remoteJidAlt, k.senderPn];
  const autorizado = candidatos.some(j => j && formasAutorizadas.has(digitos(j)));
  if (!autorizado) {
    log('[ignorado] remetente não autorizado', grupo ? 'em grupo' : 'no privado', candidatos.filter(Boolean).join(' | '));
    return null;
  }

  if (grupo) {
    const ctx = d.message?.extendedTextMessage?.contextInfo ?? d.contextInfo ?? {};
    const mencoes = (ctx.mentionedJid ?? []).map(String);
    const doBot = digitos(jidDoBot);
    const mencionou = mencoes.some(j => digitos(j) === doBot)
      || (doBot && texto.includes(`@${doBot}`))
      // Responder a uma mensagem do bot também é falar com ele.
      || (ctx.participant && digitos(ctx.participant) === doBot);
    if (!mencionou) {
      log('[ignorado] grupo sem menção ao bot', chat);
      return null;
    }
  }
  // A menção sai do texto: "@5531... qual o status" vira "qual o status".
  const limpo = texto.replace(/@\d{8,15}/g, '').trim();
  return { chat, grupo, texto: limpo || texto, nome: d.pushName ?? null };
}

// ── O Claude Code ───────────────────────────────────────────────────────────

const hoje = () => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date());

function instrucoes() {
  return [
    'Você é o assistente da Sheep Technology no WhatsApp, falando com o Guilherme, dono da conta.',
    `Hoje é ${hoje()}, horário de Brasília.`,
    'Você opera o Portal Sheep pelas ferramentas do servidor MCP "portal": consulta projetos, cards (tarefas), pessoas, etapas e etiquetas, e pode criar, mover (trocar a etapa), editar, comentar e excluir.',
    '',
    'Regra de ouro, sem exceção: nunca altere nada no portal sem confirmação.',
    'Para qualquer criação, edição, mudança de etapa, comentário ou exclusão: primeiro use as ferramentas de leitura para achar exatamente o card e os dados certos; depois descreva em poucas linhas o que vai fazer (qual card, de onde para onde, quais campos) e termine a mensagem com a linha exata "Confirma? (sim/não)". Não execute nessa mensagem.',
    'Só execute quando a mensagem seguinte começar com a nota do sistema dizendo que a pessoa confirmou. Execute exatamente o que foi proposto, nada além, e diga em uma linha o que foi feito.',
    'Se a pessoa disser não ou mudar de ideia, não execute e pergunte o que ela quer.',
    'Se houver mais de um card que serve, liste as opções e pergunte qual, antes de propor a ação.',
    '',
    'Escreva para WhatsApp: respostas curtas e diretas, em português do Brasil.',
    'Formatação do WhatsApp: *negrito* com um asterisco, _itálico_, listas com "- ". Não use títulos com #, tabelas nem blocos de código.',
    'Nunca use travessão longo nem travessão médio: use hífen, vírgula ou dois-pontos.',
    'Datas no formato dd/mm. Não invente dados: se não achar algo no portal, diga que não achou.',
  ].join('\n');
}

const CONFIRMACAO = /^\s*(sim|s|ss|confirmo|confirma|confirmado|pode|pode fazer|pode ir|manda|manda ver|ok|okay|beleza|isso|faz|faca|faça|vai|bora|positivo)\b[\s.!]*$/i;

/** Roda o Claude Code uma vez. Devolve o texto da resposta e a sessão. */
function perguntar({ texto, sessao, liberarEscrita }) {
  const permitidas = [...LEITURA, ...(liberarEscrita ? ESCRITA : [])].map(doPortal);
  // A mensagem vai pela entrada padrão, e não como argumento: um texto que
  // comece com hífen (uma lista colada) seria lido como opção da linha de comando.
  const args = [
    '-p',
    '--output-format', 'json',
    '--mcp-config', mcpConfig,
    '--strict-mcp-config',
    '--append-system-prompt', instrucoes(),
    // Nenhuma ferramenta própria do Claude Code: o bot não lê arquivos, não
    // roda comandos e não navega. Só fala e usa o portal.
    '--tools', '',
    '--allowedTools', permitidas.join(','),
    ...(liberarEscrita ? [] : ['--disallowedTools', ESCRITA.map(doPortal).join(',')]),
    ...(sessao ? ['--resume', sessao] : []),
  ];
  return new Promise((resolver) => {
    // Um `.mjs` no lugar do executável roda pelo próprio Node: é como os
    // testes trocam o Claude Code por um dublê.
    const [exe, prefixo] = cfg.claude.endsWith('.mjs') ? [process.execPath, [cfg.claude]] : [cfg.claude, []];
    const filho = spawn(exe, [...prefixo, ...args], { cwd: cfg.trabalho, env: process.env });
    filho.stdin.end(texto);
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => { filho.kill('SIGKILL'); }, cfg.tempoMaxMs);
    filho.stdout.on('data', c => { saida += c; });
    filho.stderr.on('data', c => { erro += c; });
    filho.on('error', e => {
      clearTimeout(relogio);
      resolver({ ok: false, motivo: `não consegui iniciar o Claude Code (${e.message})` });
    });
    filho.on('close', (codigo, sinal) => {
      clearTimeout(relogio);
      if (sinal === 'SIGKILL') return resolver({ ok: false, motivo: 'a resposta demorou demais' });
      let r = null;
      try { r = JSON.parse(saida.trim().split('\n').filter(Boolean).pop() ?? ''); } catch { r = null; }
      if (!r) {
        log('[claude] saída inesperada', codigo, erro.slice(0, 500), saida.slice(0, 300));
        return resolver({ ok: false, motivo: 'o Claude Code não respondeu como esperado' });
      }
      if (r.is_error) {
        log('[claude] erro', r.subtype, String(r.result ?? '').slice(0, 300));
        return resolver({ ok: false, motivo: String(r.result || r.subtype || 'erro no Claude Code'), sessao: r.session_id });
      }
      resolver({ ok: true, texto: String(r.result ?? '').trim(), sessao: r.session_id ?? sessao });
    });
  });
}

/** O que o modelo escreve em markdown, na formatação do WhatsApp. */
function paraWhatsapp(t) {
  return t
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '_$1_')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    // Travessão médio e longo (U+2013 e U+2014), montados pelo código para o
    // caractere não aparecer no arquivo.
    .replace(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`, 'g'), '-');
}

// ── Evolution ───────────────────────────────────────────────────────────────

async function evolution(caminho, corpo) {
  const r = await fetch(`${cfg.evolutionUrl}${caminho}`, {
    method: 'POST',
    headers: { apikey: cfg.evolutionChave, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) log('[evolution]', caminho, r.status, (await r.text().catch(() => '')).slice(0, 300));
  return r.ok;
}

const responder = (chat, texto) =>
  evolution(`/message/sendText/${encodeURIComponent(cfg.instancia)}`, { number: chat, text: texto });

/** "Digitando..." enquanto o Claude pensa. Enfeite: falhar não importa. */
const digitando = (chat) =>
  evolution(`/chat/sendPresence/${encodeURIComponent(cfg.instancia)}`, { number: chat, presence: 'composing', delay: 15_000 })
    .catch(() => false);

// ── Uma mensagem, do começo ao fim ──────────────────────────────────────────

/** Uma fila por conversa: duas mensagens seguidas não rodam o Claude Code em
 *  paralelo na mesma sessão. */
const filas = new Map();
function enfileirar(chat, tarefa) {
  const anterior = filas.get(chat) ?? Promise.resolve();
  const proxima = anterior.then(tarefa, tarefa).finally(() => {
    if (filas.get(chat) === proxima) filas.delete(chat);
  });
  filas.set(chat, proxima);
}

async function atender({ chat, texto }) {
  const agora = Date.now();
  const atual = estado[chat] ?? {};
  // "nova conversa" zera a memória, como abrir um chat novo.
  if (/^\s*(\/novo|nova conversa|zerar|reiniciar)\s*$/i.test(texto)) {
    estado[chat] = { atualizado: agora };
    gravarEstado();
    await responder(chat, 'Pronto, comecei uma conversa nova.');
    return;
  }
  const expirou = !atual.atualizado || agora - atual.atualizado > cfg.sessaoMs;
  const sessao = expirou ? null : atual.sessao ?? null;
  const confirmou = !expirou && !!atual.pendente && CONFIRMACAO.test(texto);

  const pergunta = confirmou
    ? `[Nota do sistema: a pessoa confirmou a ação que você propôs na mensagem anterior. Execute exatamente essa ação agora, nada além.]\n\n${texto}`
    : texto;

  void digitando(chat);
  const r = await perguntar({ texto: pergunta, sessao, liberarEscrita: confirmou });
  if (!r.ok) {
    estado[chat] = { ...atual, sessao: r.sessao ?? sessao, pendente: false, atualizado: agora };
    gravarEstado();
    await responder(chat, `Não consegui responder agora: ${r.motivo}.`);
    return;
  }
  const resposta = paraWhatsapp(r.texto || 'Feito.');
  estado[chat] = {
    sessao: r.sessao,
    // A proposta fica esperando o "sim" só se o bot terminou pedindo
    // confirmação; qualquer outra resposta desarma.
    pendente: /Confirma\?\s*\(sim\/n[aã]o\)/i.test(resposta),
    atualizado: agora,
  };
  gravarEstado();
  await responder(chat, resposta);
  log('[respondido]', chat, confirmou ? '(com ação liberada)' : '');
}

// ── Servidor ────────────────────────────────────────────────────────────────

const rotaWebhook = `/webhook/${cfg.segredo}`;

http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/saude') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (req.method !== 'POST' || req.url !== rotaWebhook) {
    res.writeHead(404);
    return res.end();
  }
  let cru = '';
  req.on('data', c => { cru += c; if (cru.length > 2_000_000) req.destroy(); });
  req.on('end', () => {
    // Responde já: a Evolution não precisa esperar o Claude pensar.
    res.writeHead(200);
    res.end();
    let corpo = null;
    try { corpo = JSON.parse(cru); } catch { return; }
    const m = filtrar(corpo);
    if (!m) return;
    log('[recebido]', m.grupo ? 'grupo' : 'privado', m.chat);
    enfileirar(m.chat, () => atender(m).catch(e => log('[erro]', e?.message ?? e)));
  });
}).listen(cfg.porta, () => log(`[bot] ouvindo na porta ${cfg.porta}`));
