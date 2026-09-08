// ─────────────────────────────────────────────────────────────────────────────
//  Escreve o PDF do contrato, sem passar pela caixa de impressão.
//
//  Um PDF é uma lista de objetos numerados e uma tabela dizendo em que byte cada
//  um começa. O texto vai em fluxos de conteúdo, e a fonte é declarada pelo
//  nome, não embutida: o leitor usa a Tahoma que ele já tem. Por isso cada
//  palavra é posicionada em coordenada própria - se o leitor não tiver a fonte e
//  substituir por outra, o texto continua onde deveria, em vez de escorrer para
//  fora da margem.
//
//  A quebra de linha e a justificação são feitas aqui, com as medidas reais da
//  fonte (ver `tahoma.ts`). É a parte que o navegador fazia por nós na
//  impressão, e a razão de o gerador ter esse tamanho.
// ─────────────────────────────────────────────────────────────────────────────
import { unzlibSync, zlibSync } from 'fflate';
import { DEPOIS_PADRAO, ENTRELINHA_PADRAO, type Paragrafo } from './docx';
import { TAHOMA, TAHOMA_NEGRITO, type MedidasFonte } from './tahoma';

// ── A folha, medida no contrato assinado (ver o comentário do cabeçalho) ────
const A4 = { largura: 595.32, altura: 841.92 };
const MARGEM = 85.1;                        // 30 mm, a margem do documento
const LARGURA_UTIL = 425.4;                 // o que sobra entre as duas margens
const CORPO = 11;                           // Tahoma 11
/** A primeira linha do corpo, contada da base da folha. É onde o título começa
 *  no documento assinado, e é o que faz todo o resto cair no mesmo lugar. */
const PRIMEIRA_BASE = 714.8;
/** Quanto a marca fica acima da primeira linha. O documento assinado deixa 42
 *  pt livres entre a margem de cima e o título - era a faixa do cabeçalho, e é
 *  onde a marca cabe sem encostar em nada. */
const FOLGA_DA_MARCA = 30;

export interface ImagemPdf {
  /** Os pixels em RGB, já sem transparência e já comprimidos. */
  rgb: Uint8Array;
  larguraPx: number;
  alturaPx: number;
  /** Quanto ela deve ocupar na folha, em pontos. */
  larguraPt: number;
}

// ── WinAnsi: do texto para os bytes que o PDF entende ───────────────────────

/** Os códigos que a tabela do Windows põe fora do lugar. */
const ESPECIAIS: Record<number, number> = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
  0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
  0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
  0x017E: 0x9E, 0x0178: 0x9F,
};

/** O código WinAnsi de um caractere, ou 63 ("?") quando ele não cabe na tabela. */
function winAnsi(ch: string): number {
  const c = ch.codePointAt(0) ?? 63;
  if (c >= 32 && c <= 255 && !(c >= 0x80 && c <= 0x9F)) return c;
  return ESPECIAIS[c] ?? 63;
}

/** Largura de um texto, em pontos, na fonte e no corpo dados. */
function largura(texto: string, fonte: MedidasFonte, corpo: number): number {
  let total = 0;
  for (const ch of texto) {
    const w = fonte.larguras[winAnsi(ch) - 32] ?? 0;
    total += w;
  }
  return (total * corpo) / 1000;
}

/** Uma string literal de PDF: parêntese e barra invertida precisam de escape. */
function literal(texto: string): string {
  let saida = '(';
  for (const ch of texto) {
    const c = winAnsi(ch);
    if (c === 0x28 || c === 0x29 || c === 0x5C) saida += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) saida += '\\' + c.toString(8).padStart(3, '0');
    else saida += String.fromCharCode(c);
  }
  return saida + ')';
}

// ── Quebra de linha ─────────────────────────────────────────────────────────

/** Um pedaço de palavra numa fonte só. Existe porque a fonte muda no meio da
 *  palavra: o nome fantasia acaba em negrito e a vírgula seguinte não é. */
interface Pedaco {
  texto: string;
  negrito: boolean;
  largura: number;
}

/** Uma palavra já medida - um ou mais pedaços, sem espaço entre eles. */
interface Palavra {
  pedacos: Pedaco[];
  largura: number;
}

/** Uma linha pronta: as palavras e o espaço que sobra para distribuir. */
interface Linha {
  palavras: Palavra[];
  sobra: number;
  ultima: boolean;
}

function medidas(negrito: boolean): MedidasFonte {
  return negrito ? TAHOMA_NEGRITO : TAHOMA;
}

/**
 * As palavras de um parágrafo, na ordem.
 *
 * A quebra é pelo espaço, e o espaço em si não vira palavra: ele é o que a
 * justificação estica. A troca de trecho NÃO quebra palavra - se quebrasse,
 * "ZAIDAN 14704644707" em negrito e a vírgula seguinte em redondo virariam duas
 * palavras, e sairia um espaço antes da vírgula.
 */
