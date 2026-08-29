// Extração de texto 100% no navegador - sem API paga.
// PDFs com texto selecionável → pdfjs; imagens e PDFs escaneados → OCR (tesseract.js, idioma "por").
// Espelha a abordagem do dux_cnabTool.

import type { Worker } from 'tesseract.js';

// Lazy-load pdfjs - mantém o bundle inicial pequeno
let pdfjsLib: typeof import('pdfjs-dist') | null = null;
async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    // Worker vindo do próprio bundle (Vite resolve a URL) em vez de CDN: a leitura
    // local não pode depender de rede externa nem quebrar por CSP.
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjsLib;
}

function isImage(file: File): boolean {
  return file.type.startsWith('image/');
}

// Texto direto do PDF (camada de texto). Vazio para PDFs escaneados.
async function pdfText(file: File): Promise<string> {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let prevY: number | null = null;
    for (const item of content.items) {
      const it = item as any;
      if (!it.str) continue;
      const y: number = it.transform?.[5] ?? 0;
      if (prevY !== null && Math.abs(y - prevY) > 5) parts.push('\n');
      parts.push(it.str);
      prevY = y;
    }
    parts.push('\n');
  }
  return parts.join(' ');
}

// OCR de um PDF escaneado: renderiza cada página em canvas e reconhece.
async function pdfOCR(file: File, worker: Worker): Promise<string> {
  const pdfjs = await getPdfjs();
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const parts: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2.0 });
    let image: HTMLCanvasElement | Blob;
    if (typeof OffscreenCanvas !== 'undefined') {
      const off = new OffscreenCanvas(viewport.width, viewport.height);
      const ctx = off.getContext('2d')!;
      await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      image = await off.convertToBlob({ type: 'image/png' });
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      image = canvas;
    }
    const { data: { text } } = await worker.recognize(image);
    parts.push(text);
  }
  return parts.join('\n');
}

export interface ExtractedDoc {
  filename: string;
  text: string;
  method: 'pdf-text' | 'ocr';
}

/**
 * Extrai o texto de cada arquivo. Cria um único worker de OCR e o reaproveita.
 * onProgress recebe (índice 1-based, total, fase).
 */
export async function extractDocs(
  files: File[],
  onProgress?: (current: number, total: number, fase: string) => void,
): Promise<ExtractedDoc[]> {
  const out: ExtractedDoc[] = [];
  let worker: Worker | undefined;

  async function getWorker(): Promise<Worker> {
    if (worker) return worker;
    const { createWorker } = await import('tesseract.js');
    const w = await createWorker('por', 1);
    worker = w;
    return w;
  }

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i + 1, files.length, 'lendo');

      if (isImage(file)) {
        const w = await getWorker();
        onProgress?.(i + 1, files.length, 'ocr');
        const { data: { text } } = await w.recognize(file);
        out.push({ filename: file.name, text, method: 'ocr' });
        continue;
      }

      // PDF: tenta texto direto; se vier vazio (escaneado), cai pro OCR
      let text = '';
      try { text = await pdfText(file); } catch { /* tenta OCR abaixo */ }
      if (text.replace(/\s/g, '').length >= 30) {
        out.push({ filename: file.name, text, method: 'pdf-text' });
      } else {
        const w = await getWorker();
        onProgress?.(i + 1, files.length, 'ocr');
        const ocr = await pdfOCR(file, w);
        out.push({ filename: file.name, text: ocr, method: 'ocr' });
      }
    }
  } finally {
    await worker?.terminate();
  }

  return out;
}
