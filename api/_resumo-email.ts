// ─────────────────────────────────────────────────────────────────────────────
//  Os avisos de etapa por e-mail, juntados num resumo.
//
//  Cada mudança de etapa mandava um e-mail na hora, um por tarefa e por pessoa.
//  Quem arruma o quadro move vinte cartões em três minutos, e do outro lado
//  chegavam vinte e-mails iguais, que ninguém lê e que enterram o que importa.
//
//  Agora o aviso de etapa entra numa fila por destinatário, e sai junto com os
//  outros quando a movimentação acalma: dez minutos sem aviso novo para aquela
//  pessoa, ou meia hora desde o primeiro da fila, o que vier antes. O teto
//  existe para o resumo não ficar esperando para sempre num dia de quadro
//  mexido o tempo todo.
//
//  O que muda é só o e-mail. O inbox do portal continua recebendo cada aviso na
//  hora, e o que é pessoal e pede ação (menção, código do cofre, convite)
//  continua saindo imediato pelo `notifyEmail`, sem passar por aqui.
//
//  Ninguém agenda o envio: ele vai "de carona" nas requisições do portal. A
//  cada minuto, por instância, a primeira requisição confere a fila e manda o
//  que já venceu. Como a equipe usa o portal o dia todo, o resumo sai no tempo
//  certo quase sempre; o que entrar na fila de noite sai na primeira requisição
//  da manhã.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import {
  botaoEmail, enderecoDoPortal, esc, fichaEmail, notifyEmail, textoEmail, FONTE_EMAIL,
} from './_email.js';

/** Sem aviso novo por este tempo, o resumo daquela pessoa sai. */
const CALMARIA_MS = 10 * 60_000;
/** Desde o primeiro aviso da fila, o resumo não espera mais do que isto. */
const TETO_MS = 30 * 60_000;
/** De quanto em quanto tempo cada instância confere a fila. */
const INTERVALO_CONFERENCIA_MS = 60_000;
/** Reserva mais velha que isto é de uma instância que morreu no meio do envio. */
const RESERVA_PRESA_MS = 10 * 60_000;
/** Falhou este tanto de vezes, o aviso sai da fila. O `emails_enviados` já
 *  guarda cada falha, então desistir não apaga o rastro. */
const TENTATIVAS_MAX = 3;
/** Linhas no corpo do resumo. O resto vira "e mais N no portal". */
const LINHAS_MAX = 60;

/** Um aviso de etapa, com o que os dois formatos de e-mail precisam. */
export interface AvisoDeEtapa {
  tipo: 'etapa_tarefa' | 'etapa_oportunidade';
  /** O id da tarefa ou da oportunidade: o mesmo cartão movido duas vezes vira
   *  uma linha só, na etapa em que ele terminou. */
  alvo: string;
  /** O nome do cartão na linha do resumo. */
  titulo: string;
  /** O bloco do resumo: o projeto da tarefa, ou o funil. */
  grupo: string;
  etapa: string;
  /** A letra miúda da linha: responsáveis, valor. */
  detalhe?: string;
  /** Quem moveu. */
  autor?: string;
  // O e-mail avulso, para quando a fila tem um aviso só: sai igual ao de antes,
  // e não como "resumo de uma tarefa".
  assunto: string;
  ficha: [string, string][];
  previa: string;
  rodape: string;
}

/** A tabela da fila. Vai no `migrarSchema`, ao lado de `emails_enviados`. */
export const DDL_FILA_DE_EMAILS = [
  `CREATE TABLE IF NOT EXISTS emails_na_fila (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    destino      TEXT NOT NULL,
    tipo         TEXT NOT NULL,
    alvo         TEXT NOT NULL,
    /** O AvisoDeEtapa inteiro, em JSON: o cartão pode mudar de nome ou ser
     *  apagado antes de o resumo sair, e o e-mail conta o que aconteceu. */
    dados        TEXT NOT NULL,
    /** A instância que pegou estes avisos para enviar. Nulo = livre. */
    lote         TEXT,
    reservado_em TEXT,
    tentativas   INTEGER NOT NULL DEFAULT 0,
    criado_em    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_emails_na_fila_destino ON emails_na_fila (destino, criado_em)`,
];

/** Põe o aviso na fila de cada destinatário, numa ida ao banco só. */
export async function enfileirarAvisos(db: Client, destinos: string[], aviso: AvisoDeEtapa): Promise<void> {
  const unicos = [...new Set(destinos.map(d => d.trim()).filter(Boolean))];
  if (unicos.length === 0) return;
  const agora = new Date().toISOString();
  const dados = JSON.stringify(aviso);
  await db.batch(unicos.map(destino => ({
    sql: `INSERT INTO emails_na_fila (destino, tipo, alvo, dados, criado_em) VALUES (?,?,?,?,?)`,
    args: [destino, aviso.tipo, aviso.alvo, dados, agora],
  })), 'write');
}

let ultimaConferencia = 0;

