/**
 * Repinta o desenho do carneiro com os verdes da casa.
 *
 * O arquivo é um PNG de traço com degradê: o desenho em si mora no canal alfa,
 * e a cor é só tinta por cima. Então dá para trocar a paleta sem redesenhar
 * nada - preserva-se o alfa (inclusive o das bordas suavizadas) e reescreve-se
 * o RGB como um degradê da esquerda para a direita, que é o sentido do degradê
 * original.
 *
 * As pontas padrão são o `--green` da casa (#1E8A3E) e um tom claro do verde da
 * marca (#4FE3C6, o `--yellow` #00C9A7 clareado). A distância entre elas é o que
 * faz o degradê aparecer num crachá de 28px: dois verdes vizinhos, ali, leem
 * como cor chapada.
 *
 * Uso: node scripts/pintar-logo.mjs public/favicon.png [saida.png] [#inicio #fim]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

const hex = (v) => [1, 3, 5].map(i => parseInt(v.replace('#', '').slice(i - 1, i + 1), 16));
const cores = process.argv.filter(a => /^#?[0-9a-f]{6}$/i.test(a));
const ESQUERDA = hex(cores[0] ?? '#1E8A3E');
const DIREITA = hex(cores[1] ?? '#4FE3C6');

const entrada = process.argv[2];
const saida = process.argv[3] ?? entrada;
if (!entrada) {
  console.error('Uso: node scripts/pintar-logo.mjs <arquivo.png> [saida.png]');
  process.exit(1);
}

const bytes = readFileSync(entrada);
const ASSINATURA = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (!bytes.subarray(0, 8).equals(ASSINATURA)) throw new Error('Não é um PNG.');

// ── Ler os pedaços ───────────────────────────────────────────────────────────
const pedacos = [];
let i = 8;
while (i < bytes.length) {
  const tamanho = bytes.readUInt32BE(i);
  const tipo = bytes.toString('ascii', i + 4, i + 8);
  const dados = bytes.subarray(i + 8, i + 8 + tamanho);
  pedacos.push({ tipo, dados });
  i += 12 + tamanho;
}
const ihdr = pedacos.find(p => p.tipo === 'IHDR');
const largura = ihdr.dados.readUInt32BE(0);
const altura = ihdr.dados.readUInt32BE(4);
const profundidade = ihdr.dados[8];
const tipoCor = ihdr.dados[9];
const entrelacado = ihdr.dados[12];
if (profundidade !== 8 || tipoCor !== 6 || entrelacado !== 0) {
  throw new Error(`Só trato RGBA de 8 bits sem entrelace (achei ${profundidade}/${tipoCor}/${entrelacado}).`);
}

const bruto = inflateSync(Buffer.concat(pedacos.filter(p => p.tipo === 'IDAT').map(p => p.dados)));

// ── Desfazer os filtros de linha ─────────────────────────────────────────────
const CANAIS = 4;
const linha = largura * CANAIS;
const pixels = Buffer.alloc(altura * linha);
for (let y = 0; y < altura; y++) {
  const filtro = bruto[y * (linha + 1)];
  const origem = y * (linha + 1) + 1;
  for (let x = 0; x < linha; x++) {
    const cru = bruto[origem + x];
    const a = x >= CANAIS ? pixels[y * linha + x - CANAIS] : 0;
    const b = y > 0 ? pixels[(y - 1) * linha + x] : 0;
    const c = (x >= CANAIS && y > 0) ? pixels[(y - 1) * linha + x - CANAIS] : 0;
    let valor;
    switch (filtro) {
      case 0: valor = cru; break;
      case 1: valor = cru + a; break;
      case 2: valor = cru + b; break;
      case 3: valor = cru + ((a + b) >> 1); break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        valor = cru + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        break;
      }
      default: throw new Error('Filtro de linha desconhecido: ' + filtro);
    }
    pixels[y * linha + x] = valor & 0xff;
  }
}

// ── Repintar ─────────────────────────────────────────────────────────────────
// Só o RGB muda. O alfa é o desenho, e mexer nele engordaria ou comeria o traço.
let pintados = 0;
for (let y = 0; y < altura; y++) {
  for (let x = 0; x < largura; x++) {
    const p = y * linha + x * CANAIS;
    if (pixels[p + 3] === 0) continue;
    const t = largura > 1 ? x / (largura - 1) : 0;
    for (let c = 0; c < 3; c++) {
      pixels[p + c] = Math.round(ESQUERDA[c] + (DIREITA[c] - ESQUERDA[c]) * t);
    }
    pintados++;
  }
}

// ── Remontar ─────────────────────────────────────────────────────────────────
const comFiltro = Buffer.alloc(altura * (linha + 1));
for (let y = 0; y < altura; y++) {
  comFiltro[y * (linha + 1)] = 0; // sem filtro: a imagem é minúscula
  pixels.copy(comFiltro, y * (linha + 1) + 1, y * linha, (y + 1) * linha);
}
const idat = deflateSync(comFiltro, { level: 9 });

const CRC = (() => {
  const tabela = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c;
  }
  return (buf) => {
    let c = -1;
    for (const b of buf) c = tabela[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function pedaco(tipo, dados) {
  const cabeca = Buffer.alloc(8);
  cabeca.writeUInt32BE(dados.length, 0);
  cabeca.write(tipo, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(CRC(Buffer.concat([Buffer.from(tipo, 'ascii'), dados])), 0);
  return Buffer.concat([cabeca, dados, crc]);
}

// Mantém os pedaços originais, trocando os IDAT pelo novo. O que não é IDAT
// (paleta de fundo, gama, texto) segue como estava.
const partes = [ASSINATURA];
let jaPosIdat = false;
for (const p of pedacos) {
  if (p.tipo === 'IDAT') {
    if (!jaPosIdat) { partes.push(pedaco('IDAT', idat)); jaPosIdat = true; }
    continue;
  }
  partes.push(pedaco(p.tipo, p.dados));
}
writeFileSync(saida, Buffer.concat(partes));
console.log(`${saida}: ${largura}x${altura}, ${pintados} pixels repintados`
  + ` (#${ESQUERDA.map(v => v.toString(16).padStart(2, '0')).join('')}`
  + ` -> #${DIREITA.map(v => v.toString(16).padStart(2, '0')).join('')}).`);
