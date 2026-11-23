// ─────────────────────────────────────────────────────────────────────────────
//  O aviso de reunião pronta, vindo do Fireflies.
//
//  O Fireflies chama o bot (webhook v2) quando o resumo de uma reunião fica
//  pronto (`meeting.summarized`). O aviso traz só o id da reunião, nunca o
//  conteúdo: o resumo o bot busca depois pelo portal, pela conexão que ele
//  mesmo abre. Nada de sensível entra pela rota pública.
//
//  A rota é a única do bot aberta para fora, e por isso confere tudo antes de
//  fazer qualquer coisa: a assinatura (HMAC-SHA256 do corpo cru com o segredo
//  que só o Fireflies e o bot conhecem), o tamanho do corpo e a frequência.
//  Aviso que não passa é descartado sem gastar consulta nem modelo.
//
//  Este arquivo tem só o que não depende do resto do bot, para ser testado
//  sozinho: a conferência, a leitura do aviso e o registro do que já foi
//  avisado. Montar e mandar a mensagem fica em `index.mjs`.
// ─────────────────────────────────────────────────────────────────────────────
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

/** O maior corpo aceito: o aviso tem poucos campos, e mais que isto não é ele. */
export const CORPO_MAX = 16_000;

/** O evento que interessa: o resumo, os itens de ação e as notas prontos. O
 *  `meeting.transcribed` chega antes, só com a transcrição, e é ignorado. */
export const EVENTO_RESUMO = 'meeting.summarized';

/** A assinatura do Fireflies confere com o corpo cru e o segredo. Comparação
 *  em tempo constante, para não vazar por tempo quantos caracteres bateram. */
export function assinaturaValida(corpoCru, cabecalho, segredo) {
  if (!segredo || typeof cabecalho !== 'string') return false;
  const recebida = cabecalho.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]{64}$/i.test(recebida)) return false;
  const esperada = createHmac('sha256', segredo).update(corpoCru).digest('hex');
  return timingSafeEqual(Buffer.from(recebida.toLowerCase(), 'hex'), Buffer.from(esperada, 'hex'));
}

/** O aviso lido: o evento e o id da reunião, ou null se não é um aviso. O id
 *  só passa com o formato que o Fireflies usa, porque vai parar numa consulta
 *  ao portal. */
export function lerAviso(corpoCru) {
  let corpo;
  try { corpo = JSON.parse(corpoCru); } catch { return null; }
  if (!corpo || typeof corpo !== 'object') return null;
  const evento = String(corpo.event ?? corpo.eventType ?? '').trim();
  const id = String(corpo.meeting_id ?? corpo.meetingId ?? '').trim();
  if (!evento || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null;
  return { evento, id };
}

/** Limite de frequência da rota: quantos pedidos por minuto, no total. O
 *  Fireflies manda um por reunião (e alguns reenvios); mais que isto é abuso. */
export function limitador(porMinuto = 30) {
  let janela = 0;
  let usados = 0;
  return () => {
    const agora = Date.now();
    if (agora - janela >= 60_000) { janela = agora; usados = 0; }
    usados++;
    return usados <= porMinuto;
  };
}

/** O que já foi avisado e o que espera a vez, gravado no volume: um deploy
 *  no meio não faz a mesma reunião chegar duas vezes nem sumir da fila. */
export function registroDeReunioes(arquivo, { guardar = 300 } = {}) {
  let dados = { avisadas: [], fila: [], chat_do_dono: null };
  try {
    const lido = JSON.parse(readFileSync(arquivo, 'utf8'));
    dados = {
      avisadas: Array.isArray(lido.avisadas) ? lido.avisadas : [],
      fila: Array.isArray(lido.fila) ? lido.fila : [],
      chat_do_dono: typeof lido.chat_do_dono === 'string' ? lido.chat_do_dono : null,
    };
  } catch { /* primeira vez */ }
  const gravar = () => {
    const tmp = `${arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(dados));
    renameSync(tmp, arquivo);
  };
  return {
    /** Entra na fila, a não ser que já tenha sido avisada ou já esteja nela. */
    entrar(id) {
      if (dados.avisadas.some(a => a.id === id) || dados.fila.some(f => f.id === id)) return false;
      dados.fila.push({ id, chegou_em: new Date().toISOString(), tentativas: 0, proxima_em: new Date().toISOString() });
      gravar();
      return true;
    },
    /** As que já podem ser tentadas. */
    prontas() {
      const agora = Date.now();
      return dados.fila.filter(f => new Date(f.proxima_em).getTime() <= agora);
    },
    /** Saiu da fila: avisada, ou descartada de vez. Fica na lista de avisadas
     *  do mesmo jeito, para um reenvio do Fireflies não reabrir. */
    concluir(id, como) {
      dados.fila = dados.fila.filter(f => f.id !== id);
      dados.avisadas.push({ id, em: new Date().toISOString(), como });
      if (dados.avisadas.length > guardar) dados.avisadas = dados.avisadas.slice(-guardar);
      gravar();
    },
    /** Não deu agora: tenta de novo depois de `esperaMs`. Devolve quantas
     *  tentativas já foram. */
    adiar(id, esperaMs) {
      const f = dados.fila.find(x => x.id === id);
      if (!f) return 0;
      f.tentativas++;
      f.proxima_em = new Date(Date.now() + esperaMs).toISOString();
      gravar();
      return f.tentativas;
    },
    /** A conversa privada em que o dono fala com o bot, como o WhatsApp a
     *  identifica (com ou sem o nono dígito, ou pelo código interno): o aviso
     *  entra nela, e o "sim" dele cai na mesma conversa. */
    lembrarChat(chat) {
      if (!chat || dados.chat_do_dono === chat) return;
      dados.chat_do_dono = chat;
      gravar();
    },
    get chatDoDono() { return dados.chat_do_dono; },
    get dados() { return dados; },
  };
}