function palavrasDo(p: Paragrafo): Palavra[] {
  const saida: Palavra[] = [];
  let pedacos: Pedaco[] = [];

  const fechar = () => {
    if (!pedacos.length) return;
    saida.push({ pedacos, largura: pedacos.reduce((s, x) => s + x.largura, 0) });
    pedacos = [];
  };

  for (const t of p.trechos) {
    const negrito = !!t.negrito;
    // Guarda os separadores para saber ONDE a palavra termina.
    for (const parte of t.texto.split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { fechar(); continue; }
      pedacos.push({ texto: parte, negrito, largura: largura(parte, medidas(negrito), CORPO) });
    }
  }
  fechar();
  return saida;
}

function quebrar(palavras: Palavra[], larguraMax: number): Linha[] {
  const linhas: Linha[] = [];
  let atual: Palavra[] = [];
  let usado = 0;

  for (const palavra of palavras) {
    const espaco = atual.length ? largura(' ', medidas(palavra.pedacos[0].negrito), CORPO) : 0;
    if (atual.length && usado + espaco + palavra.largura > larguraMax) {
      linhas.push({ palavras: atual, sobra: larguraMax - usado, ultima: false });
      atual = [palavra];
      usado = palavra.largura;
    } else {
      atual.push(palavra);
      usado += espaco + palavra.largura;
    }
  }
  if (atual.length) linhas.push({ palavras: atual, sobra: larguraMax - usado, ultima: true });
  return linhas;
}

// ── O fluxo de desenho ──────────────────────────────────────────────────────

/** Um comando já pronto, e a página a que ele pertence. */
interface Pagina {
  comandos: string[];
  /** Verdadeiro quando a imagem do topo entra nesta página. */
  temImagem: boolean;
}