/**
 * Manda os resumos que já venceram. Chamada de carona por toda requisição do
 * painel, mas só vai ao banco uma vez por minuto em cada instância.
 *
 * Duas instâncias podem conferir ao mesmo tempo, e por isso cada fila é
 * reservada com um `UPDATE ... RETURNING` antes do envio: quem reservou
 * primeiro leva os avisos, e o outro recebe zero linhas e não manda nada.
 */
export async function enviarResumosVencidos(db: Client, agora = Date.now()): Promise<void> {
  if (agora - ultimaConferencia < INTERVALO_CONFERENCIA_MS) return;
  ultimaConferencia = agora;

  const calmaria = new Date(agora - CALMARIA_MS).toISOString();
  const teto = new Date(agora - TETO_MS).toISOString();
  const presa = new Date(agora - RESERVA_PRESA_MS).toISOString();
  const vencidos = await db.execute({
    sql: `SELECT destino FROM emails_na_fila
          WHERE lote IS NULL OR reservado_em < ?
          GROUP BY destino
          HAVING MAX(criado_em) <= ? OR MIN(criado_em) <= ?`,
    args: [presa, calmaria, teto],
  });
  // Um pedido por pessoa, em paralelo: cada resumo é independente do outro.
  await Promise.all(vencidos.rows.map(r =>
    enviarResumoDe(db, String(r.destino), agora, presa).catch(e =>
      console.error('[resumo-email]', String(r.destino), (e as Error).message))));
}

async function enviarResumoDe(db: Client, destino: string, agora: number, presa: string) {
  const lote = `${agora}-${Math.random().toString(36).slice(2, 10)}`;
  const reservados = await db.execute({
    sql: `UPDATE emails_na_fila SET lote = ?, reservado_em = ?
          WHERE destino = ? AND (lote IS NULL OR reservado_em < ?)
          RETURNING id, alvo, tipo, dados, criado_em`,
    args: [lote, new Date(agora).toISOString(), destino, presa],
  });
  if (reservados.rows.length === 0) return;

  // O mesmo cartão movido mais de uma vez fica com a última etapa: o que
  // interessa a quem lê é onde ele está, não o caminho que fez.
  const porCartao = new Map<string, { aviso: AvisoDeEtapa; quando: string }>();
  let primeiro = '';
  let ultimo = '';
  for (const r of reservados.rows) {
    let aviso: AvisoDeEtapa;
    try { aviso = JSON.parse(String(r.dados)); } catch { continue; }
    const quando = String(r.criado_em);
    if (!primeiro || quando < primeiro) primeiro = quando;
    if (!ultimo || quando > ultimo) ultimo = quando;
    const chave = `${r.tipo}:${r.alvo}`;
    const atual = porCartao.get(chave);
    if (!atual || quando >= atual.quando) porCartao.set(chave, { aviso, quando });
  }
  const avisos = [...porCartao.values()].sort((a, b) => a.quando.localeCompare(b.quando)).map(x => x.aviso);

  let envio: { ok: boolean };
  if (avisos.length === 0) {
    envio = { ok: true };
  } else if (avisos.length === 1) {
    const a = avisos[0];
    envio = await notifyEmail(db, destino, a.assunto, fichaEmail(a.ficha) + botaoDoCartao(a), a.tipo,
      { previa: a.previa, rodape: a.rodape });
  } else {
    const r = montarResumo(avisos, primeiro, ultimo);
    envio = await notifyEmail(db, destino, r.assunto, r.corpo, 'resumo_etapas',
      { previa: r.previa, rodape: r.rodape });
  }

  if (envio.ok) {
    await db.execute({ sql: 'DELETE FROM emails_na_fila WHERE lote = ?', args: [lote] });
    return;
  }
  // Falhou: solta a reserva para a próxima conferência tentar de novo, e tira
  // da fila o que já esgotou as tentativas.
  await db.batch([
    {
      sql: `UPDATE emails_na_fila SET lote = NULL, reservado_em = NULL, tentativas = tentativas + 1
            WHERE lote = ?`,
      args: [lote],
    },
    { sql: 'DELETE FROM emails_na_fila WHERE destino = ? AND tentativas >= ?', args: [destino, TENTATIVAS_MAX] },
  ], 'write');
}

function linkDoCartao(a: AvisoDeEtapa): string {
  const portal = enderecoDoPortal();
  const id = encodeURIComponent(a.alvo);
  return a.tipo === 'etapa_tarefa' ? `${portal}/tarefas/${id}` : `${portal}/oportunidades/${id}`;
}

function botaoDoCartao(a: AvisoDeEtapa): string {
  return botaoEmail(a.tipo === 'etapa_tarefa' ? 'Abrir a tarefa' : 'Abrir a oportunidade', linkDoCartao(a));
}

const HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

