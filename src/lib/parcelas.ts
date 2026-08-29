// Distribuição de parcelas (compartilhado entre o formulário público e o admin).
export type Periodicidade = 'mensal' | 'quinzenal' | 'bimestral' | 'personalizada';
export interface ParcelaCalc { valor: string; valorNumerico: number; vencimento: string }

export function isoAddDays(iso: string, n: number): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function isoAddMonths(iso: string, n: number): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return dt.toISOString().slice(0, 10);
}

// Divide `total` em `n` parcelas iguais (resto de centavos vai nas primeiras) e
// calcula os vencimentos a partir de `primeiroVenc` conforme a periodicidade.
export function distribuirParcelas(
  total: number, n: number, primeiroVenc: string,
  periodicidade: Periodicidade, intervaloDias: number,
): ParcelaCalc[] {
  if (n < 1) return [];
  const centsTotal = Math.round((total || 0) * 100);
  const base = Math.floor(centsTotal / n);
  const rem = centsTotal - base * n;
  const stepMonths = periodicidade === 'mensal' ? 1 : periodicidade === 'bimestral' ? 2 : 0;
  const stepDays = periodicidade === 'quinzenal' ? 15 : periodicidade === 'personalizada' ? (intervaloDias || 0) : 0;
  return Array.from({ length: n }, (_, i) => {
    const v = (base + (i < rem ? 1 : 0)) / 100;
    const vencimento = primeiroVenc
      ? (stepMonths ? isoAddMonths(primeiroVenc, stepMonths * i) : isoAddDays(primeiroVenc, stepDays * i))
      : '';
    return { valor: v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), valorNumerico: v, vencimento };
  });
}
