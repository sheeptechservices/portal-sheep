// ─────────────────────────────────────────────────────────────────────────────
//  Evolution API: o WhatsApp da casa, num número separado.
//
//  A integração é três coisas, guardadas juntas no cofre: o endereço do
//  servidor da Evolution, o nome da instância (o número) e a chave da API. A
//  chave vai cifrada como segredo; o endereço e a instância vão nos metadados.
//
//  A Evolution tem duas linhas de versão em uso (v1 e v2), que respondem igual
//  ao que este módulo pergunta, exceto no corpo do envio de texto: o envio
//  tenta o formato da v2 e, recusado, o da v1. Quem chama não precisa saber
//  qual das duas está do outro lado.
// ─────────────────────────────────────────────────────────────────────────────
import type { Client } from '@libsql/client';
import { getIntegrationCredential } from './_credentials.js';

/** Identificador da Evolution no cofre. */
export const EVOLUTION_KEY = 'evolution';

export interface ConfigEvolution {
  /** Endereço do servidor, sem barra no fim: https://evolution.exemplo.com */
  url: string;
  instancia: string;
  apikey: string;
}

/** Estado da instância: `open` é o número pareado e pronto para enviar. */
export type EstadoEvolution = 'open' | 'close' | 'connecting' | string;

/** O endereço como a Evolution espera: com protocolo, sem barra no fim. */
export function normalizarUrl(cru: string): string | null {
  const t = String(cru ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/]+/i.test(t)) return null;
  try { new URL(t); } catch { return null; }
  return t;
}

/** A configuração salva, ou nula se a integração não foi feita. */
export async function configEvolution(db: Client): Promise<ConfigEvolution | null> {
  const cred = await getIntegrationCredential(db, EVOLUTION_KEY).catch(() => null);
  const url = normalizarUrl(String(cred?.meta?.url ?? ''));
  const instancia = String(cred?.meta?.instancia ?? '').trim();
  if (!cred?.value || !url || !instancia) return null;
  return { url, instancia, apikey: cred.value };
}

/** Uma ida à Evolution, com a chave no cabeçalho e um teto de tempo. O erro
 *  volta em português, dizendo o que conferir. */