function contagem(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** O resumo: a conta por etapa no alto, e os cartões agrupados por projeto. */
export function montarResumo(avisos: AvisoDeEtapa[], primeiro: string, ultimo: string) {
  const tarefas = avisos.filter(a => a.tipo === 'etapa_tarefa').length;
  const oportunidades = avisos.length - tarefas;
  const partes = [
    tarefas ? contagem(tarefas, 'tarefa', 'tarefas') : '',
    oportunidades ? contagem(oportunidades, 'oportunidade', 'oportunidades') : '',
  ].filter(Boolean);
  const sujeito = partes.join(' e ');
  const verbo = avisos.length === 1 ? 'mudou' : 'mudaram';
  const assunto = `${sujeito} ${verbo} de etapa`;

  // Quantos cartões terminaram em cada etapa, da mais cheia para a mais vazia.
  const porEtapa = new Map<string, number>();
  for (const a of avisos) porEtapa.set(a.etapa, (porEtapa.get(a.etapa) ?? 0) + 1);
  const etapas = [...porEtapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const previa = etapas.map(([nome, n]) => `${nome} ${n}`).join(' | ');

  const de = HORA.format(new Date(primeiro));
  const ate = HORA.format(new Date(ultimo));
  const janela = de === ate ? `às ${de}` : `entre ${de} e ${ate}`;

  // Os blocos: tarefas por projeto (na ordem alfabética), e o funil no fim.
  const grupos = new Map<string, AvisoDeEtapa[]>();
  for (const a of avisos) {
    const lista = grupos.get(a.grupo) ?? [];
    lista.push(a);
    grupos.set(a.grupo, lista);
  }
  const ordemDosGrupos = [...grupos.keys()].sort((a, b) => {
    const funilA = grupos.get(a)![0].tipo === 'etapa_oportunidade';
    const funilB = grupos.get(b)![0].tipo === 'etapa_oportunidade';
    if (funilA !== funilB) return funilA ? 1 : -1;
    return a.localeCompare(b, 'pt-BR');
  });

  let restam = LINHAS_MAX;
  let cortados = 0;
  const blocos = ordemDosGrupos.map(nome => {
    const lista = grupos.get(nome)!
      .slice()
      .sort((a, b) => a.etapa.localeCompare(b.etapa, 'pt-BR') || a.titulo.localeCompare(b.titulo, 'pt-BR', { numeric: true }));
    const visiveis = lista.slice(0, Math.max(restam, 0));
    cortados += lista.length - visiveis.length;
    restam -= visiveis.length;
    if (visiveis.length === 0) return '';
    return blocoDoGrupo(nome, lista.length, visiveis);
  }).join('');

  const corpo =
    textoEmail(`Movimentações ${janela}. Cada cartão aparece uma vez, na etapa em que terminou.`)
    + chipsDasEtapas(etapas)
    + blocos
    + (cortados > 0 ? textoEmail(`E mais ${contagem(cortados, 'cartão', 'cartões')} no portal.`) : '')
    + botaoEmail('Abrir o portal', enderecoDoPortal());

  const rodape = 'Você recebe este resumo pelo seu papel na equipe dos projetos e pelas etapas do funil'
    + ' que acompanha. Os avisos de etapa chegam juntos, depois de 10 minutos sem movimentação.';
  return { assunto, corpo, previa, rodape };
}

function chipsDasEtapas(etapas: [string, number][]): string {
  // Cada chip numa tabela própria, em linha: assim eles quebram de linha no
  // celular em vez de esticar o e-mail para o lado.
  const chips = etapas.map(([nome, n]) => `
    <table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0">
      <tr>
        <td style="padding:0 6px 6px 0">
          <span style="display:inline-block;padding:5px 11px;border-radius:100px;background:#F7F6F3;
                       border:1px solid #E8E7E2;font-size:12px;line-height:1.3;color:#3C3C39;white-space:nowrap">
            <strong style="color:#121316;font-weight:800">${n}</strong> ${esc(nome)}
          </span>
        </td>
      </tr>
    </table>`).join('');
  return `<div style="margin:0 0 18px">${chips}</div>`;
}

function blocoDoGrupo(nome: string, total: number, avisos: AvisoDeEtapa[]): string {
  const linhas = avisos.map(a => {
    const miudo = [a.detalhe, a.autor ? `movido por ${a.autor}` : ''].filter(Boolean).join(' | ');
    return `
      <tr>
        <td style="padding:9px 0;border-top:1px solid #EFEEE9;vertical-align:top">
          <a href="${esc(linkDoCartao(a))}" style="font-size:14px;line-height:1.45;font-weight:700;color:#121316;
             text-decoration:none">${esc(a.titulo)}</a>
          ${miudo ? `<div style="margin-top:2px;font-size:12px;line-height:1.45;color:#8B887F">${esc(miudo)}</div>` : ''}
        </td>
        <td align="right" style="padding:9px 0 9px 12px;border-top:1px solid #EFEEE9;vertical-align:top;
                   white-space:nowrap;font-size:12px;line-height:1.6;font-weight:700;color:#5B5B57">${esc(a.etapa)}</td>
      </tr>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">
    <tr>
      <td colspan="2" style="padding:0 0 6px;font-family:${FONTE_EMAIL};font-size:12px;font-weight:800;
                 letter-spacing:.06em;text-transform:uppercase;color:#121316">
        ${esc(nome)} <span style="font-weight:600;color:#9A968C">${total}</span>
      </td>
    </tr>${linhas}
  </table>`;
}
