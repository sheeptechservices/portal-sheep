const LS_KEY = 'dux_aceite_operacoes';
const LS_KEY_ANEXOS = 'dux_aceite_anexos';

export interface Anexo {
  id: string;
  operacaoId: string;
  nome: string;
  tipo: string;
  tamanho: number;
  dataUrl: string;
  criadoEm: string;
}

function getAnexosAll(): Anexo[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY_ANEXOS) ?? '[]'); }
  catch { return []; }
}

function saveAnexos(list: Anexo[]) {
  localStorage.setItem(LS_KEY_ANEXOS, JSON.stringify(list));
}

export function getAnexosByOperacao(operacaoId: string): Anexo[] {
  return getAnexosAll().filter(a => a.operacaoId === operacaoId);
}

export async function addAnexo(operacaoId: string, file: File): Promise<Anexo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const anexo: Anexo = {
        id: crypto.randomUUID(),
        operacaoId,
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        dataUrl: reader.result as string,
        criadoEm: new Date().toISOString(),
      };
      const all = getAnexosAll();
      all.push(anexo);
      saveAnexos(all);
      resolve(anexo);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
    reader.readAsDataURL(file);
  });
}

export function removeAnexo(id: string): void {
  saveAnexos(getAnexosAll().filter(a => a.id !== id));
}

export type TipoOperacao = 'ACEITE_SACADO' | 'TERMO_ANUENCIA';

export interface Operacao {
  id: string;
  token: string;
  tipo?: TipoOperacao;
  status: 'PENDENTE' | 'ACEITO' | 'RECUSADO' | 'EXPIRADO';
  nomeCedente: string;
  cnpjCedente: string;
  emailCedente: string;
  emailCedenteResponsavel?: string;
  emailHistory?: EmailHistoryEntry[];
  nomeSacado: string;
  cnpjSacado: string;
  numeroNF?: string;
  dataEmissaoNF?: string;
  valorNF?: number;
  vencimento?: string;
  periodoServico?: string;
  parcelas?: Array<{ valor: string; valorNumerico: number; vencimento: string }>;
  bancoNome?: string;
  titularConta?: string;
  cnpjTitular?: string;
  agencia?: string;
  conta?: string;
  tokenExpiresAt: string;
  criadoEm: string;
  link: string;
  aceitante?: Aceitante;
}

export interface Aceitante {
  nome: string;
  cpf: string;
  cargo: string;
  protocolo: string;
  aceitoEm: string;
  d4signDocUUID?: string;
  assinaturaDataUrl?: string;
  fotoIdentidadeDataUrl?: string;
}

export interface EmailHistoryEntry {
  address: string;
  label: string;
  sentAt: string;
  success: boolean;
  error?: string;
}

function generateToken(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function getOperacoes(): Operacao[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'); }
  catch { return []; }
}

function save(ops: Operacao[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ops));
}

export function getByToken(token: string): Operacao | null {
  return getOperacoes().find(o => o.token === token) ?? null;
}

export function getById(id: string): Operacao | null {
  return getOperacoes().find(o => o.id === id) ?? null;
}

export function createOperacao(data: Omit<Operacao, 'id' | 'token' | 'status' | 'tokenExpiresAt' | 'criadoEm' | 'link' | 'aceitante'>): Operacao {
  const ops = getOperacoes();
  const token = generateToken();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const op: Operacao = {
    ...data,
    id, token, status: 'PENDENTE',
    tokenExpiresAt: expiresAt,
    criadoEm: now,
    link: `${window.location.origin}/aceite/${token}`,
  };
  save([op, ...ops]);
  return op;
}

export function updateStatus(id: string, status: Operacao['status']): void {
  const ops = getOperacoes();
  const idx = ops.findIndex(o => o.id === id);
  if (idx === -1) return;
  ops[idx] = { ...ops[idx], status };
  save(ops);
}

export function reenviar(id: string): Operacao | null {
  const ops = getOperacoes();
  const idx = ops.findIndex(o => o.id === id);
  if (idx === -1) return null;
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  ops[idx] = {
    ...ops[idx], token, status: 'PENDENTE',
    tokenExpiresAt: expiresAt,
    link: `${window.location.origin}/aceite/${token}`,
    aceitante: undefined,
  };
  save(ops);
  return ops[idx];
}

export function addEmailHistory(id: string, entries: EmailHistoryEntry[]): void {
  const ops = getOperacoes();
  const idx = ops.findIndex(o => o.id === id);
  if (idx === -1) return;
  ops[idx] = { ...ops[idx], emailHistory: [...(ops[idx].emailHistory ?? []), ...entries] };
  save(ops);
}

export function deleteOperacao(id: string): void {
  save(getOperacoes().filter(o => o.id !== id));
  saveAnexos(getAnexosAll().filter(a => a.operacaoId !== id));
}

export function registerAceite(token: string, data: { nome: string; cpf: string; cargo: string; d4signDocUUID?: string; assinaturaDataUrl?: string; fotoIdentidadeDataUrl?: string }): Aceitante | null {
  const ops = getOperacoes();
  const idx = ops.findIndex(o => o.token === token);
  if (idx === -1) return null;
  const op = ops[idx];
  const protocolo = `FIDC-${new Date().getFullYear()}-${op.id.slice(-8).toUpperCase()}`;
  const aceitante: Aceitante = { ...data, protocolo, aceitoEm: new Date().toISOString() };
  ops[idx] = { ...op, status: 'ACEITO', aceitante };
  save(ops);
  return aceitante;
}

export function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

export function formatCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

export function formatBRL(cents: string): string {
  const d = cents.replace(/\D/g, '');
  if (!d) return '';
  return (parseInt(d, 10) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseBRL(formatted: string): number {
  return parseFloat(formatted.replace(/\D/g, '')) / 100 || 0;
}

export function formatDate(iso: string): string {
  if (!iso) return '-';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatBRLValue(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