export function gerarPdf({ paragrafos, imagemTopo }: {
  paragrafos: Paragrafo[];
  imagemTopo?: ImagemPdf;
}): Uint8Array {
  const paginas: Pagina[] = [{ comandos: [], temImagem: !!imagemTopo }];
  let pagina = paginas[0];
  // `y` é sempre a base da PRÓXIMA linha: cada linha desce a própria entrelinha
  // antes de ser desenhada. Começa acima da primeira base pela mesma razão.
  let y = PRIMEIRA_BASE + (paragrafos[0]?.entrelinha ?? ENTRELINHA_PADRAO);

  const novaPagina = () => {
    pagina = { comandos: [], temImagem: false };
    paginas.push(pagina);
    y = A4.altura - MARGEM;
  };

  if (imagemTopo) {
    // A marca ocupa a faixa que no documento assinado era do cabeçalho: acima da
    // primeira linha do texto, sem empurrar nada - o título continua na altura
    // de sempre. Ela sobe até onde precisar para manter a folga.
    const alturaPt = (imagemTopo.larguraPt * imagemTopo.alturaPx) / imagemTopo.larguraPx;
    const x = (A4.largura - imagemTopo.larguraPt) / 2;
    const base = PRIMEIRA_BASE + FOLGA_DA_MARCA;
    pagina.comandos.push(
      `q ${imagemTopo.larguraPt.toFixed(2)} 0 0 ${alturaPt.toFixed(2)} `
      + `${x.toFixed(2)} ${base.toFixed(2)} cm /Im1 Do Q`,
    );
  }

  for (const p of paragrafos) {
    const alturaLinha = p.entrelinha ?? ENTRELINHA_PADRAO;
    const linhas = quebrar(palavrasDo(p), LARGURA_UTIL);
    const alinhamento = p.alinhamento ?? 'justificado';

    for (const linha of linhas) {
      if (y - alturaLinha < MARGEM) novaPagina();
      y -= alturaLinha;

      // A última linha de um parágrafo justificado não estica: esticá-la abriria
      // um vão entre duas palavras no fim do texto, que é o desenho clássico de
      // justificação mal feita.
      const estica = alinhamento === 'justificado' && !linha.ultima && linha.palavras.length > 1;
      let x = MARGEM;
      if (alinhamento === 'centro') x = MARGEM + linha.sobra / 2;

      const extra = estica ? linha.sobra / (linha.palavras.length - 1) : 0;
      let fonteAtual = '';
      for (let i = 0; i < linha.palavras.length; i++) {
        for (const pedaco of linha.palavras[i].pedacos) {
          const fonte = pedaco.negrito ? '/F2' : '/F1';
          if (fonte !== fonteAtual) {
            pagina.comandos.push(`${fonte} ${CORPO} Tf`);
            fonteAtual = fonte;
          }
          pagina.comandos.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${literal(pedaco.texto)} Tj`);
          x += pedaco.largura;
        }
        x += extra;
        // O espaço entre duas palavras sai na fonte da que vem depois, como o
        // Word faz.
        if (i < linha.palavras.length - 1) {
          x += largura(' ', medidas(linha.palavras[i + 1].pedacos[0].negrito), CORPO);
        }
      }
    }
    y -= p.depois ?? DEPOIS_PADRAO;
  }

  return montar(paginas, imagemTopo);
}

// ── O arquivo ───────────────────────────────────────────────────────────────

const bytes = (s: string) => {
  const saida = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) saida[i] = s.charCodeAt(i) & 0xFF;
  return saida;
};

function descritor(nome: string, m: MedidasFonte, negrito: boolean): string {
  return `<< /Type /FontDescriptor /FontName /${nome} /Flags 32 `
    + `/FontBBox [${m.caixa.join(' ')}] /ItalicAngle 0 /Ascent ${m.subida} `
    + `/Descent ${m.descida} /CapHeight ${m.alturaCaixaAlta} /StemV ${negrito ? 165 : 88} >>`;
}

function fonte(nome: string, m: MedidasFonte, descritorRef: number): string {
  return `<< /Type /Font /Subtype /TrueType /BaseFont /${nome} /FirstChar 32 /LastChar 255 `
    + `/Widths [${m.larguras.join(' ')}] /Encoding /WinAnsiEncoding `
    + `/FontDescriptor ${descritorRef} 0 R >>`;
}

function montar(paginas: Pagina[], imagem?: ImagemPdf): Uint8Array {
  // Os objetos em ordem; o índice no array + 1 é o número do objeto.
  const objetos: (string | Uint8Array)[] = [];
  const guardar = (o: string | Uint8Array) => { objetos.push(o); return objetos.length; };

  const nPaginas = paginas.length;
  // 1 catálogo, 2 páginas, depois uma página e um conteúdo por folha.
  const refCatalogo = 1, refPaginas = 2;
  objetos.push('', '');                                     // reservados

  const refsPagina: number[] = [];
  const refsConteudo: number[] = [];
  for (const p of paginas) {
    const fluxo = zlibSync(bytes('BT\n' + p.comandos.join('\n') + '\nET\n'), { level: 6 });
    const cabeca = bytes(`<< /Length ${fluxo.length} /Filter /FlateDecode >>\nstream\n`);
    const rabo = bytes('\nendstream');
    const inteiro = new Uint8Array(cabeca.length + fluxo.length + rabo.length);
    inteiro.set(cabeca, 0);
    inteiro.set(fluxo, cabeca.length);
    inteiro.set(rabo, cabeca.length + fluxo.length);
    refsConteudo.push(guardar(inteiro));
    refsPagina.push(0);                                     // preenchido abaixo
  }

  const refDescNormal = guardar(descritor('Tahoma', TAHOMA, false));
  const refDescNegrito = guardar(descritor('Tahoma-Bold', TAHOMA_NEGRITO, true));
  const refFonteNormal = guardar(fonte('Tahoma', TAHOMA, refDescNormal));
  const refFonteNegrito = guardar(fonte('Tahoma-Bold', TAHOMA_NEGRITO, refDescNegrito));

  let refImagem = 0;
  if (imagem) {
    const cabeca = bytes(`<< /Type /XObject /Subtype /Image /Width ${imagem.larguraPx} `
      + `/Height ${imagem.alturaPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 `
      + `/Filter /FlateDecode /Length ${imagem.rgb.length} >>\nstream\n`);
    const rabo = bytes('\nendstream');
    const inteiro = new Uint8Array(cabeca.length + imagem.rgb.length + rabo.length);
    inteiro.set(cabeca, 0);
    inteiro.set(imagem.rgb, cabeca.length);
    inteiro.set(rabo, cabeca.length + imagem.rgb.length);
    refImagem = guardar(inteiro);
  }

  const recursos = (comImagem: boolean) =>
    `<< /Font << /F1 ${refFonteNormal} 0 R /F2 ${refFonteNegrito} 0 R >>`
    + (comImagem && refImagem ? ` /XObject << /Im1 ${refImagem} 0 R >>` : '')
    + ' >>';

  for (let i = 0; i < nPaginas; i++) {
    refsPagina[i] = guardar(
      `<< /Type /Page /Parent ${refPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] `
      + `/Resources ${recursos(paginas[i].temImagem)} /Contents ${refsConteudo[i]} 0 R >>`,
    );
  }

  objetos[refCatalogo - 1] = `<< /Type /Catalog /Pages ${refPaginas} 0 R >>`;
  objetos[refPaginas - 1] = `<< /Type /Pages /Kids [${refsPagina.map(r => `${r} 0 R`).join(' ')}] `
    + `/Count ${nPaginas} >>`;

  // ── Junta tudo, anotando onde cada objeto começa ──────────────────────────
  const pedacos: Uint8Array[] = [];
  let posicao = 0;
  const escrever = (u: Uint8Array) => { pedacos.push(u); posicao += u.length; };

  escrever(bytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  const inicios: number[] = [];
  objetos.forEach((corpo, i) => {
    inicios.push(posicao);
    escrever(bytes(`${i + 1} 0 obj\n`));
    escrever(typeof corpo === 'string' ? bytes(corpo) : corpo);
    escrever(bytes('\nendobj\n'));
  });

  const inicioXref = posicao;
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of inicios) xref += `${String(p).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objetos.length + 1} /Root ${refCatalogo} 0 R >>\n`
    + `startxref\n${inicioXref}\n%%EOF\n`;
  escrever(bytes(xref));

  const total = pedacos.reduce((s, p) => s + p.length, 0);
  const saida = new Uint8Array(total);
  let cursor = 0;
  for (const p of pedacos) { saida.set(p, cursor); cursor += p.length; }
  return saida;
}

/** Entrega o arquivo ao navegador. Mesmo caminho do .docx. */
export function baixarPdf(conteudo: Uint8Array, nome: string) {
  const url = URL.createObjectURL(new Blob([conteudo as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Um PNG vira os pixels que o PDF desenha.
 *
 * Feito à mão, e não por um canvas, para o gerador inteiro rodar igual no
 * navegador e fora dele - é o que torna o PDF conferível num teste. Cobre o que
 * a marca da casa usa: 8 bits por canal, sem entrelace, em RGB ou RGBA.
 *
 * A transparência é achatada sobre branco em vez de virar máscara: a folha é
 * branca, o resultado é o mesmo, e o arquivo fica com metade das partes.
 */
export function imagemDePng(png: Uint8Array): ImagemPdf | null {
  const ver = (p: number) => (png[p] << 24 | png[p + 1] << 16 | png[p + 2] << 8 | png[p + 3]) >>> 0;
  if (png.length < 33 || ver(0) !== 0x89504E47) return null;

  const largura = ver(16);
  const altura = ver(20);
  const bits = png[24];
  const tipo = png[25];
  const entrelace = png[28];
  if (bits !== 8 || entrelace !== 0 || (tipo !== 2 && tipo !== 6)) return null;

  // Os IDAT podem vir partidos em vários pedaços; juntos, são um só fluxo zlib.
  const partes: Uint8Array[] = [];
  for (let i = 8; i + 8 <= png.length;) {
    const tamanho = ver(i);
    const nome = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
    if (nome === 'IDAT') partes.push(png.subarray(i + 8, i + 8 + tamanho));
    if (nome === 'IEND') break;
    i += 12 + tamanho;
  }
  if (!partes.length) return null;

  const juntos = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let cursor = 0;
  for (const p of partes) { juntos.set(p, cursor); cursor += p.length; }

  let cru: Uint8Array;
  try { cru = unzlibSync(juntos); } catch { return null; }

  const canais = tipo === 6 ? 4 : 3;
  const porLinha = largura * canais;
  if (cru.length < altura * (porLinha + 1)) return null;

  const saida = new Uint8Array(largura * altura * 3);
  const linha = new Uint8Array(porLinha);
  const anterior = new Uint8Array(porLinha);

  for (let y = 0; y < altura; y++) {
    const base = y * (porLinha + 1);
    const filtro = cru[base];
    linha.set(cru.subarray(base + 1, base + 1 + porLinha));

    // Desfaz o filtro da linha: o PNG guarda a diferença para o vizinho, e não o
    // valor. Sem isto a imagem sai como chuvisco.
    for (let i = 0; i < porLinha; i++) {
      const a = i >= canais ? linha[i - canais] : 0;    // à esquerda
      const b = anterior[i];                             // acima
      const c = i >= canais ? anterior[i - canais] : 0;  // canto superior esquerdo
      let v = linha[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      linha[i] = v & 0xFF;
    }
    anterior.set(linha);

    for (let x = 0; x < largura; x++) {
      const de = x * canais;
      const para = (y * largura + x) * 3;
      const alfa = canais === 4 ? linha[de + 3] / 255 : 1;
      // Sobre branco: o que é transparente vira papel.
      for (let k = 0; k < 3; k++) {
        saida[para + k] = Math.round(linha[de + k] * alfa + 255 * (1 - alfa));
      }
    }
  }

  return { rgb: zlibSync(saida, { level: 6 }), larguraPx: largura, alturaPx: altura, larguraPt: 0 };
}