async function chamar(cfg: ConfigEvolution, caminho: string, init: { method?: string; body?: unknown } = {})
  : Promise<{ ok: true; dados: any } | { ok: false; status: number; erro: string }> {
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${caminho}`, {
      method: init.method ?? 'GET',
      headers: { apikey: cfg.apikey, 'Content-Type': 'application/json' },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    const tempo = (e as Error)?.name === 'TimeoutError';
    return {
      ok: false, status: 0,
      erro: tempo
        ? 'A Evolution não respondeu a tempo. Confira se o servidor está no ar.'
        : 'Não foi possível chegar ao servidor da Evolution. Confira o endereço.',
    };
  }
  const dados = await res.json().catch(() => null);
  if (res.ok) return { ok: true, dados };
  const daApi = typeof dados?.response?.message === 'string' ? dados.response.message
    : Array.isArray(dados?.response?.message) ? dados.response.message.join(' ')
      : typeof dados?.message === 'string' ? dados.message : null;
  const erro = res.status === 401 || res.status === 403
    ? 'A Evolution recusou a chave da API.'
    : res.status === 404
      ? `A instância "${cfg.instancia}" não existe nesse servidor.`
      : daApi ? `A Evolution respondeu: ${daApi}` : `A Evolution respondeu com erro ${res.status}.`;
  return { ok: false, status: res.status, erro };
}

/** O estado da instância. É a checagem de que endereço, chave e instância
 *  conferem: qualquer um dos três errado e ela falha. */
export async function estadoDaInstancia(cfg: ConfigEvolution)
  : Promise<{ ok: true; estado: EstadoEvolution } | { ok: false; erro: string }> {
  const r = await chamar(cfg, `/instance/connectionState/${encodeURIComponent(cfg.instancia)}`);
  if (!r.ok) return { ok: false, erro: r.erro };
  const estado = r.dados?.instance?.state ?? r.dados?.state ?? 'close';
  return { ok: true, estado: String(estado) };
}

/** O número e o nome do perfil pareados na instância, quando a Evolution diz.
 *  Só enfeite da tela: falhar aqui não derruba nada. */
export async function perfilDaInstancia(cfg: ConfigEvolution): Promise<{ numero: string | null; nome: string | null }> {
  const r = await chamar(cfg, `/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instancia)}`);
  if (!r.ok) return { numero: null, nome: null };
  const lista = Array.isArray(r.dados) ? r.dados : [r.dados];
  const item = lista.find((x: any) => (x?.name ?? x?.instance?.instanceName) === cfg.instancia) ?? lista[0];
  const dono = String(item?.ownerJid ?? item?.instance?.owner ?? item?.owner ?? '');
  const numero = dono.split('@')[0].replace(/\D/g, '') || null;
  const nome = item?.profileName ?? item?.instance?.profileName ?? null;
  return { numero, nome: nome ? String(nome) : null };
}

/** O QR para parear o número, ou o aviso de que ele já está pareado. */
export async function qrDaInstancia(cfg: ConfigEvolution)
  : Promise<{ ok: true; qr: string | null; codigo: string | null; conectado: boolean } | { ok: false; erro: string }> {
  const r = await chamar(cfg, `/instance/connect/${encodeURIComponent(cfg.instancia)}`);
  if (!r.ok) return { ok: false, erro: r.erro };
  const d = r.dados ?? {};
  if (d?.instance?.state === 'open') return { ok: true, qr: null, codigo: null, conectado: true };
  const base64 = typeof d.base64 === 'string' ? d.base64 : typeof d.qrcode?.base64 === 'string' ? d.qrcode.base64 : null;
  const qr = base64 ? (base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`) : null;
  const codigo = typeof d.pairingCode === 'string' ? d.pairingCode : null;
  // Sem QR e sem código a tela não tem o que mostrar. Na Evolution 2.2.x isso
  // costuma vir como `{"count":0}`: a versão do WhatsApp Web que ela embute
  // ficou velha, e o WhatsApp não entrega mais o QR. O motivo vai para a tela,
  // com o que a Evolution respondeu, em vez de uma espera sem fim.
  if (!qr && !codigo) {
    const resposta = JSON.stringify(d).slice(0, 160);
    return {
      ok: false,
      erro: d?.count === 0
        ? `A Evolution não gerou o QR (respondeu ${resposta}). Isso acontece quando a versão dela está desatualizada: atualize a Evolution no servidor.`
        : `A Evolution não gerou o QR. Ela respondeu: ${resposta}`,
    };
  }
  return { ok: true, qr, codigo, conectado: false };
}

/** O destino como a Evolution espera: número com DDI, ou o id do grupo. Um
 *  número brasileiro escrito com DDD e sem o 55 ganha o 55. */
export function normalizarDestino(cru: string): string | null {
  const t = String(cru ?? '').trim();
  if (/@g\.us$/.test(t)) return t;
  const d = t.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if (d.length >= 12 && d.length <= 15) return d;
  return null;
}

/** Envia um texto a um número ou grupo. Tenta o corpo da v2 e, recusado com
 *  400, o da v1. */
export async function enviarTexto(cfg: ConfigEvolution, destino: string, texto: string)
  : Promise<{ ok: true } | { ok: false; erro: string }> {
  const caminho = `/message/sendText/${encodeURIComponent(cfg.instancia)}`;
  const v2 = await chamar(cfg, caminho, { method: 'POST', body: { number: destino, text: texto } });
  if (v2.ok) return { ok: true };
  if (v2.status !== 400) return { ok: false, erro: v2.erro };
  const v1 = await chamar(cfg, caminho, {
    method: 'POST', body: { number: destino, options: { delay: 0 }, textMessage: { text: texto } },
  });
  return v1.ok ? { ok: true } : { ok: false, erro: v1.erro };
}
