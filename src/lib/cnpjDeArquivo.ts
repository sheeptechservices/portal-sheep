// ─────────────────────────────────────────────────────────────────────────────
//  Acha o CNPJ dentro de um arquivo. Só isso.
//
//  Qualquer coisa que traga o número serve: o cartão em PDF, a página salva em
//  HTML, um Word, um texto, um print da tela. O que este módulo faz é extrair o
//  texto - com OCR, quando é imagem - e devolver o primeiro CNPJ que passa no
//  verificador.
//
//  O que o arquivo diz ALÉM do número é ignorado de propósito. Antes daqui
//  existia um leitor que garimpava razão social, endereço e bairro na folha, e
//  ele era a parte frágil: cada layout novo da Receita, cada Word colado de um
//  jeito diferente, cada foto tremida quebrava um campo. Com o número em mãos, o
//  cadastro vem da fonte - e vem o de hoje, não o do dia em que a folha foi
//  emitida.
// ─────────────────────────────────────────────────────────────────────────────
import { unzipSync, strFromU8 } from 'fflate';
import { acharCnpj } from './cnpj';

export type CnpjDoArquivo =
  | { ok: true; cnpj: string; via: 'texto' | 'ocr' }
  | { ok: false; erro: string };

/** O que a tela oferece no seletor de arquivo. */
export const TIPOS_ACEITOS =
  'application/pdf,.pdf,.docx,text/html,.html,.htm,text/plain,.txt,image/*';

// ── PDF ─────────────────────────────────────────────────────────────────────

// O pdfjs entra sob demanda: são centenas de kB que só quem manda PDF paga.
let pdfjsLib: typeof import('pdfjs-dist') | null = null;
async function carregarPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // Worker vindo do próprio bundle, e não de CDN: a leitura é local e não
    // pode depender de rede externa nem esbarrar em CSP.
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjsLib;
}

async function textoDoPdf(arquivo: File): Promise<string> {
  const pdfjs = await carregarPdfjs();
  const pdf = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const partes: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const conteudo = await (await pdf.getPage(p)).getTextContent();
    for (const item of conteudo.items) {
      const it = item as { str?: string };
      if (it.str) partes.push(it.str);
    }
  }
  // Sem separador: o pdfjs quebra o número em pedaços, e um espaço no meio
  // esconderia justamente o CNPJ que se procura.
  return partes.join('');
}

// ── Word, HTML e texto ──────────────────────────────────────────────────────

const ENTIDADES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

const decodificar = (v: string) => v
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (todo, nome) => ENTIDADES[String(nome).toLowerCase()] ?? todo);

function textoDoHtml(fonte: string): string {
  return decodificar(
    fonte
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // As tags somem sem deixar espaço: o número pode estar partido entre
      // duas delas, como em <b>50.836.466</b>/0001-08.
      .replace(/<[^>]+>/g, ''),
  );
}

function textoDoDocx(bytes: Uint8Array): string {
  const partes = unzipSync(bytes);
  const doc = partes['word/document.xml'];
  if (!doc) throw new Error('não é um .docx');
  return decodificar(strFromU8(doc).replace(/<[^>]+>/g, ''));
}

// ── Imagem: OCR, e só para achar o número ───────────────────────────────────

/**
 * O reconhecimento é limitado a números e à pontuação do CNPJ: sem isso o
 * tesseract troca 0 por O e 1 por l ao ler o resto da folha, e o número certo
 * se perde no meio. Erro que reste é pego pelo verificador.
 */
async function textoDaImagem(arquivo: File): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const trabalhador = await createWorker('eng', 1);
  try {
    await trabalhador.setParameters({ tessedit_char_whitelist: '0123456789./-' });
    const { data } = await trabalhador.recognize(arquivo);
    return data.text ?? '';
  } finally {
    await trabalhador.terminate();
  }
}

// ── Porta de entrada ────────────────────────────────────────────────────────

const ehPdf = (a: File) => a.type === 'application/pdf' || /\.pdf$/i.test(a.name);
const ehDocx = (a: File) =>
  a.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  || /\.docx$/i.test(a.name);
const ehHtml = (a: File) => /html/.test(a.type) || /\.(html?|mht|mhtml)$/i.test(a.name);
const ehTexto = (a: File) => /^text\//.test(a.type) || /\.(txt|md|csv)$/i.test(a.name);

export async function cnpjDeArquivo(arquivo: File): Promise<CnpjDoArquivo> {
  const imagem = arquivo.type.startsWith('image/');
  let texto: string;

  try {
    if (imagem) texto = await textoDaImagem(arquivo);
    else if (ehPdf(arquivo)) texto = await textoDoPdf(arquivo);
    else if (ehDocx(arquivo)) texto = textoDoDocx(new Uint8Array(await arquivo.arrayBuffer()));
    else if (ehHtml(arquivo)) texto = textoDoHtml(await arquivo.text());
    else if (ehTexto(arquivo)) texto = await arquivo.text();
    else {
      return {
        ok: false,
        erro: `Não sei abrir "${arquivo.name}". Aceito PDF, Word, HTML, texto ou print.`,
      };
    }
  } catch {
    return { ok: false, erro: 'Não consegui abrir este arquivo.' };
  }

  const cnpj = acharCnpj(texto);
  if (cnpj) return { ok: true, cnpj, via: imagem ? 'ocr' : 'texto' };

  return {
    ok: false,
    erro: imagem
      ? 'Não achei um CNPJ legível neste print. Digite os 14 dígitos no campo e clique em buscar.'
      : 'Não achei um CNPJ neste arquivo. Se ele for digitalizado não há texto para ler'
        + ' - mande um print, que eu leio a imagem.',
  };
}
