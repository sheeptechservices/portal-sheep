// ─────────────────────────────────────────────────────────────────────────────
//  Word (.docx) e Excel (.xlsx) em texto, para o Claude Code ler.
//
//  Os dois formatos são um zip com XML dentro. Abrimos o zip com o zlib do
//  próprio Node e tiramos o conteúdo do XML: parágrafos, títulos, listas e
//  tabelas do Word; as abas da planilha, linha a linha, com as datas legíveis.
//  Formatação, imagens e gráficos ficam para trás - o que importa é o texto.
//
//  Os formatos antigos (.doc e .xls) são binários de outro tipo e não entram.
// ─────────────────────────────────────────────────────────────────────────────
import { inflateRawSync } from 'node:zlib';

/** Teto do que um arquivo de dentro do zip pode virar: barra a "bomba de zip". */
const DESCOMPACTADO_MAX = 100 * 1024 * 1024;
/** Teto do texto final: além disso o Claude não aproveita, e o arquivo avisa. */
const TEXTO_MAX = 1_500_000;
const LINHAS_POR_ABA = 5000;

export class ErroDocumento extends Error {}

// ── Zip ─────────────────────────────────────────────────────────────────────

function abrirZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  }
  // Arquivo do Office protegido por senha não é zip: é um contêiner cifrado.
  if (fim < 0) throw new ErroDocumento('o arquivo não abriu (pode estar protegido por senha ou corrompido)');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const entradas = new Map();
  for (let n = 0; n < total && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const nomeTam = buf.readUInt16LE(p + 28);
    entradas.set(buf.toString('utf8', p + 46, p + 46 + nomeTam), {
      metodo: buf.readUInt16LE(p + 10),
      comprimido: buf.readUInt32LE(p + 20),
      local: buf.readUInt32LE(p + 42),
    });
    p += 46 + nomeTam + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return (nome) => {
    const e = entradas.get(nome);
    if (!e) return null;
    const ini = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    const dados = buf.subarray(ini, ini + e.comprimido);
    if (e.metodo === 0) return dados.toString('utf8');
    if (e.metodo === 8) {
      try { return inflateRawSync(dados, { maxOutputLength: DESCOMPACTADO_MAX }).toString('utf8'); }
      catch { throw new ErroDocumento('o conteúdo do arquivo é grande demais ou está corrompido'); }
    }
    throw new ErroDocumento('o arquivo usa uma compactação que eu não abro');
  };
}

// ── XML ─────────────────────────────────────────────────────────────────────

function decodificar(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    const k = e.toLowerCase();
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'amp') return '&';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    const n = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : '';
  });
}

/** O texto das tags `<prefixo:t>` de um trecho, na ordem em que aparecem. */
function textos(xml, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g');
  let out = '';
  for (const m of xml.matchAll(re)) out += decodificar(m[1]);
  return out;
}

const atributo = (tagAbertura, nome) => (tagAbertura.match(new RegExp(`\\s${nome}="([^"]*)"`)) ?? [])[1] ?? null;

// ── Word ────────────────────────────────────────────────────────────────────

function paragrafoDocx(p) {
  const corpo = p
    .replace(/<w:tab\/>/g, '<w:t>\t</w:t>')
    .replace(/<w:(?:br|cr)(?:\s[^>]*)?\/>/g, '<w:t>\n</w:t>');
  const texto = textos(corpo, 'w:t').trim();
  if (!texto) return '';
  // Estilo de título em inglês ou em português ("Heading1", "Ttulo1", "Titulo2").
  const nivel = (p.match(/<w:pStyle w:val="(?:Heading|T[ií]?tulo|Ttulo)(\d)"/i) ?? [])[1];
  if (nivel) return `${'#'.repeat(Math.min(Number(nivel), 6))} ${texto}`;
  if (/<w:numPr>/.test(p)) return `- ${texto}`;
  return texto;
}

