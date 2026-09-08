// ─────────────────────────────────────────────────────────────────────────────
//  Máscaras de digitação: CPF, CNPJ, CEP, RG e dinheiro.
//
//  Todas seguem a mesma regra - recebem o que está no campo, devolvem o que deve
//  ficar nele. Nenhuma recusa tecla: quem está no meio de digitar vê o número
//  incompleto tomando forma, e não um campo que trava. A validação, quando
//  houver, é assunto de quem grava, não da máscara.
// ─────────────────────────────────────────────────────────────────────────────

const digitos = (v: string) => v.replace(/\D/g, '');

/** 000.000.000-00 */
export function mascaraCpf(v: string): string {
  const d = digitos(v).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** 00.000.000/0000-00 */
export function mascaraCnpj(v: string): string {
  const d = digitos(v).slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** 00.000-000, que é como o cartão CNPJ imprime. */
export function mascaraCep(v: string): string {
  const d = digitos(v).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}`;
}

/**
 * RG não tem formato nacional: cada estado emite o seu, com contagens
 * diferentes e às vezes uma letra no fim. Por isso a máscara aqui é leve e
 * segue o costume de escrita, sem impor um formato:
 *
 *   até 8 caracteres  agrupa de três em três a partir da direita - 3.705.450
 *   9 ou mais         o padrão paulista, com dígito verificador - 12.345.678-9
 *
 * Letra é preservada (o "X" de verificador existe), e nada é recusado.
 */
export function mascaraRg(v: string): string {
  const c = v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 10);
  if (c.length <= 3) return c;
  if (c.length >= 9) {
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}-${c.slice(8)}`;
  }
  // De trás para a frente: o grupo curto fica na frente, como em 3.705.450.
  const partes: string[] = [];
  for (let fim = c.length; fim > 0; fim -= 3) {
    partes.unshift(c.slice(Math.max(0, fim - 3), fim));
  }
  return partes.join('.');
}

/** Centavos do que foi digitado: "R$ 5.800,00" e "580000" chegam no mesmo lugar. */
export const emCentavos = (v: string) => Number(digitos(v) || 0);

/** "R$ 5.800,00". Campo vazio continua vazio, para o placeholder aparecer. */
export function mascaraMoeda(v: string): string {
  const c = emCentavos(v);
  if (!c) return '';
  return `R$ ${(c / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}
