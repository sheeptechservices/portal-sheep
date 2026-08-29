// Motor de cálculo do adiantamento de recebíveis - porta fiel da função
// `calcular` do "DUX Gerador de Propostas" (app.py), para que a simulação feita
// aqui bata centavo a centavo com a proposta gerada por lá.
//
// Regra: taxa mensal ÷ 30 = taxa diária; a taxa do período é a diária vezes os
// dias corridos entre a antecipação e o vencimento, arredondada a 2 casas em
// pontos percentuais (é o que a planilha original faz). O deságio incide sobre
// o valor da parcela e o líquido é o que sobra.
import { isBusinessDay } from './businessDays';

export interface ParcelaSimulada {
  n: number;
  /** Valor bruto da parcela */
  valor: number;
  /** Data de vencimento (ISO yyyy-mm-dd) */
  vencimento: string;
  /** Dias corridos entre a antecipação e o vencimento */
  dias: number;
  /** Taxa do período, em fração (0.0374 = 3,74%) */
  taxa: number;
  /** Deságio da parcela */
  juros: number;
  /** Valor líquido da parcela */
  liquido: number;
  /** Vencimento cai em dia útil? */
  diaUtil: boolean;
}

export interface ResultadoSimulacao {
  parcelas: ParcelaSimulada[];
  totalBruto: number;
  totalJuros: number;
  totalLiquido: number;
  taxaMensalPct: number;
  taxaDiariaPct: number;
  /** Deságio total sobre o bruto, em % - leitura rápida do custo da operação */
  desagioPct: number;
}

/** Dias corridos entre duas datas ISO (b - a). */
export function diasEntre(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}

/**
 * Arredonda para 2 casas decimais meio-para-cima, como o Excel.
 * (O Python usa banker's rounding em `round`, mas o comentário do original diz
 * explicitamente que o objetivo é reproduzir a planilha.)
 */
function round2(v: number): number {
  const s = Math.sign(v);
  // O epsilon corrige casos como 1.005 que em float é 1.00499999…
  return s * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

export interface EntradaSimulacao {
  /** Data em que o dinheiro é adiantado (ISO) */
  dataAntecipacao: string;
  /** Taxa mensal em % (3.5 = 3,5% a.m.) */
  taxaMensalPct: number;
  /** Uma entrada por parcela; o valor é o bruto daquela parcela */
  parcelas: { vencimento: string; valor: number }[];
}

export function simular(entrada: EntradaSimulacao): ResultadoSimulacao {
  const { dataAntecipacao, taxaMensalPct } = entrada;
  const taxaDiaria = taxaMensalPct / 100 / 30;

  // Mesma ordenação do original: sempre crescente por vencimento, levando o
  // valor junto quando as parcelas têm valores diferentes.
  const ordenadas = [...entrada.parcelas]
    .filter(p => p.vencimento)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const parcelas: ParcelaSimulada[] = ordenadas.map((p, i) => {
    const dias = diasEntre(dataAntecipacao, p.vencimento);
    // Arredonda em pontos percentuais, não em fração - igual à planilha
    const taxa = round2(dias * taxaDiaria * 100) / 100;
    const juros = p.valor * taxa;
    return {
      n: i + 1,
      valor: p.valor,
      vencimento: p.vencimento,
      dias,
      taxa,
      juros,
      liquido: p.valor - juros,
      diaUtil: isBusinessDay(p.vencimento),
    };
  });

  const totalBruto = parcelas.reduce((s, p) => s + p.valor, 0);
  const totalJuros = parcelas.reduce((s, p) => s + p.juros, 0);

  return {
    parcelas,
    totalBruto,
    totalJuros,
    totalLiquido: totalBruto - totalJuros,
    taxaMensalPct,
    taxaDiariaPct: taxaDiaria * 100,
    desagioPct: totalBruto > 0 ? (totalJuros / totalBruto) * 100 : 0,
  };
}

// ── Formatação (espelha os helpers fmt_* do original) ────────────────────────

export function fmtMoeda(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Percentual com 2 a 4 casas, sem zeros à direita - igual a `fmt_pct_auto`. */
export function fmtPctAuto(v: number): string {
  let s = v.toFixed(4).replace(/0+$/, '');
  const dot = s.indexOf('.');
  if (dot !== -1 && s.length - dot - 1 < 2) s = v.toFixed(2);
  if (s.endsWith('.')) s = v.toFixed(2);
  return s.replace('.', ',') + '%';
}

export function fmtPct(v: number, casas = 2): string {
  return v.toFixed(casas).replace('.', ',') + '%';
}

export function fmtDataCurta(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "05/jan a 12/fev" - mesmo formato da coluna Intervalo da proposta. */
export function fmtIntervalo(inicioIso: string, fimIso: string): string {
  if (!inicioIso || !fimIso) return '';
  const [, mi, di] = inicioIso.split('-');
  const [, mf, df] = fimIso.split('-');
  return `${di}/${MESES_ABREV[Number(mi) - 1]} a ${df}/${MESES_ABREV[Number(mf) - 1]}`;
}
