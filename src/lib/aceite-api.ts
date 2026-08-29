import type { Operacao, Aceitante, Anexo, EmailHistoryEntry, TipoOperacao } from './aceite-storage';

export type { Operacao, Aceitante, Anexo, EmailHistoryEntry, TipoOperacao };

const BASE = '/api/admin-data';

function adminHeaders(token: string) {
  return { 'Content-Type': 'application/json', 'x-admin-session': token };
}

function rowToOperacao(row: Record<string, any>): Operacao {
  return {
    id: String(row.id),
    token: String(row.token),
    tipo: (row.tipo ?? 'ACEITE_SACADO') as TipoOperacao,
    status: row.status as Operacao['status'],
    nomeCedente: String(row.nome_cedente ?? ''),
    cnpjCedente: String(row.cnpj_cedente ?? ''),
    emailCedente: String(row.email_cedente ?? ''),
    emailCedenteResponsavel: row.email_cedente_responsavel != null ? String(row.email_cedente_responsavel) : undefined,
    emailHistory: row.email_history ? JSON.parse(String(row.email_history)) : undefined,
    nomeSacado: String(row.nome_sacado ?? ''),
    cnpjSacado: String(row.cnpj_sacado ?? ''),
    numeroNF: row.numero_nf != null ? String(row.numero_nf) : undefined,
    dataEmissaoNF: row.data_emissao_nf != null ? String(row.data_emissao_nf) : undefined,
    valorNF: row.valor_nf != null ? Number(row.valor_nf) : undefined,
    vencimento: row.vencimento != null ? String(row.vencimento) : undefined,
    periodoServico: row.periodo_servico != null ? String(row.periodo_servico) : undefined,
    parcelas: row.parcelas ? JSON.parse(String(row.parcelas)) : undefined,
    bancoNome: row.banco_nome != null ? String(row.banco_nome) : undefined,
    titularConta: row.titular_conta != null ? String(row.titular_conta) : undefined,
    cnpjTitular: row.cnpj_titular != null ? String(row.cnpj_titular) : undefined,
    agencia: row.agencia != null ? String(row.agencia) : undefined,
    conta: row.conta != null ? String(row.conta) : undefined,
    tokenExpiresAt: String(row.token_expires_at),
    criadoEm: String(row.criado_em),
    link: `${window.location.origin}/aceite/${String(row.token)}`,
    aceitante: row.aceitante ? JSON.parse(String(row.aceitante)) : undefined,
  };
}

function rowToAnexo(row: Record<string, any>): Anexo {
  return {
    id: String(row.id),
    operacaoId: String(row.operacao_id),
    nome: String(row.nome),
    tipo: String(row.tipo),
    tamanho: Number(row.tamanho),
    dataUrl: String(row.data_url),
    criadoEm: String(row.criado_em),
  };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export async function getOperacoesApi(token: string): Promise<Operacao[]> {
  const res = await fetch(`${BASE}?action=list_aceite_operacoes`, { headers: { 'x-admin-session': token } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return (data.operacoes ?? []).map(rowToOperacao);
}

export async function createOperacaoApi(
  adminToken: string,
  solicitacaoId: string,
  data: Omit<Operacao, 'id' | 'token' | 'status' | 'tokenExpiresAt' | 'criadoEm' | 'link' | 'aceitante'>
): Promise<Operacao> {
  const body = {
    action: 'create_aceite_operacao',
    solicitacao_id: solicitacaoId,
    tipo: data.tipo,
    nome_cedente: data.nomeCedente,
    cnpj_cedente: data.cnpjCedente,
    email_cedente: data.emailCedente ?? null,
    email_cedente_responsavel: data.emailCedenteResponsavel ?? null,
    nome_sacado: data.nomeSacado,
    cnpj_sacado: data.cnpjSacado ?? null,
    numero_nf: data.numeroNF ?? null,
    data_emissao_nf: data.dataEmissaoNF ?? null,
    valor_nf: data.valorNF ?? null,
    vencimento: data.vencimento ?? null,
    periodo_servico: data.periodoServico ?? null,
    parcelas: data.parcelas ? JSON.stringify(data.parcelas) : null,
    banco_nome: data.bancoNome ?? null,
    titular_conta: data.titularConta ?? null,
    cnpj_titular: data.cnpjTitular ?? null,
    agencia: data.agencia ?? null,
    conta: data.conta ?? null,
  };
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  return rowToOperacao(d.operacao);
}

export async function updateStatusApi(adminToken: string, id: string, status: Operacao['status']): Promise<void> {
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ action: 'update_aceite_status', id, status }) });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function reenviarApi(adminToken: string, id: string): Promise<Operacao> {
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ action: 'reenviar_aceite', id }) });
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  return rowToOperacao(d.operacao);
}

export async function addEmailHistoryApi(adminToken: string, id: string, entries: EmailHistoryEntry[]): Promise<void> {
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ action: 'add_aceite_email_history', id, entries }) });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function deleteOperacaoApi(adminToken: string, id: string): Promise<void> {
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ action: 'delete_aceite_operacao', id }) });
  if (!res.ok) throw new Error(`${res.status}`);
}

export async function getAnexosByOperacaoApi(adminToken: string, operacaoId: string): Promise<Anexo[]> {
  const res = await fetch(`${BASE}?action=get_aceite_anexos&operacao_id=${encodeURIComponent(operacaoId)}`, { headers: { 'x-admin-session': adminToken } });
  if (!res.ok) throw new Error(`${res.status}`);
  const data = await res.json();
  return (data.anexos ?? []).map(rowToAnexo);
}

export async function addAnexoApi(adminToken: string, operacaoId: string, file: File): Promise<Anexo> {
  const dataUrl = await fileToDataUrl(file);
  const body = { action: 'add_aceite_anexo', operacao_id: operacaoId, nome: file.name, tipo: file.type, tamanho: file.size, data_url: dataUrl };
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status}`);
  const d = await res.json();
  return rowToAnexo(d.anexo);
}

export async function deleteAnexoApi(adminToken: string, id: string): Promise<void> {
  const res = await fetch(BASE, { method: 'POST', headers: adminHeaders(adminToken), body: JSON.stringify({ action: 'delete_aceite_anexo', id }) });
  if (!res.ok) throw new Error(`${res.status}`);
}
