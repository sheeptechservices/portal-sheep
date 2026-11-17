// ─────────────────────────────────────────────────────────────────────────────
//  Dias úteis e feriados nacionais.
//
//  Fonte única dos feriados da casa: o prazo que o servidor dá a um chamado e
//  o "Feriado" que o calendário (`DatePicker`) marca saem desta mesma lista, e
//  é por isso que ela mora aqui, sem dependência nenhuma - o servidor importa
//  como sempre, e a tela importa por caminho relativo, que o Vite empacota.
//
//  Datas como texto `AAAA-MM-DD` e conta em UTC: o dia é o dia do calendário,
//  e fuso nenhum o empurra para o dia de antes.
// ─────────────────────────────────────────────────────────────────────────────

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), base dos móveis. */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const chave = (d: Date) => d.toISOString().slice(0, 10);
const somar = (d: Date, dias: number) => new Date(d.getTime() + dias * 86_400_000);

const porAno = new Map<number, Set<string>>();

/** Os feriados nacionais do ano, como `AAAA-MM-DD`. Os fixos da lei e os
 *  móveis que a casa não trabalha: Carnaval, Sexta-feira Santa, Páscoa e
 *  Corpus Christi. */
export function feriadosNacionais(ano: number): Set<string> {
  const pronto = porAno.get(ano);
  if (pronto) return pronto;
  const s = new Set<string>();
  const fixos: [number, number][] = [
    [1, 1],   // Confraternização Universal
    [4, 21],  // Tiradentes
    [5, 1],   // Dia do Trabalho
    [9, 7],   // Independência do Brasil
    [10, 12], // Nossa Senhora Aparecida
    [11, 2],  // Finados
    [11, 15], // Proclamação da República
    [11, 20], // Consciência Negra
    [12, 25], // Natal
  ];
  for (const [m, d] of fixos) s.add(`${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const p = pascoa(ano);
  s.add(chave(somar(p, -48))); // Segunda de Carnaval
  s.add(chave(somar(p, -47))); // Terça de Carnaval
  s.add(chave(somar(p, -2)));  // Sexta-feira Santa
  s.add(chave(p));             // Páscoa
  s.add(chave(somar(p, 60)));  // Corpus Christi
  porAno.set(ano, s);
  return s;
}

/** O dia `AAAA-MM-DD` é feriado nacional. */
export function ehFeriadoNacional(dia: string): boolean {
  return feriadosNacionais(Number(dia.slice(0, 4))).has(dia.slice(0, 10));
}

/** O dia `AAAA-MM-DD` é útil: nem sábado, nem domingo, nem feriado. */
export function ehDiaUtil(dia: string): boolean {
  const semana = new Date(`${dia.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return semana !== 0 && semana !== 6 && !ehFeriadoNacional(dia);
}

/** `n` dias úteis depois do dia dado, sem contar o próprio dia. Segunda mais
 *  dois é quarta; sexta mais dois é terça. */
export function somarDiasUteis(dia: string, n: number): string {
  let d = new Date(`${dia.slice(0, 10)}T00:00:00Z`);
  let faltam = n;
  while (faltam > 0) {
    d = somar(d, 1);
    if (ehDiaUtil(chave(d))) faltam--;
  }
  return chave(d);
}

/** O dia do calendário em Brasília: um pedido às 22h de segunda é de segunda,
 *  e não da terça que já é em UTC. */
export function diaEmBrasilia(instante: Date | string = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(instante));
}

/** Dias úteis que um chamado recebido tem, de saída, até o prazo. */
export const DIAS_UTEIS_DO_CHAMADO = 2;

/** O prazo de partida de um chamado recebido em `instante`: dois dias úteis
 *  depois do dia do pedido, em Brasília. O time pode mudar na tarefa. */
export function prazoDoChamado(instante: Date | string = new Date()): string {
  return somarDiasUteis(diaEmBrasilia(instante), DIAS_UTEIS_DO_CHAMADO);
}