function tabelaDocx(tbl) {
  const linhas = [];
  for (const tr of tbl.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) ?? []) {
    const celulas = (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) ?? []).map(tc =>
      (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []).map(paragrafoDocx).filter(Boolean).join(' ').replace(/\|/g, '/'));
    if (celulas.some(Boolean)) linhas.push(`| ${celulas.join(' | ')} |`);
  }
  return linhas.join('\n');
}

/** Acha o fim de um bloco que pode ter outro igual dentro (tabela em tabela). */
function fimDoBloco(xml, ini, abre, fecha) {
  let nivel = 0;
  const re = new RegExp(`${abre}[\\s>]|${fecha}`, 'g');
  re.lastIndex = ini;
  for (let m; (m = re.exec(xml));) {
    nivel += m[0].startsWith('</') ? -1 : 1;
    if (nivel === 0) return m.index + m[0].length;
  }
  return xml.length;
}

export function docxParaTexto(buf) {
  const ler = abrirZip(buf);
  const doc = ler('word/document.xml');
  if (!doc) throw new ErroDocumento('não achei o texto dentro do arquivo do Word');
  const corpo = (doc.match(/<w:body>([\s\S]*)<\/w:body>/) ?? [])[1] ?? '';
  const blocos = [];
  const re = /<w:tbl>|<w:p(?=[\s>/])/g;
  for (let m; (m = re.exec(corpo));) {
    if (m[0] === '<w:tbl>') {
      const fim = fimDoBloco(corpo, m.index, '<w:tbl', '</w:tbl>');
      blocos.push(tabelaDocx(corpo.slice(m.index, fim)));
      re.lastIndex = fim;
      continue;
    }
    const abertura = corpo.slice(m.index, corpo.indexOf('>', m.index) + 1);
    if (abertura.endsWith('/>')) continue; // parágrafo vazio
    const fim = corpo.indexOf('</w:p>', m.index);
    if (fim < 0) break;
    blocos.push(paragrafoDocx(corpo.slice(m.index, fim + 6)));
    re.lastIndex = fim + 6;
  }
  return limitar(blocos.filter(Boolean).join('\n\n'));
}

// ── Excel ───────────────────────────────────────────────────────────────────

/** Formatos de número que o Excel já traz prontos e que são data ou hora. */
const FORMATOS_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function estilosDeData(ler) {
  const xml = ler('xl/styles.xml');
  if (!xml) return new Set();
  const proprios = new Map();
  for (const m of xml.matchAll(/<numFmt\s[^>]*>/g)) {
    const id = Number(atributo(m[0], 'numFmtId'));
    // Tira o que está entre aspas e colchetes ("[$R$]", "\"dias\"") antes de
    // procurar d, m e y: o que sobra é o desenho da data, se houver.
    const codigo = decodificar(atributo(m[0], 'formatCode') ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    proprios.set(id, /[dy]|m{3,}/i.test(codigo) || (/m/i.test(codigo) && /[dy]/i.test(codigo)));
  }
  const xfs = (xml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/) ?? [])[1] ?? '';
  const datas = new Set();
  let i = 0;
  for (const m of xfs.matchAll(/<xf\s[^>]*?\/?>/g)) {
    const id = Number(atributo(m[0], 'numFmtId') ?? 0);
    if (FORMATOS_DATA.has(id) || proprios.get(id)) datas.add(i);
    i++;
  }
  return datas;
}

