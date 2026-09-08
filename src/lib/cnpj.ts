// ─────────────────────────────────────────────────────────────────────────────
//  O CNPJ: achar um num texto, e conferir se ele é de verdade.
//
//  O verificador é o que separa um número lido de um número inventado - por um
//  OCR que trocou um dígito, por um PDF mal extraído, ou por alguém que digitou
//  errado. Sem ele, um CNPJ quase certo seria consultado, não seria encontrado,
//  e o erro apareceria como "a Receita não tem esta empresa".
// ─────────────────────────────────────────────────────────────────────────────

/** Os dois dígitos verificadores conferem? */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos)) return false;
  // Todos iguais passam na conta, mas não existem: 00.000.000/0000-00.
  if (/^(\d)\1{13}$/.test(digitos)) return false;

  const conta = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(digitos[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return conta(12) === Number(digitos[12]) && conta(13) === Number(digitos[13]);
}

/** Os 14 dígitos na pontuação de sempre. */
export const formatarCnpj = (d: string) =>
  `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;

/**
 * O primeiro CNPJ válido de um texto, já formatado.
 *
 * Duas passadas em duas versões do texto, da mais confiável à menos:
 *
 *   1. o número pontuado, que é como todo documento o imprime;
 *   2. qualquer fileira de 14 dígitos, para quando a pontuação se perdeu.
 *
 * E cada uma roda também no texto sem espaço nenhum, porque o número quase
 * nunca chega inteiro: o pdfjs devolve "50.836. 466/0001- 08" em três pedaços,
 * o Word parte no meio de dois runs e o HTML no meio de duas tags. Vence o
 * primeiro candidato que passa no verificador - e é ele que impede que juntar
 * pedaços solte um número que não existe.
 */
export function acharCnpj(texto: string): string | null {
  const vistos = new Set<string>();
  const tentar = (d: string) => {
    if (vistos.has(d)) return false;
    vistos.add(d);
    return cnpjValido(d);
  };

  for (const versao of [texto, texto.replace(/\s+/g, '')]) {
    for (const m of versao.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)) {
      const d = m[0].replace(/\D/g, '');
      if (tentar(d)) return formatarCnpj(d);
    }
    for (const m of versao.replace(/\D/g, ' ').matchAll(/\d{14,}/g)) {
      // Uma fileira longa pode ter o CNPJ em qualquer ponto dela.
      for (let i = 0; i + 14 <= m[0].length; i++) {
        const d = m[0].slice(i, i + 14);
        if (tentar(d)) return formatarCnpj(d);
      }
    }
  }
  return null;
}

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/** O cadastro público responde em maiúsculas. No contrato isso ficaria
 *  estranho, então a caixa é normalizada - acento a fonte não tem e ninguém
 *  inventa; quem confere o formulário acerta. */
export function titulo(v: string): string {
  return v.toLowerCase().split(/\s+/).map((palavra, i) => {
    if (i > 0 && PARTICULAS.has(palavra)) return palavra;
    // Sigla e número continuam como estão: "LTDA", "260", "CNPJ".
    if (/^\d+$/.test(palavra)) return palavra;
    return palavra.charAt(0).toUpperCase() + palavra.slice(1);
  }).join(' ');
}
