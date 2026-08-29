// Motor de documentos Word - porte de `gerar_docx` / `gerar_docx_avista` do
// "DUX Gerador de Propostas" (app.py).
//
// Um .docx é um ZIP; o template tem placeholders no formato <<Nome>> que o Word
// grava escapados no XML (&lt;&lt;Nome&gt;&gt;). Verificamos que nos templates os
// placeholders estão inteiros num único run, então basta substituição de texto -
// mesma abordagem do original, sem biblioteca de manipulação de Word.
import { readFileSync } from 'fs';
import { join } from 'path';
import { unzipSync, zipSync } from 'fflate';

const TEMPLATES_DIR = join(process.cwd(), 'api', '_templates');

export type Marca = 'dux' | 'prematch';
export type TipoDocumento = 'nf' | 'fatura' | 'nota_debito' | 'contrato' | 'ordem_servico';

// ── ZIP ──────────────────────────────────────────────────────────────────────

type Arquivos = Record<string, Uint8Array>;

function lerTemplate(nome: string): Arquivos {
  const buf = readFileSync(join(TEMPLATES_DIR, nome));
  return unzipSync(new Uint8Array(buf));
}

/** Data fixa no ZIP: dois documentos de mesmo conteúdo saem byte a byte iguais.
 *  Data local (não UTC) e longe da borda: o ZIP só aceita 1980-2099 e a fflate lê
 *  o ano no fuso local, então 1980-01-01 UTC viraria 1979 em UTC-3. */
const MTIME_FIXO = new Date(2000, 0, 1);

function empacotar(files: Arquivos): Buffer {
  return Buffer.from(zipSync(files, { level: 6, mtime: MTIME_FIXO }));
}

const dec = new TextDecoder('utf-8');
const enc = new TextEncoder();

// ── Formatação (espelha os fmt_* do original) ────────────────────────────────

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const ORDINAIS = ['1ª', '2ª', '3ª', '4ª', '5ª', '6ª', '7ª', '8ª', '9ª', '10ª',
  '11ª', '12ª', '13ª', '14ª', '15ª', '16ª', '17ª', '18ª', '19ª', '20ª',
  '21ª', '22ª', '23ª', '24ª'];

