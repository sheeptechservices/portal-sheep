// ─────────────────────────────────────────────────────────────────────────────
//  Lê uma planilha para a prévia de anexo: Excel (.xlsx, .xlsm) e CSV.
//
//  Sem biblioteca de planilha. O .xlsx é um zip de XMLs, e o `fflate` que já
//  abre o .docx abre este também: o que se lê aqui é a lista de abas, o texto
//  compartilhado e as células de cada aba. Uma biblioteca inteira de planilha
//  pesa centenas de kB para quem só quer olhar o que veio anexado.
//
//  O que fica de fora de propósito: fórmula (vale o último valor calculado, que
//  o Excel grava junto), célula mesclada, cor e largura de coluna. É prévia, e
//  não editor - quem precisa disso baixa o arquivo.
//
//  O .xls antigo é binário, de outro formato, e continua indo para o download.
// ─────────────────────────────────────────────────────────────────────────────
import { unzipSync, strFromU8 } from 'fflate';

export interface AbaDaPlanilha {
  nome: string;
  /** As linhas já em texto, como o Excel as mostraria. */
  linhas: string[][];
  /** Quantas colunas a aba usa: a tabela desenha todas, mesmo as vazias no meio. */
  colunas: number;
  /** Quantas linhas a aba tem de verdade, antes do corte da prévia. */
  total: number;
}

/** Acima disto a prévia corta: dez mil linhas numa tabela travariam a tela, e
 *  ninguém lê isso sem baixar. */
export const MAX_LINHAS = 2000;
const MAX_COLUNAS = 200;

const TIPOS_XLSX = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12',
];

/** Se o anexo é uma planilha que a prévia sabe abrir. O tipo nem sempre vem
 *  certo - muito anexo chega como `application/octet-stream` -, então o nome
 *  também decide. */
export function tipoDePlanilha(tipo: string, nome: string): 'xlsx' | 'csv' | null {
  const t = tipo.toLowerCase();
  const n = nome.toLowerCase();
  if (TIPOS_XLSX.includes(t) || /\.(xlsx|xlsm)$/.test(n)) return 'xlsx';
  if (t === 'text/csv' || /\.csv$/.test(n)) return 'csv';
  return null;
}

export function lerPlanilha(bytes: Uint8Array, formato: 'xlsx' | 'csv'): AbaDaPlanilha[] {
  return formato === 'csv' ? [lerCsv(bytes)] : lerXlsx(bytes);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function lerCsv(bytes: Uint8Array): AbaDaPlanilha {
  // O Excel grava o CSV com a marca de ordem de bytes na frente.
  const cru = strFromU8(bytes);
  const texto = cru.charCodeAt(0) === 0xfeff ? cru.slice(1) : cru;
  // O separador é o que mais aparece na primeira linha: o Excel brasileiro
  // salva com ponto e vírgula, e o resto do mundo com vírgula.
  const primeira = texto.split(/\r?\n/, 1)[0] ?? '';
  const contar = (c: string) => primeira.split(c).length - 1;
  const sep = [';', ',', '\t'].sort((a, b) => contar(b) - contar(a))[0];

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  let total = 0;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo);
      campo = '';
      total++;
      if (linhas.length < MAX_LINHAS) linhas.push(linha);
      linha = [];
      continue;
    }
    campo += c;
  }
  if (campo !== '' || linha.length) {
    linha.push(campo);
    total++;
    if (linhas.length < MAX_LINHAS) linhas.push(linha);
  }
  return aparar({ nome: 'CSV', linhas, colunas: 0, total });
}

// ── XLSX ────────────────────────────────────────────────────────────────────

/** Os elementos de um nome, com ou sem prefixo: há gerador que grava `x:c` no
 *  lugar de `c`, e o nome local é o que não muda. */
const filhos = (el: Document | Element, nome: string) =>
  Array.from(el.getElementsByTagNameNS('*', nome));

function xml(arquivos: Record<string, Uint8Array>, caminho: string): Document | null {
  const bytes = arquivos[caminho];
  if (!bytes) return null;
  return new DOMParser().parseFromString(strFromU8(bytes), 'application/xml');
}

