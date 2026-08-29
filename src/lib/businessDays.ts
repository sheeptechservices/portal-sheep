// Dias úteis (Brasil): fins de semana + feriados nacionais (fixos e móveis via Páscoa).
// Usado para preencher vencimentos "a cada N dias" pulando dias não úteis.
import { isoAddDays } from './parcelas';

// Meeus/Jones/Butcher
function easterDate(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31) - 1;
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}
function toISO(d: Date): string { return d.toISOString().slice(0, 10); }
function shift(base: Date, days: number): Date { const d = new Date(base); d.setUTCDate(d.getUTCDate() + days); return d; }

const holidayCache = new Map<number, Set<string>>();
function holidaysOf(year: number): Set<string> {
  if (holidayCache.has(year)) return holidayCache.get(year)!;
  const s = new Set<string>();
  const fixed: [number, number][] = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]];
  for (const [m, d] of fixed) s.add(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const easter = easterDate(year);
  s.add(toISO(shift(easter, -48))); // Segunda de Carnaval
  s.add(toISO(shift(easter, -47))); // Terça de Carnaval
  s.add(toISO(shift(easter, -2)));  // Sexta-feira Santa
  s.add(toISO(easter));             // Páscoa
  s.add(toISO(shift(easter, 60)));  // Corpus Christi
  holidayCache.set(year, s);
  return s;
}

export function isBusinessDay(iso: string): boolean {
  if (!iso) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  if (dow === 0 || dow === 6) return false;              // fim de semana
  return !holidaysOf(y).has(iso);                        // feriado nacional
}

// Avança até o próximo dia útil (inclusive o próprio, se já for útil).
export function nextBusinessDay(iso: string): string {
  let cur = iso;
  for (let i = 0; i < 30 && !isBusinessDay(cur); i++) cur = isoAddDays(cur, 1);
  return cur;
}

// Vencimento a partir de `baseIso` somando `dias`, pulando para o próximo dia útil.
export function vencimentoUtil(baseIso: string, dias: number): string {
  return nextBusinessDay(isoAddDays(baseIso, dias));
}
