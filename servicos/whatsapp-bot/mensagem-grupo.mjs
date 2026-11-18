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

/** Os dígitos de um número ou de um jid ("5531999990000@s.whatsapp.net"). */
export const digitos = (v) => String(v ?? '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Monta o corpo do `sendText` da Evolution. Erra com mensagem legível quando
 *  falta o grupo, o texto ou um número de menção não parece telefone. */
export function montarMensagem({ grupo, texto, mencionar }) {
  const jid = String(grupo ?? '').trim();
  if (!jid.endsWith('@g.us')) throw new Error('o grupo precisa ser o id dele (termina em @g.us), de listar_grupos');
  let corpo = String(texto ?? '').trim();
  if (!corpo) throw new Error('faltou o texto da mensagem');
  if (corpo.length > 4000) throw new Error('a mensagem passou de 4000 caracteres');
  const numeros = [...new Set((Array.isArray(mencionar) ? mencionar : []).map(digitos))];
  for (const n of numeros) {
    if (n.length < 10 || n.length > 15) throw new Error(`"${n}" não parece um número de WhatsApp com DDI e DDD`);
  }
  const faltando = numeros.filter(n => !corpo.includes(`@${n}`));
  if (faltando.length) corpo = `${corpo} ${faltando.map(n => `@${n}`).join(' ')}`;
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