/** "AB12" -> 27 (a coluna, contando do zero). */
function indiceDaColuna(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** O que o formato da célula pede, reduzido ao que a prévia sabe mostrar. Sem
 *  isto a data aparece como 45912 e o dinheiro perde o zero dos centavos. */
type Formato =
  | { tipo: 'geral' }
  | { tipo: 'numero'; casas: number; milhar: boolean; porcento: boolean }
  | { tipo: 'data'; dia: boolean; ano: boolean; hora: boolean };

const GERAL: Formato = { tipo: 'geral' };

/** Os formatos embutidos do Excel, pelo id: esses não vêm escritos no arquivo. */
const EMBUTIDOS: Record<number, string> = {
  1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00',
  14: 'dd/mm/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 22: 'dd/mm/yyyy h:mm',
  37: '#,##0', 38: '#,##0', 39: '#,##0.00', 40: '#,##0.00', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0',
};

function lerFormato(codigo: string | undefined): Formato {
  if (!codigo || codigo === 'General') return GERAL;
  // Só a primeira seção (a dos positivos), sem o que vem entre aspas e
  // colchetes ("dias", [Red]): senão um "d" de texto viraria data.
  const limpo = codigo.split(';')[0].replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  if (/[dmyh]/i.test(limpo)) {
    return { tipo: 'data', dia: /d/i.test(limpo), ano: /y/i.test(limpo), hora: /h/i.test(limpo) };
  }
  if (!/[0#]/.test(limpo)) return GERAL;
  return {
    tipo: 'numero',
    casas: limpo.match(/\.([0#]+)/)?.[1].length ?? 0,
    milhar: /[0#],[0#]/.test(limpo),
    porcento: limpo.includes('%'),
  };
}

function formatosDosEstilos(doc: Document | null): Formato[] {
  if (!doc) return [];
  const proprios = new Map<number, string>();
  for (const f of filhos(doc, 'numFmt')) {
    proprios.set(Number(f.getAttribute('numFmtId')), f.getAttribute('formatCode') ?? '');
  }
  const xfs = filhos(doc, 'cellXfs')[0];
  if (!xfs) return [];
  return filhos(xfs, 'xf').map(xf => {
    const id = Number(xf.getAttribute('numFmtId') ?? 0);
    return lerFormato(proprios.get(id) ?? EMBUTIDOS[id]);
  });
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

function dataDoSerial(serial: number, f: { dia: boolean; ano: boolean; hora: boolean }, base1904: boolean): string {
  // O dia zero do Excel é 30/12/1899 (e 01/01/1904 no Mac antigo). A conta vai
  // em UTC para o fuso de quem olha não andar a data um dia para trás.
  const base = base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(base + Math.round(serial * 86400000));
  const hora = `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}`;
  // Formato só de hora ("h:mm") não tem data para mostrar.
  if (!f.dia && !f.ano) return hora;
  const mes = `${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  // Mês e ano sem o dia ("mm/yyyy"): é competência, e o dia primeiro que o
  // Excel guarda por baixo não quer dizer nada.
  const data = f.dia ? `${doisDigitos(d.getUTCDate())}/${mes}` : mes;
  return f.hora ? `${data} ${hora}` : data;
}

function numero(valor: number, formato: Formato, base1904: boolean): string {
  if (formato.tipo === 'data') return dataDoSerial(valor, formato, base1904);
  if (formato.tipo === 'numero') {
    const texto = (formato.porcento ? valor * 100 : valor).toLocaleString('pt-BR', {
      minimumFractionDigits: formato.casas,
      maximumFractionDigits: formato.casas,
      useGrouping: formato.milhar,
    });
    return formato.porcento ? `${texto}%` : texto;
  }
  // Sem separador de milhar no formato geral: é como o Excel mostra, e um código
  // guardado como número (CNPJ, CEP) com pontos no meio leria como outra coisa.
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 10, useGrouping: false });
}

function lerXlsx(bytes: Uint8Array): AbaDaPlanilha[] {
  const arquivos = unzipSync(bytes);
  const livro = xml(arquivos, 'xl/workbook.xml');
  if (!livro) throw new Error('Planilha sem o índice de abas.');

  const base1904 = filhos(livro, 'workbookPr')[0]?.getAttribute('date1904') === '1';

  // Onde mora cada aba: o livro dá o nome e um id, e o arquivo de relações
  // traduz o id no caminho do XML da aba.
  const destinos = new Map<string, string>();
  const rels = xml(arquivos, 'xl/_rels/workbook.xml.rels');
  for (const r of rels ? filhos(rels, 'Relationship') : []) {
    const alvo = r.getAttribute('Target') ?? '';
    destinos.set(r.getAttribute('Id') ?? '', alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`);
  }

  const compartilhados = (() => {
    const doc = xml(arquivos, 'xl/sharedStrings.xml');
    if (!doc) return [] as string[];
    // Texto com formatação vem partido em pedaços (`r`), e a pronúncia do
    // japonês (`rPh`) mora junto e não é para aparecer.
    return filhos(doc, 'si').map(si => filhos(si, 't')
      .filter(t => (t.parentNode as Element | null)?.localName !== 'rPh')
      .map(t => t.textContent ?? '').join(''));
  })();

  const formatos = formatosDosEstilos(xml(arquivos, 'xl/styles.xml'));

  return filhos(livro, 'sheet').map(folha => {
    const nome = folha.getAttribute('name') ?? 'Aba';
    const rid = folha.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
      ?? folha.getAttribute('r:id') ?? '';
    const doc = xml(arquivos, destinos.get(rid) ?? '');
    if (!doc) return { nome, linhas: [], colunas: 0, total: 0 };

    const linhas: string[][] = [];
    let total = 0;
    for (const row of filhos(doc, 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const indice = Number.isFinite(r) && r >= 0 ? r : linhas.length;
      total = Math.max(total, indice + 1);
      if (indice >= MAX_LINHAS) continue;
      const linha: string[] = [];
      let proxima = 0;
      for (const c of filhos(row, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? indiceDaColuna(ref) : proxima;
        proxima = col + 1;
        if (col >= MAX_COLUNAS) continue;
        const tipo = c.getAttribute('t');
        const v = filhos(c, 'v')[0]?.textContent ?? '';
        let texto = '';
        if (tipo === 's') texto = compartilhados[Number(v)] ?? '';
        else if (tipo === 'inlineStr') texto = filhos(c, 't').map(t => t.textContent ?? '').join('');
        else if (tipo === 'b') texto = v === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (tipo === 'str' || tipo === 'e') texto = v;
        else if (v !== '') {
          const n = Number(v);
          texto = Number.isFinite(n)
            ? numero(n, formatos[Number(c.getAttribute('s') ?? 0)] ?? GERAL, base1904)
            : v;
        }
        linha[col] = texto;
      }
      linhas[indice] = linha;
    }
    // Linha que o XML pulou (vazia) vira linha vazia, e não buraco no array.
    for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = [];
    return aparar({ nome, linhas, colunas: 0, total });
  });
}

/** Tira as linhas e colunas vazias do fim: planilha com formatação arrastada
 *  até a linha mil desenharia novecentas linhas em branco. */
function aparar(aba: AbaDaPlanilha): AbaDaPlanilha {
  const cheia = (l: string[]) => l.some(v => v != null && v !== '');
  let fim = aba.linhas.length;
  while (fim > 0 && !cheia(aba.linhas[fim - 1])) fim--;
  const linhas = aba.linhas.slice(0, fim).map(l => Array.from(l, v => v ?? ''));
  const colunas = linhas.reduce((max, l) => {
    let ultima = l.length;
    while (ultima > 0 && l[ultima - 1] === '') ultima--;
    return Math.max(max, ultima);
  }, 0);
  const cortadas = aba.total > MAX_LINHAS;
  return { ...aba, linhas, colunas, total: cortadas ? aba.total : linhas.length };
}

/** "A", "B", ... "Z", "AA": o nome da coluna como o Excel escreve. */
export function nomeDaColuna(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