export function fmtMoeda(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtPct(v: number, casas = 4): string {
  return v.toFixed(casas).replace('.', ',') + '%';
}

/** 2 a 4 casas, sem zeros à direita - igual a `fmt_pct_auto`. */
export function fmtPctAuto(v: number): string {
  let s = v.toFixed(4).replace(/0+$/, '');
  const dot = s.indexOf('.');
  if (dot !== -1 && s.length - dot - 1 < 2) s = v.toFixed(2);
  if (s.endsWith('.')) s = v.toFixed(2);
  return s.replace('.', ',') + '%';
}

/** ISO (yyyy-mm-dd) → dd/mm/aaaa */
export function fmtData(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** ISO → dd/mm/aa */
export function fmtDataCurta(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

/** ISO → "5 de janeiro de 2026" */
export function fmtDataExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

function xmlEsc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Placeholder do template, na forma escapada em que o Word o grava. */
function ph(nome: string): string {
  return `&lt;&lt;${nome}&gt;&gt;`;
}

function substituirTudo(xml: string, mapa: Record<string, string>): string {
  for (const [chave, valor] of Object.entries(mapa)) {
    xml = xml.split(chave).join(valor);
  }
  return xml;
}

// ── Cálculo (mesmo motor do simulador, replicado aqui para o lado servidor) ──

export interface ParcelaCalc {
  n: number; ord: string; valor: number;
  dataPgto: string; dataVenc: string;
  dias: number; taxa: number; juros: number; liquido: number;
}

export interface Resultado {
  parcelas: ParcelaCalc[];
  totalBruto: number; totalJuros: number; totalLiquido: number;
  taxaMensalPct: number; taxaDiariaPct: number;
}

function diasEntre(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

function round2(v: number): number {
  const s = Math.sign(v);
  return s * Math.round((Math.abs(v) + Number.EPSILON) * 100) / 100;
}

export function calcular(
  dataAntecipacao: string,
  taxaMensalPct: number,
  parcelas: { vencimento: string; valor: number }[],
): Resultado {
  const taxaDiaria = taxaMensalPct / 100 / 30;
  const ordenadas = [...parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const calc: ParcelaCalc[] = ordenadas.map((p, i) => {
    const dias = diasEntre(dataAntecipacao, p.vencimento);
    const taxa = round2(dias * taxaDiaria * 100) / 100;
    const juros = p.valor * taxa;
    return {
      n: i + 1, ord: ORDINAIS[i] ?? `${i + 1}ª`,
      valor: p.valor, dataPgto: dataAntecipacao, dataVenc: p.vencimento,
      dias, taxa, juros, liquido: p.valor - juros,
    };
  });

  const totalBruto = calc.reduce((s, p) => s + p.valor, 0);
  const totalJuros = calc.reduce((s, p) => s + p.juros, 0);
  return {
    parcelas: calc, totalBruto, totalJuros,
    totalLiquido: totalBruto - totalJuros,
    taxaMensalPct, taxaDiariaPct: taxaDiaria * 100,
  };
}

// ── Dias úteis (para a tolerância de 48h da proposta à vista) ────────────────

function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31) - 1;
  const dia = ((h + l - 7 * mm + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes, dia));
}

const cacheFeriados = new Map<number, Set<string>>();
function feriados(ano: number): Set<string> {
  const cached = cacheFeriados.get(ano);
  if (cached) return cached;
  const s = new Set<string>();
  const fixos: [number, number][] = [[1, 1], [4, 21], [5, 1], [9, 7], [10, 12], [11, 2], [11, 15], [11, 20], [12, 25]];
  for (const [m, d] of fixos) s.add(`${ano}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  const p = pascoa(ano);
  const desloca = (n: number) => {
    const x = new Date(p);
    x.setUTCDate(x.getUTCDate() + n);
    return x.toISOString().slice(0, 10);
  };
  s.add(desloca(-48)); s.add(desloca(-47)); s.add(desloca(-2)); s.add(desloca(0)); s.add(desloca(60));
  cacheFeriados.set(ano, s);
  return s;
}

function isDiaUtil(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !feriados(y).has(iso);
}

function somaDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// ── Manipulação do XML do Word ───────────────────────────────────────────────

const RE_PARAGRAFO = /<w:p[ >][\s\S]*?<\/w:p>/g;

/** Texto visível de um parágrafo, sem as tags. */
function textoDe(paragrafo: string): string {
  return paragrafo.replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .trim();
}

/** Remove parágrafos que contenham o placeholder - porte de `_remover_paras_com_placeholder`. */
function removerParasComPlaceholder(xml: string, placeholder: string): string {
  return xml.replace(RE_PARAGRAFO, p => (p.includes(placeholder) ? '' : p));
}

/** Remove rótulos órfãos de taxa - porte de `_remover_paras_taxa_labels`. */
function removerParasRotuloTaxa(xml: string): string {
  const TERMOS = ['taxa de desconto', 'taxa diária', 'taxa diaria', 'taxa mensal'];
  return xml.replace(RE_PARAGRAFO, p => {
    const txt = p.replace(/<[^>]+>/g, '').trim();
    const low = txt.toLowerCase();
    return txt.length < 80 && TERMOS.some(t => low.includes(t)) ? '' : p;
  });
}

/** Remove a linha "Número da NF:" quando não há número - porte de `_remover_linha_numero_vazio`. */
function removerLinhaNumeroVazio(xml: string, numero: string): string {
  if (numero && numero.trim()) return xml;
  const LABELS = ['Número da NF', 'Número da Nota Fiscal', 'Número da Fatura', 'Número do Contrato', 'Número da Nota de Débito'];
  return xml.replace(RE_PARAGRAFO, p => {
    const txt = textoDe(p);
    const soRotulo = LABELS.some(l => txt.startsWith(l) && txt.length <= l.length + 2);
    return soRotulo ? '' : p;
  });
}

/** Parágrafo de item de lista de parcelas - porte de `_para_item`. */
function paraItem(texto: string, estilo: 'parcelas' | 'simples'): string {
  const jc = estilo === 'simples' ? '<w:jc w:val="both"/>' : '';
  return `<w:p>
      <w:pPr><w:spacing w:after="0" w:before="0" w:line="360" w:lineRule="auto"/>${jc}</w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"/>
          <w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl w:val="0"/>
        </w:rPr>
        <w:t xml:space="preserve">${xmlEsc(texto)}</w:t>
      </w:r>
    </w:p>`;
}

/** Rótulos Nota Fiscal → Fatura / Nota de Débito / Contrato - porte de `_adaptar_tipo_documento`. */
export function adaptarTipoDocumento(xml: string, tipo: TipoDocumento, contexto: 'proposta' | 'contrato' = 'proposta'): string {
  if (tipo === 'nf') return xml;

  let subs: [string, string][] = [];

  if (tipo === 'fatura') {
    subs = contexto === 'proposta'
      ? [['Valor Total da NF:', 'Valor Total da Fatura:'], ['Número da Nota Fiscal:', 'Número da Fatura:'],
         ['Número da NF:', 'Número da Fatura:'], ['nota fiscal,', 'fatura,'], ['nota fiscal.', 'fatura.'], ['nota fiscal ', 'fatura ']]
      : [['Tomador da Nota Fiscal', 'Tomador da Fatura'], ['vencimento estipulada na Nota Fiscal', 'vencimento estipulada na Fatura'],
         ['Nota Fiscal a que se refere', 'Fatura a que se refere'], ['Número da Nota Fiscal:', 'Número da Fatura:'],
         ['da Nota Fiscal', 'da Fatura'], ['a nota fiscal e o aceite', 'a fatura e o aceite'],
         ['referida nota fiscal', 'referida fatura'], ['referida nota', 'referida fatura'],
         ['da nota fiscal', 'da fatura'], ['a nota fiscal', 'a fatura'],
         ['nota fiscal.', 'fatura.'], ['nota fiscal,', 'fatura,'], ['nota fiscal ', 'fatura ']];
  } else if (tipo === 'nota_debito') {
    subs = contexto === 'proposta'
      ? [['Valor Total da NF:', 'Valor Total da Nota de Débito:'], ['Número da Nota Fiscal:', 'Número da Nota de Débito:'],
         ['Número da NF:', 'Número da Nota de Débito:'], ['nota fiscal,', 'nota de débito,'],
         ['nota fiscal.', 'nota de débito.'], ['nota fiscal ', 'nota de débito ']]
      : [['Tomador da Nota Fiscal', 'Tomador da Nota de Débito'], ['vencimento estipulada na Nota Fiscal', 'vencimento estipulada na Nota de Débito'],
         ['Nota Fiscal a que se refere', 'Nota de Débito a que se refere'], ['Número da Nota Fiscal:', 'Número da Nota de Débito:'],
         ['da Nota Fiscal', 'da Nota de Débito'], ['a nota fiscal e o aceite', 'a nota de débito e o aceite'],
         ['referida nota fiscal', 'referida nota de débito'], ['referida nota', 'referida nota de débito'],
         ['da nota fiscal', 'da nota de débito'], ['a nota fiscal', 'a nota de débito'],
         ['nota fiscal.', 'nota de débito.'], ['nota fiscal,', 'nota de débito,'], ['nota fiscal ', 'nota de débito ']];
  } else if (tipo === 'ordem_servico') {
    subs = contexto === 'proposta'
      ? [['Valor Total da NF:', 'Valor Total da Ordem de Serviço:'], ['Número da Nota Fiscal:', 'Número da Ordem de Serviço:'],
         ['Número da NF:', 'Número da OS:'], ['nota fiscal,', 'ordem de serviço,'],
         ['nota fiscal.', 'ordem de serviço.'], ['nota fiscal ', 'ordem de serviço ']]
      : [['Tomador da Nota Fiscal', 'Tomador da Ordem de Serviço'], ['vencimento estipulada na Nota Fiscal', 'vencimento estipulada na Ordem de Serviço'],
         ['Nota Fiscal a que se refere', 'Ordem de Serviço a que se refere'], ['Número da Nota Fiscal:', 'Número da Ordem de Serviço:'],
         ['da Nota Fiscal', 'da Ordem de Serviço'], ['a nota fiscal e o aceite', 'a ordem de serviço e o aceite'],
         ['referida nota fiscal', 'referida ordem de serviço'], ['referida nota', 'referida ordem de serviço'],
         ['da nota fiscal', 'da ordem de serviço'], ['a nota fiscal', 'a ordem de serviço'],
         ['nota fiscal.', 'ordem de serviço.'], ['nota fiscal,', 'ordem de serviço,'], ['nota fiscal ', 'ordem de serviço ']];
  } else if (tipo === 'contrato') {
    subs = contexto === 'proposta'
      ? [['Valor Total da NF:', 'Valor Total do Contrato:'], ['Número da Nota Fiscal:', 'Número do Contrato:'],
         ['Número da NF:', 'Número do Contrato:'], ['nota fiscal,', 'contrato,'],
         ['nota fiscal.', 'contrato.'], ['nota fiscal ', 'contrato ']]
      : [['Tomador da Nota Fiscal', 'Contratante'], ['vencimento estipulada na Nota Fiscal', 'vencimento estipulado no Contrato'],
         ['Nota Fiscal a que se refere', 'Contrato a que se refere'], ['Número da Nota Fiscal:', 'Número do Contrato:'],
         ['da Nota Fiscal', 'do Contrato'], ['Da Nota Fiscal', 'Do Contrato'],
         ['a Nota Fiscal', 'o Contrato'], ['A Nota Fiscal', 'O Contrato'],
         ['a nota fiscal e o aceite', 'o contrato e o aceite'], ['à referida nota fiscal', 'ao referido contrato'],
         ['referida nota fiscal', 'referido contrato'], ['referida nota', 'referido contrato'],
         ['da nota fiscal', 'do contrato'], ['a nota fiscal', 'o contrato'],
         ['nota fiscal.', 'contrato.'], ['nota fiscal,', 'contrato,'], ['nota fiscal ', 'contrato '],
         ['a Contrato', 'o Contrato'], ['à Contrato', 'ao Contrato']];
  }

  for (const [de, para] of subs) xml = xml.split(de).join(para);
  return xml;
}

/** Parágrafo vazio: o Word exige um antes e depois de cada tabela. */
const SPACER = '<w:p><w:pPr><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/></w:pPr></w:p>';

/** Tabela de cálculo da proposta - porte de `_make_table_xml`. */
function tabelaXml(r: Resultado, ocultarTaxa: boolean): string {
  const WS = ocultarTaxa ? [900, 1500, 1900, 900, 1400, 1675] : [900, 1500, 1900, 900, 800, 1400, 1675];
  const HDRS = ocultarTaxa
    ? ['Parc.', 'Valor', 'Intervalo', 'Duração', 'Juros', 'Valor Líquido']
    : ['Parc.', 'Valor', 'Intervalo', 'Duração', 'Taxa', 'Juros', 'Valor Líquido'];
  const TOTAL_W = WS.reduce((a, b) => a + b, 0);
  const THICK: [string, number] = ['000000', 8];
  const THIN: [string, number] = ['AAAAAA', 4];

  const borda = (nome: string, spec: [string, number] | null) =>
    spec === null
      ? `<w:${nome} w:val="nil"/>`
      : `<w:${nome} w:val="single" w:sz="${spec[1]}" w:space="0" w:color="${spec[0]}"/>`;

  const bordas = (top: [string, number] | null, bottom: [string, number] | null) =>
    `<w:tcBorders>${borda('top', top)}${borda('left', null)}${borda('bottom', bottom)}${borda('right', null)}</w:tcBorders>`;

  const margens = '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
    + '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>';

  function celula(texto: string, w: number, o: { bold?: boolean; align?: string; top?: [string, number] | null; bottom?: [string, number] | null } = {}) {
    const bld = o.bold ? '<w:b/><w:bCs/>' : '';
    // o alinhamento sai sempre no XML, inclusive o 'left' padrão (igual ao _cell original)
    const jc = `<w:jc w:val="${o.align ?? 'left'}"/>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${bordas(o.top ?? null, o.bottom ?? null)}${margens}</w:tcPr>`
      + `<w:p><w:pPr>${jc}<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr>`
      + `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:hAnsi="Calibri"/>${bld}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`
      + `<w:t xml:space="preserve">${xmlEsc(texto)}</w:t></w:r></w:p></w:tc>`;
  }

  /** Formato contábil: "R$" à esquerda, número à direita via tab stop. */
  function celulaContabil(texto: string, w: number, o: { bold?: boolean; top?: [string, number] | null; bottom?: [string, number] | null } = {}) {
    const partes = texto.split(' ');
    const moeda = partes.length > 1 ? partes[0] : '';
    const numero = partes.length > 1 ? partes.slice(1).join(' ') : texto;
    const bld = o.bold ? '<w:b/><w:bCs/>' : '';
    const rpr = `<w:rPr><w:rFonts w:ascii="Calibri" w:cs="Calibri" w:hAnsi="Calibri"/>${bld}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>`;
    return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${bordas(o.top ?? null, o.bottom ?? null)}${margens}</w:tcPr>`
      + `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${w - 160}"/></w:tabs>`
      + `<w:spacing w:line="240" w:lineRule="auto" w:before="0" w:after="0"/></w:pPr>`
      + `<w:r>${rpr}<w:t xml:space="preserve">${xmlEsc(moeda)}</w:t></w:r>`
      + `<w:r>${rpr}<w:tab/></w:r>`
      + `<w:r>${rpr}<w:t>${xmlEsc(numero)}</w:t></w:r></w:p></w:tc>`;
  }

  let cabecalho = '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
  HDRS.forEach((h, i) => { cabecalho += celula(h, WS[i], { bold: true, align: 'center', top: THICK, bottom: THICK }); });
  cabecalho += '</w:tr>';

  let linhas = '';
  for (const p of r.parcelas) {
    let linha = '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
    let c = 0;
    linha += celula(String(p.n), WS[c++], { align: 'center', bottom: THIN });
    linha += celulaContabil(fmtMoeda(p.valor), WS[c++], { bottom: THIN });
    linha += celula(fmtIntervalo(p.dataPgto, p.dataVenc), WS[c++], { align: 'center', bottom: THIN });
    linha += celula(`${p.dias} dias`, WS[c++], { align: 'center', bottom: THIN });
    if (!ocultarTaxa) linha += celula(fmtPct(p.taxa * 100, 2), WS[c++], { align: 'center', bottom: THIN });
    linha += celulaContabil(fmtMoeda(p.juros), WS[c++], { bottom: THIN });
    linha += celulaContabil(fmtMoeda(p.liquido), WS[c++], { bottom: THIN });
    linhas += linha + '</w:tr>';
  }

  let total = '<w:tr><w:trPr><w:cantSplit/></w:trPr>';
  total += celula('', WS[0], { top: THICK, bottom: THICK });
  total += celulaContabil(fmtMoeda(r.totalBruto), WS[1], { bold: true, top: THICK, bottom: THICK });
  for (let i = 2; i < WS.length - 1; i++) total += celula('', WS[i], { top: THICK, bottom: THICK });
  total += celulaContabil(fmtMoeda(r.totalLiquido), WS[WS.length - 1], { bold: true, top: THICK, bottom: THICK });
  total += '</w:tr>';

  return `<w:tbl><w:tblPr><w:tblW w:w="${TOTAL_W}" w:type="dxa"/><w:tblLayout w:type="fixed"/>`
    + '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
    + '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>'
    + `<w:tblGrid>${WS.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + cabecalho + linhas + total + '</w:tbl>'
    // o Word exige um parágrafo logo após a tabela - o original já o devolve aqui
    + SPACER;
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function fmtIntervalo(inicioIso: string, fimIso: string): string {
  const [, mi, di] = inicioIso.split('-');
  const [, mf, df] = fimIso.split('-');
  return `${di}/${MESES_ABREV[Number(mi) - 1]} a ${df}/${MESES_ABREV[Number(mf) - 1]}`;
}


/** Substitui um parágrafo inteiro (o que contém `marcador`) pelo conteúdo dado. */
function trocarParagrafoDe(xml: string, marcador: string, novo: string): string {
  const idx = xml.indexOf(marcador);
  if (idx === -1) return xml;
  const inicio = xml.lastIndexOf('<w:p ', idx);
  const fim = xml.indexOf('</w:p>', idx) + 6;
  if (inicio === -1 || fim < 6) return xml;
  return xml.slice(0, inicio) + novo + xml.slice(fim);
}

// ── Dados de entrada ─────────────────────────────────────────────────────────

export interface DadosProposta {
  clienteRazao: string;
  clienteCnpj: string;
  sacadoRazao: string;
  sacadoCnpj: string;
  /** Valor de face do documento (NF, fatura…) */
  valorTotal: number;
  /** Quanto será antecipado; igual ao total quando a antecipação é integral */
  valorAntecipado: number;
  /** Texto livre, como aparece na proposta (dd/mm/aaaa) */
  dataEmissao: string;
  numeroNf: string;
  servico: string;
  tipoDocumento: TipoDocumento;
}

export interface OpcoesProposta {
  tipo: 'avista' | 'parcelado';
  marca: Marca;
  ocultarTaxa: boolean;
  /** Data impressa como "Data da Proposta" (ISO) */
  dataProposta: string;
}

// ── Proposta parcelada - porte de `gerar_docx` ───────────────────────────────

export function gerarPropostaParcelada(dados: DadosProposta, r: Resultado, op: OpcoesProposta): Buffer {
  const files = lerTemplate(op.marca === 'prematch' ? 'proposta-parcelada-prematch.docx' : 'proposta-parcelada-dux.docx');
  let xml = dec.decode(files['word/document.xml']);

  const datasVencStr = r.parcelas.map(p => fmtDataCurta(p.dataVenc)).join(', ');

  if (op.ocultarTaxa) {
    for (const nome of ['Taxa de Desconto*', 'Taxa Diária']) {
      xml = removerParasComPlaceholder(xml, ph(nome));
    }
    xml = removerParasRotuloTaxa(xml);
  }

  xml = substituirTudo(xml, {
    [ph('Cliente Razão Social')]: xmlEsc(dados.clienteRazao),
    [ph('Cliente CNPJ')]: xmlEsc(dados.clienteCnpj),
    [ph('Sacado Razão Social*')]: xmlEsc(dados.sacadoRazao),
    [ph('Sacado CNPJ*')]: xmlEsc(dados.sacadoCnpj),
    [ph('Valor Total da NF*')]: xmlEsc(fmtMoeda(dados.valorTotal)),
    [ph('Número da NF')]: xmlEsc(dados.numeroNf),
    [ph('Data de Emissão*')]: xmlEsc(dados.dataEmissao),
    [ph('Datas de Vencimento*')]: xmlEsc(datasVencStr),
    [ph('Serviço Prestado*')]: xmlEsc(dados.servico),
    [ph('Valor a Ser Antecipado*')]: xmlEsc(fmtMoeda(dados.valorAntecipado || dados.valorTotal)),
    [ph('Taxa de Desconto*')]: xmlEsc(fmtPctAuto(r.taxaMensalPct)),
    [ph('Taxa Diária')]: xmlEsc(fmtPct(r.taxaDiariaPct, 4)),
    [ph('Data de Antecipação*')]: xmlEsc(fmtData(r.parcelas[0].dataPgto)),
    [ph('Data da Proposta')]: xmlEsc(fmtDataExtenso(op.dataProposta)),
    'R$ XXXX': xmlEsc(fmtMoeda(r.totalLiquido)),
  });

  // Barra lateral: a célula com gridSpan=2 herda a borda preta direita da tabela
  xml = xml.replace(
    '<w:gridSpan w:val="2"/><w:tcBorders>',
    '<w:gridSpan w:val="2"/><w:tcBorders><w:right w:color="ffffff" w:space="0" w:sz="0" w:val="nil"/>',
  );

  // "Cálculo do valor a ser antecipado": tira a justificação e força página 2
  // (sem quebra quando a taxa está oculta - aí a tabela sobe para a página 1)
  const calcRe = /<w:p[ >](?:(?!<\/w:p>)[\s\S])*?lculo do valor a ser antecipado(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/;
  const calcM = xml.match(calcRe);
  if (calcM) {
    let novo = calcM[0].split('<w:jc w:val="both"/>').join('<w:jc w:val="left"/>');
    if (!op.ocultarTaxa && !novo.includes('<w:pageBreakBefore/>')) {
      novo = novo.replace(/(<w:pPr[^>]*>)/, '$1<w:pageBreakBefore/>');
    }
    if (op.ocultarTaxa) {
      novo = novo.split('<w:pageBreakBefore/>').join('').split('<w:pageBreakBefore w:val="1"/>').join('');
    }
    const inicio = calcM.index!;
    let antes = xml.slice(0, inicio);
    const depois = xml.slice(inicio + calcM[0].length);
    // Remove parágrafos totalmente vazios antes do bloco (evita página em branco)
    antes = antes.replace(/(?:<w:p[ >](?:(?!<\/w:p>)[\s\S])*?<\/w:p>\s*)+$/, m => (/<w:t[ >]/.test(m) ? m : ''));
    xml = antes + novo + depois;
  }

  // Placeholders do template são vermelhos; a versão do cliente sai em preto
  xml = xml.split('<w:color w:val="ff0000"/>').join('').split('<w:color w:val="FF0000"/>').join('');

  // Parágrafos do cabeçalho sem w:after explícito ganham 8pt do Word
  xml = xml.split('<w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/>')
    .join('<w:widowControl w:val="0"/><w:spacing w:after="0" w:before="0" w:line="240" w:lineRule="auto"/>');

  // <<Parcelas>> → uma linha por parcela
  const phParcelas = ph('Parcelas');
  if (xml.includes(phParcelas)) {
    const itens = r.parcelas
      .map(p => `- ${p.ord} Parcela: ${fmtMoeda(p.valor)} com vencimento em ${fmtDataCurta(p.dataVenc)}`)
      .map(l => paraItem(l, 'parcelas'))
      .join('\n    ');
    xml = trocarParagrafoDe(xml, phParcelas, itens);
  }

  // <<ParcelasSimples>> → lista logo após o parágrafo, que é preservado
  const phSimples = ph('ParcelasSimples');
  if (xml.includes(phSimples)) {
    const idx = xml.indexOf(phSimples);
    let fimPara = xml.indexOf('</w:p>', idx) + 6;
    const runRe = new RegExp(`<w:r[^>]*>(?:(?!</w:r>)[\\s\\S])*?${phSimples}(?:(?!</w:r>)[\\s\\S])*?</w:r>`);
    const runM = xml.match(runRe);
    if (runM) {
      xml = xml.slice(0, runM.index!) + xml.slice(runM.index! + runM[0].length);
      fimPara -= runM[0].length;
    }
    const itens = r.parcelas
      .map(p => `- ${p.ord} Parcela: ${fmtMoeda(p.valor)} em ${fmtDataCurta(p.dataVenc)}`)
      .map(l => paraItem(l, 'simples'))
      .join('\n    ');
    xml = xml.slice(0, fimPara) + '\n    ' + itens + xml.slice(fimPara);
  }

  // [foto da tabela aqui] → tabela de cálculo
  if (xml.includes('[foto da tabela aqui]')) {
    xml = trocarParagrafoDe(xml, '[foto da tabela aqui]', SPACER + tabelaXml(r, op.ocultarTaxa) + SPACER);
  }

  xml = adaptarTipoDocumento(xml, dados.tipoDocumento, 'proposta');
  xml = removerLinhaNumeroVazio(xml, dados.numeroNf);

  files['word/document.xml'] = enc.encode(xml);
  return empacotar(files);
}

// ── Proposta à vista - porte de `gerar_docx_avista` ──────────────────────────

export function gerarPropostaAvista(dados: DadosProposta, r: Resultado, op: OpcoesProposta): Buffer {
  const files = lerTemplate(op.marca === 'prematch' ? 'proposta-avista-prematch.docx' : 'proposta-avista-dux.docx');
  let xml = dec.decode(files['word/document.xml']);

  const p = r.parcelas[0];
  const taxaDiariaTotalPct = r.taxaDiariaPct * p.dias;

  // Tolerância de 48h: próximo dia útil a partir de 2 dias corridos do vencimento
  let tolerancia = somaDias(p.dataVenc, 2);
  for (let i = 0; i < 30 && !isDiaUtil(tolerancia); i++) tolerancia = somaDias(tolerancia, 1);

  const periodoEtiqueta = `de ${fmtData(p.dataPgto)} a ${fmtData(p.dataVenc)}`;
  const taxaEtiqueta = `${fmtPctAuto(r.taxaMensalPct)} ao mês, aplicada proporcionalmente para o período de ${p.dias} dias`;
  const tipoAdiantamento = Math.abs(p.valor - dados.valorTotal) < 0.01 ? 'adiantamento total' : 'adiantamento parcial';
  const valorEtiqueta = `${fmtMoeda(p.valor)} (${tipoAdiantamento})`;

  if (op.ocultarTaxa) {
    for (const nome of ['Taxa de Desconto Etiqueta', 'Taxa Diária', 'Taxa Diária Total']) {
      xml = removerParasComPlaceholder(xml, ph(nome));
    }
    xml = removerParasRotuloTaxa(xml);
  }

  xml = substituirTudo(xml, {
    [ph('Cliente Razão Social')]: xmlEsc(dados.clienteRazao),
    [ph('Cliente CNPJ')]: xmlEsc(dados.clienteCnpj),
    [ph('Sacado Razão Social*')]: xmlEsc(dados.sacadoRazao),
    [ph('Sacado CNPJ*')]: xmlEsc(dados.sacadoCnpj),
    [ph('Valor Total da NF*')]: xmlEsc(fmtMoeda(dados.valorTotal)),
    [ph('Número da NF')]: xmlEsc(dados.numeroNf),
    [ph('Data de Emissão*')]: xmlEsc(dados.dataEmissao),
    [ph('Data de Vencimento*')]: xmlEsc(fmtData(p.dataVenc)),
    [ph('Serviço Prestado*')]: xmlEsc(dados.servico),
    [ph('Valor a Ser Antecipado Etiqueta')]: xmlEsc(valorEtiqueta),
    [ph('Valor a Ser Antecipado*')]: xmlEsc(fmtMoeda(p.valor)),
    [ph('Taxa de Desconto Etiqueta')]: xmlEsc(taxaEtiqueta),
    [ph('Período de Antecipação Etiqueta')]: xmlEsc(periodoEtiqueta),
    [ph('Taxa Diária')]: xmlEsc(fmtPct(r.taxaDiariaPct, 4)),
    [ph('Período de Dias')]: xmlEsc(String(p.dias)),
    [ph('Taxa Diária Total')]: xmlEsc(fmtPct(taxaDiariaTotalPct, 4)),
    [ph('Juros Totais')]: xmlEsc(fmtMoeda(p.juros)),
    [ph('Valor Efetivamente Antecipado')]: xmlEsc(fmtMoeda(p.liquido)),
    [ph('Tolerância 48h Etiqueta')]: xmlEsc(fmtData(tolerancia)),
    [ph('Data da Proposta')]: xmlEsc(fmtDataExtenso(op.dataProposta)),
  });

  xml = xml.split('<w:color w:val="ff0000"/>').join('').split('<w:color w:val="FF0000"/>').join('');
  xml = dividirParagrafosCompostos(xml);

  xml = xml.replace(
    '<w:gridSpan w:val="2"/><w:tcBorders>',
    '<w:gridSpan w:val="2"/><w:tcBorders><w:right w:color="ffffff" w:space="0" w:sz="0" w:val="nil"/>',
  );

  // "FORMA DE PAGAMENTO" não deve ficar sozinho no pé da página
  const formaRe = /<w:p[ >](?:(?!<\/w:p>)[\s\S])*?FORMA DE PAGAMENTO(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/;
  const formaM = xml.match(formaRe);
  if (formaM && !formaM[0].includes('<w:keepWithNext/>')) {
    const novo = formaM[0].replace(/(<w:pPr[^>]*>)/, '$1<w:keepWithNext/>');
    xml = xml.slice(0, formaM.index!) + novo + xml.slice(formaM.index! + formaM[0].length);
  }

  // Rodapé: encurta a régua de underscores para não estourar a linha
  if (files['word/footer2.xml']) {
    const rodape = dec.decode(files['word/footer2.xml']).replace(
      '______________________________________________________________________________________________________',
      '__________________________________________________________________________________________',
    );
    files['word/footer2.xml'] = enc.encode(rodape);
  }

  xml = adaptarTipoDocumento(xml, dados.tipoDocumento, 'proposta');
  xml = removerLinhaNumeroVazio(xml, dados.numeroNf);

  files['word/document.xml'] = enc.encode(xml);
  return empacotar(files);
}

/**
 * Divide parágrafos "RÓTULO<br/>CORPO" em dois - o rótulo alinhado à esquerda e o
 * corpo justificado. Porte de `_split_compound_paragraphs`; só se aplica quando o
 * trecho antes da quebra é curto (≤ 60 chars), para não partir texto corrido.
 */
function dividirParagrafosCompostos(xml: string): string {
  return xml.replace(/(<w:p\b[^>]*>)([\s\S]*?)(<\/w:p>)/g, (todo, abre: string, corpo: string, fecha: string) => {
    if (!corpo.includes('<w:jc w:val="both"/>') || !corpo.includes('textWrapping')) return todo;

    const brM = corpo.match(/(<w:r\b[^>]*>)((?:(?!<\/w:r>)[\s\S])*?)(<w:br\s+w:type="textWrapping"\s*\/>)((?:(?!<\/w:r>)[\s\S])*?)(<\/w:r>)/);
    const pprM = corpo.match(/<w:pPr>([\s\S]*?)<\/w:pPr>/);
    if (!brM || !pprM) return todo;

    const runsAntes = corpo.slice(pprM.index! + pprM[0].length, brM.index!);
    const rotulo = (runsAntes + brM[2]).replace(/<[^>]+>/g, '').trim();
    if (rotulo.length > 60) return todo;

    const pprInner = pprM[1];
    const pprEsquerda = pprInner.split('<w:jc w:val="both"/>').join('<w:jc w:val="left"/>');
    const runRotulo = brM[1] + brM[2] + brM[5];
    const conteudoCorpo = corpo.slice(brM.index! + brM[0].length);

    return abre + `<w:pPr>${pprEsquerda}</w:pPr>` + runsAntes + runRotulo + fecha
      + abre + `<w:pPr>${pprInner}</w:pPr>` + conteudoCorpo + fecha;
  });
}

/** Nome de arquivo no padrão do original - porte de `_primeiro_nome_razao`. */
export function primeiroNomeRazao(razao: string): string {
  const partes = (razao || 'EMPRESA').trim().split(/\s+/);
  for (const p of partes) {
    const limpo = p.replace(/[^\p{L}\p{N}_]/gu, '');
    if (limpo && !/^\d+$/.test(limpo)) return limpo.toUpperCase();
  }
  return partes[0] ? partes[0].replace(/[^\p{L}\p{N}_]/gu, '').toUpperCase() : 'EMPRESA';
}
