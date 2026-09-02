/** Logos dos clientes, fonte única para o carrossel da entrada e para os
 *  seletores de cliente dentro do portal.
 *
 *  `altura` é a altura óptica de cada marca no carrossel: as proporções são
 *  muito diferentes, e altura igual para todas deixaria umas gigantes e outras
 *  minúsculas. Quem consome em outro tamanho escala a partir dela.
 *  `detalhe` marca quem tem desenho interno definido por cor - a concha da
 *  Shell, o texto vazado dos selos da Cheirin Bão e da 300. Nessas a silhueta
 *  chapada apagaria justamente o que identifica a marca.
 *  `fundoEscuro` marca a logo desenhada em branco, para fundo escuro: sobre
 *  claro ela some. O carrossel a escurece no hover; os seletores a escurecem
 *  sempre.
 *  `cor` e `proporcao` andam juntas e só existem em logo de uma cor só: o
 *  arquivo vira máscara e a cor da marca é pintada por trás, o que dispensa
 *  guardar uma versão do arquivo por fundo. A proporção é largura/altura, que a
 *  máscara precisa saber para não deformar. */
export type Marca = {
  nome: string;
  src: string;
  altura: number;
  fundoEscuro?: boolean;
  detalhe?: boolean;
  cor?: string;
  /** Tom para o tema escuro, quando o da marca é fechado demais para ele. */
  corEscura?: string;
  proporcao?: number;
};

export const MARCAS: Marca[] = [
  { nome: 'Vale', src: '/marcas/vale.webp', altura: 32 },
  { nome: 'Shell', src: '/marcas/shell.webp', altura: 42, detalhe: true },
  { nome: 'Prontomed', src: '/marcas/prontomed.webp', altura: 28 },
  { nome: 'Consigo Cred', src: '/marcas/consigo-cred.webp', altura: 28 },
  { nome: 'J17 Bank', src: '/marcas/j17.webp', altura: 34 },
  { nome: 'Cheirin Bão', src: '/marcas/cheirin-bao.webp', altura: 50, detalhe: true },
  { nome: 'bip.', src: '/marcas/bi.webp', altura: 34 },
  { nome: 'Bitka Analytics', src: '/marcas/bitka.webp', altura: 34 },
  { nome: 'Click!', src: '/marcas/click.webp', altura: 32 },
  { nome: '300 Franchising', src: '/marcas/300-f.webp', altura: 34 },
  // Duas cores sobre transparente, recortada do cartao claro do manual: no
  // carrossel vira silhueta como as outras, e nos seletores aparece direto.
  { nome: 'GR2', src: '/marcas/gr2.webp', altura: 26 },
  // Duas cores: o "3" no amarelo da marca e o resto na tinta. O arquivo veio
  // desenhado em branco, para fundo escuro; o branco foi trocado por tinta no
  // próprio arquivo em vez de escurecer a logo inteira por filtro, que apagava
  // o amarelo junto.
  { nome: 'Grupo 3SA', src: '/marcas/grupo-3sa.webp', altura: 28 },
  // Assinatura larga, de uma cor só.
  { nome: 'Orteconte', src: '/marcas/orteconte.webp', altura: 26, cor: '#5B92C8', proporcao: 1536 / 301 },
  // Roxo fechado da marca no claro, e um tom acima no escuro, onde o original
  // se perde no fundo.
  { nome: 'FM Rocket', src: '/marcas/fm-rocket.webp', altura: 28,
    cor: '#5B2C87', corEscura: '#A57BE0', proporcao: 314 / 82 },
];

/** Casa o cliente com a marca pelo nome. Cliente cadastrado à mão não tem logo,
 *  e aí quem chama cai no nome - por isso o retorno é opcional. */
export function marcaDoCliente(nome: string | null | undefined): Marca | undefined {
  if (!nome) return undefined;
  const alvo = nome.trim().toLocaleLowerCase('pt-BR');
  return MARCAS.find(m => m.nome.toLocaleLowerCase('pt-BR') === alvo);
}

/** A logo no formato que os seletores do portal esperam. */
export function logoDoCliente(nome: string | null | undefined) {
  const m = marcaDoCliente(nome);
  return m && {
    src: m.src, altura: m.altura, escurecer: m.fundoEscuro,
    cor: m.cor, corEscura: m.corEscura, proporcao: m.proporcao,
  };
}
