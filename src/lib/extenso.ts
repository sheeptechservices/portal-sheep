// ─────────────────────────────────────────────────────────────────────────────
//  Valor por extenso, em reais.
//
//  Contrato escreve o valor duas vezes - "R$ 5.800,00 (cinco mil e oitocentos
//  reais)" - e é a segunda que vale se as duas discordarem. Escrever à mão é
//  onde o erro entra, então ela sai daqui.
// ─────────────────────────────────────────────────────────────────────────────

const UNIDADES = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
  'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos',
];

/** Um grupo de até três dígitos: 0 a 999. */
function ateNovecentos(n: number): string {
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

const ESCALAS: [number, string, string][] = [
  [1_000_000_000, 'bilhão', 'bilhões'],
  [1_000_000, 'milhão', 'milhões'],
  [1_000, 'mil', 'mil'],
];

/** Um inteiro por extenso, sem a moeda. */
function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const partes: string[] = [];
  let resto = n;
  for (const [valor, singular, plural] of ESCALAS) {
    const quantos = Math.floor(resto / valor);
    if (!quantos) continue;
    resto -= quantos * valor;
    // "mil" não leva o "um" na frente: mil e quinhentos, e não um mil.
    partes.push(valor === 1_000 && quantos === 1
      ? 'mil'
      : `${ateNovecentos(quantos)} ${quantos === 1 ? singular : plural}`);
  }
  if (resto) partes.push(ateNovecentos(resto));

  // O "e" só liga o último grupo quando ele é pequeno ou redondo: "mil e
  // oitocentos", mas "mil, oitocentos e cinquenta".
  if (partes.length < 2) return partes.join('');
  const ultimo = partes[partes.length - 1];
  const anteriores = partes.slice(0, -1).join(', ');
  const pequeno = resto > 0 && (resto < 100 || resto % 100 === 0);
  return `${anteriores}${pequeno ? ' e ' : ', '}${ultimo}`;
}

/**
 * O valor como o contrato o escreve: "cinco mil e oitocentos reais".
 * Centavos entram só quando existem.
 */
export function reaisPorExtenso(valor: number): string {
  const centavosTotais = Math.round(Math.abs(valor) * 100);
  const inteiros = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;

  const partes: string[] = [];
  if (inteiros || !centavos) {
    // Milhão e bilhão redondos pedem a preposição: "um milhão DE reais".
    const redondo = inteiros >= 1_000_000 && inteiros % 1_000_000 === 0;
    partes.push(`${inteiroPorExtenso(inteiros)} ${redondo ? 'de ' : ''}${inteiros === 1 ? 'real' : 'reais'}`);
  }
  if (centavos) {
    partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return partes.join(' e ');
}

/** "R$ 5.800,00" - o mesmo número, em algarismo. */
export function reaisEmNumero(valor: number): string {
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
