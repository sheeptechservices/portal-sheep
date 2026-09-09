// ─────────────────────────────────────────────────────────────────────────────
//  O envio de e-mail do portal: o remetente, a moldura e o disparo.
//
//  Mora aqui, e não dentro do `_admin-handler`, porque quem avisa não é só o
//  painel: a página pública do projeto precisa contar ao time que o cliente
//  mandou um pedido, e aquele arquivo - com razão - não pode ser importado por
//  ela. Um módulo de e-mail não é o handler: não sabe de sessão, de permissão
//  nem de ação nenhuma. Sabe montar um HTML e falar com o Resend.
//
//  Tudo o que sai por aqui fica registrado em `emails_enviados`, inclusive o que
//  falhou: sem registro, "o cliente não recebeu" vira palavra contra palavra.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import { getIntegrationCredential, RESEND_KEY } from './_credentials.js';

/** Escapa o que vai para dentro do HTML do e-mail. */
export function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * O endereço do portal, para os links que saem por e-mail.
 *
 * Vem do ambiente, e nunca do cabeçalho `Host` da requisição - esse é o ataque
 * clássico contra justamente esta função: quem consegue forjar o `Host` faz o
 * convite de senha apontar para um domínio dele e colhe o token na caixa de
 * quem recebeu. O que o ambiente diz, o cliente não escolhe.
 *
 * `PORTAL_URL` manda quando existe; sem ela, vale o domínio de produção que a
 * própria Vercel publica - o que dispensa configurar nada no caso normal.
 */