function serialParaData(n, base1904) {
  const ms = Math.round((n + (base1904 ? 1462 : 0) - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(n);
  const dois = (x) => String(x).padStart(2, '0');
  const data = `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const temHora = d.getUTCHours() || d.getUTCMinutes();
  if (n < 1) return `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}`;
  return temHora ? `${data} ${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` : data;
}

function colunaDe(ref) {
  let n = 0;
  for (const c of String(ref ?? '').replace(/\d+/g, '')) n = n * 26 + (c.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

export function xlsxParaTexto(buf) {
  const ler = abrirZip(buf);
  const livro = ler('xl/workbook.xml');
  if (!livro) throw new ErroDocumento('não achei as abas dentro da planilha');
  const base1904 = /<workbookPr[^>]*date1904="(1|true)"/.test(livro);
  const rels = new Map();
  for (const m of (ler('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\s[^>]*>/g)) {
    const alvo = atributo(m[0], 'Target') ?? '';
    rels.set(atributo(m[0], 'Id'), alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`);
  }
  const compartilhados = [];
  for (const m of (ler('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    compartilhados.push(textos(m[1].replace(/<rPh[\s\S]*?<\/rPh>/g, ''), 't'));
  }
  const datas = estilosDeData(ler);

  const partes = [];
  for (const m of livro.matchAll(/<sheet\s[^>]*>/g)) {
    const nome = decodificar(atributo(m[0], 'name') ?? 'Aba');
    const oculta = /state="(hidden|veryHidden)"/.test(m[0]);
    const xml = ler(rels.get(atributo(m[0], 'r:id')) ?? '');
    if (!xml) continue;
    const linhas = [];
    let cortou = false;
    // A linha vazia vem fechada em si mesma (`<row r="5"/>`): sem a primeira
    // alternativa, ela engoliria a linha seguinte.
    for (const row of xml.matchAll(/<row\b[^>]*?\/>|<row\b[^>]*>[\s\S]*?<\/row>/g)) {
      if (row[0].endsWith('/>') && !row[0].includes('</row>')) continue;
      if (linhas.length >= LINHAS_POR_ABA) { cortou = true; break; }
      const celulas = [];
      for (const c of row[0].matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const abertura = ` ${c[1]}`;
        const miolo = c[2] ?? '';
        const tipo = atributo(abertura, 't');
        const v = (miolo.match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
        let valor = '';
        if (tipo === 's') valor = compartilhados[Number(v)] ?? '';
        else if (tipo === 'inlineStr') valor = textos(miolo, 't');
        else if (tipo === 'b') valor = v === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (v != null) {
          const num = Number(v);
          const numero = tipo !== 'str' && tipo !== 'e' && v.trim() !== '' && Number.isFinite(num);
          valor = numero && datas.has(Number(atributo(abertura, 's') ?? 0))
            ? serialParaData(num, base1904)
            // O Excel guarda 0,038 como "3.7999999999999999E-2": doze dígitos
            // significativos devolvem o número que a pessoa digitou.
            : numero ? String(Number(num.toPrecision(12))) : decodificar(v);
        }
        const col = colunaDe(atributo(abertura, 'r'));
        celulas[col >= 0 ? col : celulas.length] = valor.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '/');
      }
      while (celulas.length && !celulas[celulas.length - 1]) celulas.pop();
      if (celulas.length) {
        const r = atributo(row[0].slice(0, row[0].indexOf('>') + 1), 'r');
        linhas.push(`${r ?? linhas.length + 1}: ${Array.from(celulas, x => x ?? '').join(' | ')}`);
      }
    }
    partes.push([
      `## Aba "${nome}"${oculta ? ' (oculta)' : ''}`,
      linhas.length ? linhas.join('\n') : '(vazia)',
      cortou ? `(parei nas primeiras ${LINHAS_POR_ABA} linhas desta aba)` : '',
    ].filter(Boolean).join('\n'));
  }
  if (!partes.length) throw new ErroDocumento('a planilha não tem abas que eu consiga ler');
  return limitar(`Cada linha começa pelo número dela na planilha; as colunas vêm separadas por " | ", na ordem A, B, C...\n\n${partes.join('\n\n')}`);
}

function limitar(texto) {
  return texto.length > TEXTO_MAX
    ? `${texto.slice(0, TEXTO_MAX)}\n\n(o arquivo continua, mas parei aqui: é longo demais para ler inteiro)`
    : texto;
}
