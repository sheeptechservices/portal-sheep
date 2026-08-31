// Peças comuns do Gerador de Contratos, usadas tanto pela tela de proposta
// avulsa quanto pela de lote. Só função pura aqui - nada de React, nada de rede.
import { isBusinessDay, nextBusinessDay } from './businessDays';

export type Marca = 'dux' | 'prematch';
export type TipoDoc = 'nf' | 'fatura' | 'nota_debito' | 'contrato' | 'ordem_servico';

export const MAX_PARCELAS = 24;
export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const TIPOS_DOC: { valor: TipoDoc; label: string }[] = [
  { valor: 'nf', label: 'Nota fiscal' },
  { valor: 'fatura', label: 'Fatura' },
  { valor: 'nota_debito', label: 'Nota de débito' },
  { valor: 'contrato', label: 'Contrato' },
  { valor: 'ordem_servico', label: 'Ordem de serviço' },
];

/** Rótulo do número do documento, que muda com o lastro escolhido. */
export function rotuloNumeroDoc(tipo: TipoDoc): string {
  if (tipo === 'contrato') return 'Número do contrato';
  if (tipo === 'fatura') return 'Número da fatura';
  if (tipo === 'nota_debito') return 'Número da nota de débito';
  if (tipo === 'ordem_servico') return 'Número da OS';
  return 'Número da NF';
}

export function hojeIso(): string { return new Date().toISOString().slice(0, 10); }

export function fmtDocumento(v: string | null | undefined): string {
  const d = String(v ?? '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return String(v ?? '');
}

export function maskPct(v: string): string {
  let s = v.replace(/[^\d,.]/g, '').replace(/\./g, ',');
  const partes = s.split(',');
  if (partes.length > 2) s = partes[0] + ',' + partes.slice(1).join('');
  const [int, dec] = s.split(',');
  return dec !== undefined ? `${int.slice(0, 3)},${dec.slice(0, 4)}` : int.slice(0, 3);
}

export function normalizaPct(v: string): string {
  const n = parseFloat(v.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return v;
  return n.toFixed(4).replace(/(\.\d{2,}?)0+$/, '$1').replace('.', ',');
}

export function parsePct(v: string): number {
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** "05/10/26" ou "05/10/2026" -> ISO. Ano de 2 dígitos vira 20xx. */
export function brParaIso(br: string): string {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!m) return '';
  const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${ano}-${m[2]}-${m[1]}`;
}

/** dd/mm/aaaa a partir do ISO - é assim que a data de emissão vai impressa. */
export function isoParaBr(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Só dígitos, para casar o CNPJ do documento com o do cadastro. */
export function soDigitos(v: string | null | undefined): string {
  return String(v ?? '').replace(/\D/g, '');
}

/** "1.234,56" -> 1234.56 */
export function parseMoedaBR(v: string): number {
  const n = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Empurra vencimento que cai em fim de semana ou feriado para o próximo dia útil.
 * Aplica só no que o sistema preenche (leitura de documento e lead) - data
 * digitada à mão é escolha do analista e fica como está.
 */
export function ajustarParaDiaUtil(datas: string[]): { datas: string[]; ajustes: { de: string; para: string }[] } {
  const ajustes: { de: string; para: string }[] = [];
  const saida = datas.map(iso => {
    if (!iso || isBusinessDay(iso)) return iso;
    const novo = nextBusinessDay(iso);
    if (novo !== iso) ajustes.push({ de: iso, para: novo });
    return novo;
  });
  return { datas: saida, ajustes };
}