export function enderecoDoPortal(): string {
  const daCasa = (process.env.PORTAL_URL ?? '').trim();
  // `VERCEL_PROJECT_PRODUCTION_URL` é o domínio de produção do projeto (o
  // customizado, quando há um), e vem sem protocolo.
  const daVercel = (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim();
  const url = daCasa
    || (daVercel ? `https://${daVercel.replace(/^https?:\/\//, '')}` : '')
    // O endereço oficial do portal, para o caso de nem uma nem outra existirem.
    || 'https://portal-sheep.vercel.app';
  return url.replace(/\/+$/, '');
}

/** O endereço de dentro de um remetente. O Resend aceita `Nome <a@b.com>`, e é
 *  o formato que faz o e-mail chegar assinado; a validação olha só o endereço. */
export function remetenteEndereco(from: string): string {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

// ─── Os e-mails que o portal manda ──────────────────────────────────────────
//
//  Uma moldura só, e um punhado de peças. Cada aviso escrevia o próprio HTML
//  inline, e o resultado era o mesmo assunto com três tipografias: a ficha de um
//  tinha 14px, a do outro 13px, e a citação mudava de cor conforme quem tinha
//  escrito por último. Aqui o corpo se monta com `fichaEmail`, `citacaoEmail`,
//  `botaoEmail` e `notaEmail`, e nenhuma tela precisa lembrar de medida nenhuma.

/** A tipografia da casa, com a escada de reserva. A Manrope chega por `@import`
 *  e só alguns leitores a carregam - Apple Mail e Outlook do Mac sim, Gmail
 *  não. Por isso a lista continua: sem ela, quem não baixa a fonte cai no
 *  serifado do sistema, que não se parece com nada nosso. */
export const FONTE_EMAIL = "'Manrope','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Uma linha da ficha: rótulo em negrito, valor ao lado. É o formato de "quem,
 *  onde, quanto" de todo aviso. */
export function fichaEmail(itens: [string, string][]): string {
  const linhas = itens
    .filter(([, valor]) => valor !== '' && valor != null)
    .map(([rotulo, valor]) => `
      <tr>
        <td style="padding:0 0 6px;font-size:13px;line-height:1.5;color:#5B5B57">
          <strong style="color:#121316;font-weight:700">${esc(rotulo)}:</strong> ${esc(valor)}
        </td>
      </tr>`).join('');
  if (!linhas) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">${linhas}</table>`;
}

/** O que a pessoa escreveu, com a barra de acento na esquerda. Preserva a
 *  quebra de linha: comentário sem parágrafo vira um bloco ilegível. */
export function citacaoEmail(texto: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px">
    <tr>
      <td style="padding:12px 16px;background:#F7F6F3;border-left:3px solid #00C9A7;border-radius:0 10px 10px 0;
                 font-size:14px;line-height:1.6;color:#2E2E2B;white-space:pre-wrap">${esc(texto)}</td>
    </tr>
  </table>`;
}

/** A ação principal, em pílula preta. Um por e-mail: dois botões do mesmo peso
 *  é a mesma coisa que nenhum. */
export function botaoEmail(rotulo: string, link: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px">
    <tr>
      <td style="border-radius:100px;background:#121316">
        <a href="${esc(link)}" style="display:inline-block;padding:13px 26px;font-family:${FONTE_EMAIL};
           font-size:14px;font-weight:800;color:#FFFFFF;text-decoration:none">${esc(rotulo)}</a>
      </td>
    </tr>
  </table>`;
}

/**
 * Um código de uso único, do tamanho de quem vai copiá-lo.
 *
 * Bloco próprio, e não uma palavra em negrito no meio do parágrafo: quem abre
 * este e-mail está com a outra janela aberta esperando, e o código tem de ser a
 * primeira coisa que o olho acha. Espaçado porque vai ser lido dígito a dígito,
 * e em fonte de largura fixa porque 0 e O, 1 e l não podem se parecer.
 */
export function codigoEmail(codigo: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px">
    <tr>
      <td align="center" style="padding:18px 12px;background:#F7F6F3;border-radius:12px;
                 font-family:'SFMono-Regular',Consolas,Menlo,monospace;font-size:30px;
                 font-weight:700;letter-spacing:10px;color:#121316">${esc(codigo)}</td>
    </tr>
  </table>`;
}

/** Parágrafo comum do corpo. */
export function textoEmail(texto: string): string {
  return `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3C3C39">${esc(texto)}</p>`;
}

/** Letra miúda: prazo do link, de onde veio o pedido, o que fazer se algo não
 *  abrir. Vem depois do que importa, e não antes. */
export function notaEmail(texto: string): string {
  return `<p style="margin:14px 0 0;font-size:12px;line-height:1.55;color:#8B887F">${texto}</p>`;
}

/**
 * Moldura única dos e-mails, com a marca no alto.
 *
 * A logo é buscada por endereço absoluto, e não embutida: cliente de e-mail
 * ignora `data:` em imagem, e anexo com `cid` faz a mensagem chegar com clipe de
 * anexo mesmo sem ter nenhum. Sai do mesmo endereço que já monta o link do
 * convite de senha, então segue o ambiente e não o que o pedido diz.
 *
 * O `previa` é o trecho que a caixa de entrada mostra ao lado do assunto. Sem
 * ele o cliente pega a primeira linha visível - que aqui seria "Sheep
 * Technology Services", igual em todos.
 */
export function layoutEmail(titulo: string, corpo: string, opcoes?: { previa?: string; rodape?: string }): string {
  const portal = enderecoDoPortal();
  const rodape = opcoes?.rodape
    ?? 'Você recebe este aviso porque está inscrito nesta notificação.';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(titulo)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background:#F1F0EC;font-family:${FONTE_EMAIL};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(opcoes?.previa ?? '')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F0EC;padding:32px 12px">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="max-width:560px;background:#FFFFFF;border:1px solid #E8E7E2;border-radius:16px">
        <tr>
          <td style="padding:26px 30px 0">
            <a href="${esc(portal)}" style="text-decoration:none">
              <img src="${esc(portal)}/logo-lockup.png" width="128" alt="Sheep Technology Services"
                style="display:block;width:128px;height:auto;border:0">
            </a>
          </td>
        </tr>
        <tr><td style="padding:20px 30px 0"><div style="height:3px;width:32px;border-radius:2px;background:#00C9A7"></div></td></tr>
        <tr>
          <td style="padding:14px 30px 0">
            <h1 style="margin:0;font-family:${FONTE_EMAIL};font-size:19px;line-height:1.35;font-weight:800;color:#121316">${esc(titulo)}</h1>
          </td>
        </tr>
        <tr><td style="padding:16px 30px 26px;font-family:${FONTE_EMAIL}">${corpo}</td></tr>
        <tr>
          <td style="padding:16px 30px 18px;border-top:1px solid #EFEEE9;background:#FBFAF8;border-radius:0 0 16px 16px">
            <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#5B5B57">
              <a href="${esc(portal)}" style="color:#121316;text-decoration:none">Portal Sheep</a>
            </p>
            <p style="margin:0;font-size:11px;line-height:1.5;color:#9A968C">${esc(rodape)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * De onde sai o e-mail: a integração salva no painel, com as variáveis de
 * ambiente como plano B.
 *
 * O cofre vem primeiro porque é onde a casa configura - trocar o remetente ou
 * girar a chave não deveria exigir um deploy. As `RESEND_*` continuam valendo
 * para o ambiente que ainda não passou pelo painel.
 */
export interface RemetenteEmail {
  apiKey: string;
  from: string;
  replyTo: string | null;
  /** De onde veio a configuração, para a tela saber o que dizer. */
  origem: 'cofre' | 'ambiente';
}

export async function remetenteDeEmail(db: Client): Promise<RemetenteEmail | null> {
  const cred = await getIntegrationCredential(db, RESEND_KEY).catch(() => null);
  const doCofre = cred?.value ? String(cred.value) : '';
  const fromCofre = String(cred?.meta?.from ?? '').trim();
  if (doCofre && fromCofre) {
    return {
      apiKey: doCofre,
      from: fromCofre,
      replyTo: String(cred?.meta?.reply_to ?? '').trim() || null,
      origem: 'cofre',
    };
  }
  const apiKey = process.env.RESEND_API_KEY ?? '';
  const from = process.env.RESEND_FROM_EMAIL ?? '';
  if (apiKey && from) return { apiKey, from, replyTo: null, origem: 'ambiente' };
  return null;
}

/**
 * Envia um e-mail pelo Resend, e registra o que aconteceu.
 *
 * Falhar aqui é sempre não-fatal: notificação é efeito colateral, e perder uma
 * não pode derrubar a ação que a disparou (mover etapa, comentar, cadastrar).
 * Sem integração configurada a função não envia - mas registra a tentativa, que
 * é o que transforma "o e-mail não chegou" em pergunta com resposta.
 */
export async function notifyEmail(
  db: Client, to: string, assunto: string, corpo: string, tipo = 'aviso',
  extras?: {
    /** Anexos do Resend: `content` em base64 puro, sem o cabeçalho `data:`. */
    anexos?: { filename: string; content: string }[];
    /** O trecho que a caixa de entrada mostra ao lado do assunto. */
    previa?: string;
    /** Por que esta pessoa está recebendo. Cada aviso tem o seu. */
    rodape?: string;
  },
): Promise<{ ok: boolean; id?: string; erro?: string }> {
  if (!to) return { ok: false, erro: 'Sem destinatário.' };
  const registrar = (situacao: string, resendId: string | null, erro: string | null) =>
    db.execute({
      sql: `INSERT INTO emails_enviados (destino, assunto, tipo, situacao, resend_id, erro, criado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [to, assunto, tipo, situacao, resendId, erro, new Date().toISOString()],
    }).catch(() => { /* registro é apoio: falhar aqui não derruba o envio */ });

  const remetente = await remetenteDeEmail(db);
  if (!remetente) {
    await registrar('sem_integracao', null, 'Resend não configurado.');
    return { ok: false, erro: 'O envio de e-mail não está configurado.' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${remetente.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente.from,
        to,
        ...(remetente.replyTo ? { reply_to: remetente.replyTo } : {}),
        subject: assunto,
        html: layoutEmail(assunto, corpo, { previa: extras?.previa, rodape: extras?.rodape }),
        ...(extras?.anexos?.length ? { attachments: extras.anexos } : {}),
      }),
    });
    const resposta: any = await r.json().catch(() => null);
    if (!r.ok) {
      const erro = resposta?.message ?? `HTTP ${r.status}`;
      console.error('[notify-email]', to, erro);
      await registrar('falhou', null, String(erro));
      return { ok: false, erro: String(erro) };
    }
    await registrar('enviado', resposta?.id ? String(resposta.id) : null, null);
    return { ok: true, id: resposta?.id ? String(resposta.id) : undefined };
  } catch (e) {
    const erro = (e as Error).message;
    console.error('[notify-email]', erro);
    await registrar('falhou', null, erro);
    return { ok: false, erro };
  }
}
