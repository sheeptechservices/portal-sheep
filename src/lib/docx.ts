// ─────────────────────────────────────────────────────────────────────────────
//  Monta um .docx a partir de parágrafos.
//
//  Um .docx é um zip com XML dentro, e a `fflate` - que a exportação de tarefas
//  já usa para o .xlsx - fecha o zip. Não há dependência nova nem template
//  binário no repositório: o texto do contrato mora em código, onde dá para ler
//  o diff quando uma cláusula muda.
//
//  O arquivo sai editável de propósito. Contrato quase sempre precisa de um
//  ajuste de última hora, e PDF fechado obrigaria a refazer tudo por causa de
//  uma vírgula.
// ─────────────────────────────────────────────────────────────────────────────
import { zipSync, strToU8 } from 'fflate';

/** Um pedaço de texto dentro do parágrafo. O negrito é por trecho porque o
 *  contrato marca só o rótulo - "CONTRATANTE:" - e não a frase inteira. */
export interface Trecho {
  texto: string;
  negrito?: boolean;
  sublinhado?: boolean;
}

export interface Paragrafo {
  trechos: Trecho[];
  alinhamento?: 'esquerda' | 'centro' | 'justificado';
  /** Altura da linha, em pontos. Fixa, e não múltiplo do corpo: é assim que a
   *  folha sai igual no Word e no PDF. */
  entrelinha?: number;
  /** Espaço depois do parágrafo, em pontos. */
  depois?: number;
}

/** As medidas do contrato assinado, e o padrão de quem não disser nada. */
export const ENTRELINHA_PADRAO = 14.33;
export const DEPOIS_PADRAO = 8;

const esc = (v: string) => v
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  // Caractere de controle quebra o arquivo inteiro no Word, e sem dizer onde.
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

const ALINHAMENTO = { esquerda: 'left', centro: 'center', justificado: 'both' } as const;

function xmlParagrafo(p: Paragrafo): string {
  const jc = ALINHAMENTO[p.alinhamento ?? 'justificado'];
  // 20 twips = 1 ponto. A entrelinha vai como `exact` de propósito: em `auto` o
  // Word recalcula pela fonte instalada, e a folha deixa de bater com o PDF.
  const linha = Math.round((p.entrelinha ?? ENTRELINHA_PADRAO) * 20);
  const depois = Math.round((p.depois ?? DEPOIS_PADRAO) * 20);
  const runs = p.trechos.map(t => {
    const rpr = (t.negrito ? '<w:b/>' : '') + (t.sublinhado ? '<w:u w:val="single"/>' : '');
    return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ''}`
      + `<w:t xml:space="preserve">${esc(t.texto)}</w:t></w:r>`;
  }).join('');
  return `<w:p><w:pPr><w:jc w:val="${jc}"/>`
    + `<w:spacing w:before="0" w:after="${depois}" w:line="${linha}" w:lineRule="exact"/>`
    + `</w:pPr>${runs}</w:p>`;
}

const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const CABECA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Uma imagem no corpo do documento. O tamanho vai em centímetros, que é como
 *  se pensa um logotipo numa folha - a conversão para a unidade do Word fica
 *  aqui dentro. */
export interface ImagemDocx {
  bytes: Uint8Array;
  larguraCm: number;
  alturaCm: number;
}

/** EMU: a unidade do Office. 360000 por centímetro. */
const emu = (cm: number) => Math.round(cm * 360000);

/** O parágrafo que carrega a imagem, centralizado. */
function xmlImagem(img: ImagemDocx, rel: string): string {
  const cx = emu(img.larguraCm);
  const cy = emu(img.alturaCm);
  // 30 pt depois da marca, a mesma folga do PDF: encostada no título ela lê
  // como parte dele, e não como o papel timbrado que é.
  return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="600"/></w:pPr>'
    + '<w:r><w:drawing>'
    + `<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="${NS_WP}">`
    + `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Logotipo"/>`
    + `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">`
    + `<pic:pic xmlns:pic="${NS_PIC}">`
    + '<pic:nvPicPr><pic:cNvPr id="1" name="logo.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${rel}" xmlns:r="${NS_R}"/>`
    + '<a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>'
    + '</pic:pic></a:graphicData></a:graphic></wp:inline>'
    + '</w:drawing></w:r></w:p>';
}

/**
 * Devolve os bytes do .docx. `imagemTopo` entra centralizada, antes do primeiro
 * parágrafo - é onde mora o logotipo.
 */
export function montarDocx({ paragrafos, imagemTopo }: {
  paragrafos: Paragrafo[];
  imagemTopo?: ImagemDocx;
}): Uint8Array {
  const corpo = (imagemTopo ? xmlImagem(imagemTopo, 'rId2') : '')
    + paragrafos.map(xmlParagrafo).join('');

  const relsDoc = [
    `<Relationship Id="rId1" Type="${NS_R}/styles" Target="styles.xml"/>`,
    imagemTopo ? `<Relationship Id="rId2" Type="${NS_R}/image" Target="media/logo.png"/>` : '',
  ].join('');

  const sectPr = '<w:sectPr>'
    // A4 em twips, com 2,5 cm de margem.
    + '<w:pgSz w:w="11906" w:h="16838"/>'
    + '<w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/>'
    + '</w:sectPr>';

  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`${CABECA}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`),

    '_rels/.rels': strToU8(`${CABECA}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="${NS_R}/officeDocument" Target="word/document.xml"/>
</Relationships>`),

    'word/_rels/document.xml.rels': strToU8(`${CABECA}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relsDoc}</Relationships>`),

    // Tahoma 11, que é a fonte do contrato assinado.
    'word/styles.xml': strToU8(`${CABECA}
<w:styles xmlns:w="${NS_W}">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Tahoma" w:hAnsi="Tahoma" w:cs="Tahoma"/><w:sz w:val="22"/><w:szCs w:val="22"/>
<w:lang w:val="pt-BR"/>
</w:rPr></w:rPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
</w:styles>`),

    'word/document.xml': strToU8(`${CABECA}
<w:document xmlns:w="${NS_W}" xmlns:r="${NS_R}"><w:body>${corpo}${sectPr}</w:body></w:document>`),
  };

  if (imagemTopo) arquivos['word/media/logo.png'] = imagemTopo.bytes;

  return zipSync(arquivos, { level: 6 });
}

/** Entrega o arquivo ao navegador. Mesmo caminho da exportação de tarefas. */
export function baixarDocx(bytes: Uint8Array, nome: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
