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
  // Brasão com o nome vazado em branco por dentro: chapada, a silhueta comeria
  // justamente o texto, então entra como detalhe. Veio em SVG e fica em SVG -
  // é desenho vetorial, e rasterizar para .webp só perderia definição.
  { nome: 'Laticínios Porto Alegre', src: '/marcas/laticinios-porto-alegre.svg',
    altura: 46, detalhe: true },
  // Simbolo de duas cores com os bichos vazados em branco por dentro, e o nome
  // em duas linhas: chapada, a silhueta comeria o cachorro e o gato, que sao o
  // que identifica a marca.
  { nome: 'HOVEP', src: '/marcas/hovep.webp', altura: 34, detalhe: true },
  // O nome em preto e, acima do "L", duas folhas em dois azuis. Entra chapada
  // como a maioria: não há desenho vazado por dentro que a silhueta apagasse, e
  // as duas folhas continuam separadas pelo vão entre elas.
  //
  // Fica em .png, e não em .webp como as vizinhas: o arquivo veio assim, tem
  // transparência e 67 kB, que é menos do que a Orteconte já ocupa. Reconverter
  // só para igualar a extensão trocaria definição por nada.
  { nome: 'Libero Seguros', src: '/marcas/libero.png', altura: 36 },
  // Símbolo redondo de uma cor só - o "C" aberto atravessado pela seta de
  // gráfico -, então entra pela máscara como a Orteconte e a FM Rocket: o
  // arquivo dá a silhueta e a cor da marca é pintada por trás.
  //
  // O azul fechado se perde no fundo quase preto do tema escuro, e por isso ele
  // ganha um tom acima lá, como a FM Rocket já fazia.
  //
  // O arquivo veio com 40% de vão transparente em volta (500x500 para uma marca
  // de 302x302). Foi cortado na borda do desenho: no carrossel a medida é a
  // altura óptica, e o vão encolheria a marca perto das vizinhas.
  { nome: 'Chart Marketing', src: '/marcas/chart.png', altura: 30,
    cor: '#164FB6', corEscura: '#5B8BE8', proporcao: 1 },
];

// ── As logos gravadas pelo portal ───────────────────────────────────────────
//  A outra fonte: a logo que o cliente ganhou pelo portal (o bot do WhatsApp
//  anexa quando cadastra o projeto). Ela vem da rota pública das marcas, uma
//  vez por página, e entra depois das marcas da casa; o nome que a casa já tem
//  em arquivo fica com o arquivo. Sem desenho conhecido, ela entra como
//  `detalhe`: cinza em repouso, sem virar silhueta, que num JPEG de fundo
//  branco seria um retângulo chapado.

const mesmoNome = (a: string, b: string) => a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');
let gravadas: Marca[] = [];
let carregando: Promise<void> | null = null;
const ouvintes = new Set<() => void>();

/** Busca as logos gravadas uma vez por página. Fora do navegador (o servidor
 *  também importa este arquivo) não faz nada. */
export function carregarMarcasGravadas(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return Promise.resolve();
  carregando ??= fetch('/api/projeto-publico?modo=marcas')
    .then(r => (r.ok ? r.json() : { marcas: [] }))
    .then((d: { marcas?: { nome: string; src: string }[] }) => {
      gravadas = (d.marcas ?? [])
        .filter(m => m?.nome && m?.src && !MARCAS.some(s => mesmoNome(s.nome, m.nome)))
        .map(m => ({ nome: m.nome, src: m.src, altura: 30, detalhe: true }));
      ouvintes.forEach(f => f());
    })
    .catch(() => { /* sem as gravadas, ficam as da casa */ });
  return carregando;
}
if (typeof window !== 'undefined') void carregarMarcasGravadas();

/** Avisa quando as logos gravadas chegam, para quem desenhou antes. */
export function ouvirMarcas(f: () => void): () => void {
  ouvintes.add(f);
  return () => { ouvintes.delete(f); };
}

/** Todas as marcas: as da casa e, depois, as gravadas pelo portal. */
export function todasAsMarcas(): Marca[] {
  return gravadas.length ? [...MARCAS, ...gravadas] : MARCAS;
}

/** Casa o cliente com a marca pelo nome. Cliente cadastrado à mão não tem logo,
 *  e aí quem chama cai no nome - por isso o retorno é opcional. */
export function marcaDoCliente(nome: string | null | undefined): Marca | undefined {
  if (!nome) return undefined;
  return MARCAS.find(m => mesmoNome(m.nome, nome)) ?? gravadas.find(m => mesmoNome(m.nome, nome));
}

/** A logo no formato que os seletores do portal esperam. */
export function logoDoCliente(nome: string | null | undefined) {
  const m = marcaDoCliente(nome);
  return m && {
    src: m.src, altura: m.altura, escurecer: m.fundoEscuro, detalhe: m.detalhe,
    cor: m.cor, corEscura: m.corEscura, proporcao: m.proporcao,
  };
}
