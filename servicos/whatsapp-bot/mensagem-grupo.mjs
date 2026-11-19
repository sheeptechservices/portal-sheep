// ─────────────────────────────────────────────────────────────────────────────
//  A mensagem que o bot manda num grupo do WhatsApp, com as menções.
//
//  Usado por dois caminhos que precisam sair iguais: o envio na hora
//  (`whatsapp-mcp.mjs`, depois da confirmação no privado) e o envio agendado
//  (`index.mjs`, que roda a agenda sem IA no meio).
//
//  No WhatsApp, a menção é o par "@numero" no texto mais o número na lista de
//  mencionados: só a lista não acende o nome, e só o texto vira um "@5531..."
//  cru. Aqui os dois andam juntos: número pedido que não está no texto entra
//  no fim.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, statSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';

/** Os dígitos de um número ou de um jid ("5531999990000@s.whatsapp.net"). */
export const digitos = (v) => String(v ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Monta o corpo do `sendText` da Evolution. Erra com mensagem legível quando
 *  falta o grupo, o texto ou um número de menção não parece telefone. */
export function montarMensagem({ grupo, texto, mencionar }) {
  const jid = String(grupo ?? '').trim();
  if (!jid.endsWith('@g.us')) throw new Error('o grupo precisa ser o id dele (termina em @g.us), de listar_grupos');
  let corpo = String(texto ?? '').trim();
  const numeros = [...new Set((Array.isArray(mencionar) ? mencionar : []).map(digitos))];
  // Só com menção a mensagem pode vir sem texto: os @ viram o texto.
  if (!corpo && !numeros.length) throw new Error('faltou o texto da mensagem');
  if (corpo.length > 4000) throw new Error('a mensagem passou de 4000 caracteres');
  for (const n of numeros) {
    if (n.length < 10 || n.length > 15) throw new Error(`"${n}" não parece um número de WhatsApp com DDI e DDD`);
  }
  const faltando = numeros.filter(n => !corpo.includes(`@${n}`));
  if (faltando.length) corpo = `${corpo} ${faltando.map(n => `@${n}`).join(' ')}`.trim();
  return { number: jid, text: corpo, ...(numeros.length ? { mentioned: numeros } : {}) };
}

/** Quem está no grupo, com o nome com que cada um aparece nas mensagens
 *  guardadas (o mais recente). Quem nunca escreveu vem sem nome. Os grupos
 *  novos endereçam por código interno (@lid), então o nome é procurado pelo
 *  número e pelo código. */
export function pessoasDoGrupo(participantes, registros) {
  const nomes = new Map();
  const ordem = (registros ?? []).slice().sort((x, y) => Number(x.messageTimestamp) - Number(y.messageTimestamp));
  for (const reg of ordem) {
    const k = reg.key ?? {};
    if (k.fromMe || !reg.pushName) continue;
    for (const chave of [k.participant, k.participantAlt, k.participantPn]) if (chave) nomes.set(digitos(chave), reg.pushName);
  }
  return (participantes ?? []).map(p => {
    const numero = digitos(p.phoneNumber ?? (String(p.id).endsWith('@s.whatsapp.net') ? p.id : ''));
    return { nome: nomes.get(numero) ?? nomes.get(digitos(p.id)) ?? null, numero: numero || null, admin: p.admin ?? null };
  });
}

/** Os números marcados num texto ("@5531999990000") que são de gente do grupo:
 *  só esses entram na lista de mencionados. */
export function mencoesNoTexto(texto, pessoas) {
  const doGrupo = new Set((pessoas ?? []).map(p => p.numero).filter(Boolean));
  return [...new Set([...String(texto ?? '').matchAll(/@(\d{10,15})\b/g)].map(m => m[1]))].filter(n => doGrupo.has(n));
}

/** A mensagem no privado de alguém: o número com DDI e DDD, e o texto. */
export function montarPrivada({ numero, texto }) {
  const n = digitos(numero);
  if (n.length < 10 || n.length > 15) throw new Error('o número precisa vir com DDI e DDD, como 5531999990000');
  const corpo = String(texto ?? '').trim();
  if (!corpo) throw new Error('faltou o texto da mensagem');
  if (corpo.length > 4000) throw new Error('a mensagem passou de 4000 caracteres');
  return { number: n, text: corpo };
}

/** O áudio mais longo que se manda: o mesmo teto da resposta em áudio. */
const AUDIO_MAX_CARACTERES = 1200;

/** O que se manda como anexo: imagem vai como foto; o resto, como documento. */
const TIPOS_DE_ANEXO = {
  png: ['image', 'image/png'], jpg: ['image', 'image/jpeg'], jpeg: ['image', 'image/jpeg'], webp: ['image', 'image/webp'],
  pdf: ['document', 'application/pdf'],
  docx: ['document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  pptx: ['document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  csv: ['document', 'text/csv'], txt: ['document', 'text/plain'], zip: ['document', 'application/zip'],
  mp3: ['document', 'audio/mpeg'], ogg: ['document', 'audio/ogg'], m4a: ['document', 'audio/mp4'], mp4: ['document', 'video/mp4'],
};
const ANEXO_MAX = 16 * 1024 * 1024;

/** O anexo de um envio: só da pasta de mídias (o que o bot gerou ou recebeu),
 *  e ainda lá (a pasta guarda dois dias). */
function anexoDe(caminho, midiaDir) {
  const certo = resolve(String(caminho ?? ''));
  if (!midiaDir || !certo.startsWith(resolve(midiaDir) + sep)) throw new Error('só mando arquivo da pasta de mídias: um gráfico, relatório ou arquivo recebido');
  if (!existsSync(certo)) throw new Error('esse arquivo não está mais na pasta (ela guarda dois dias)');
  if (statSync(certo).size > ANEXO_MAX) throw new Error('o arquivo passa de 16 MB');
  const ext = certo.toLowerCase().split('.').pop();
  const tipo = TIPOS_DE_ANEXO[ext];
  if (!tipo) throw new Error(`não mando arquivo .${ext}`);
  // O nome que aparece no WhatsApp, sem o prefixo de data que a pasta usa.
  return { caminho: certo, mediatype: tipo[0], mimetype: tipo[1], fileName: basename(certo).replace(/^\d+-[0-9a-f]{8}-/, '') };
}

/** Valida um envio para fora e diz o que mandar: texto (o corpo do sendText),
 *  áudio (o destino e o texto a falar) ou anexo (o arquivo, com o texto como
 *  legenda). Serve ao envio na hora
 *  (`whatsapp-mcp.mjs`) e ao agendado (`index.mjs`), que assim recusam as
 *  mesmas coisas: um grupo ou número torto aparece já na confirmação, e não
 *  horas depois. */
export function planoDeEnvio(ferramenta, a = {}, { midiaDir } = {}) {
  const emAudio = a.em_audio === true;
  if (a.arquivo) {
    if (emAudio) throw new Error('ou manda o arquivo ou o áudio: os dois juntos não');
    const marcar = Array.isArray(a.mencionar) && a.mencionar.length > 0;
    // Marcar é coisa de grupo; no privado de alguém não há quem marcar.
    if (marcar && ferramenta !== 'enviar_no_grupo') throw new Error('só se marca alguém em grupo');
    // O destino é conferido como no texto; o texto, aqui, é a legenda e pode
    // faltar. Com menção, a legenda leva o @ de cada um (montarMensagem o põe
    // no fim quando o texto não traz), e a lista vai junto, como no texto.
    let destino = null;
    let legenda = String(a.texto ?? '').trim();
    let mencionados = [];
    if (ferramenta === 'enviar_no_grupo') {
      const m = montarMensagem({ ...a, texto: legenda || (marcar ? ' ' : '-') });
      destino = m.number;
      if (marcar) { legenda = m.text.trim(); mencionados = m.mentioned ?? []; }
    } else if (ferramenta === 'enviar_para_pessoa') {
      destino = montarPrivada({ ...a, texto: legenda || '-' }).number;
    }
    if (!destino) throw new Error(`envio desconhecido: ${ferramenta}`);
    if (legenda.length > 1000) throw new Error('a legenda passa de 1000 caracteres');
    return { tipo: 'arquivo', numero: destino, legenda, mencionados, ...anexoDe(a.arquivo, midiaDir) };
  }
  let corpo;
  if (ferramenta === 'enviar_no_grupo') corpo = montarMensagem(a);
  else if (ferramenta === 'enviar_para_pessoa') corpo = montarPrivada(a);
  else throw new Error(`envio desconhecido: ${ferramenta}`);
  if (!emAudio) return { tipo: 'texto', corpo };
  // Mensagem de voz não marca ninguém: menção é coisa de texto.
  if (corpo.mentioned?.length) throw new Error('áudio não marca ninguém: mande sem mencionar, ou em texto');
  const falado = String(a.texto ?? '').trim();
  if (falado.length > AUDIO_MAX_CARACTERES) throw new Error(`texto longo demais para áudio (até ${AUDIO_MAX_CARACTERES} caracteres)`);
  return { tipo: 'audio', numero: corpo.number, falado };
}
