// ─────────────────────────────────────────────────────────────────────────────
//  O arquivo da proposta feita fora do gerador.
//
//  Uma requisição da Vercel para em 4,5 MB, na ida e na volta, e o PDF de uma
//  apresentação passa disso com facilidade. Então o arquivo sobe cortado em
//  partes de 2,4 MB - todas ao mesmo tempo, e não em fila - e desce do mesmo
//  jeito, remontado aqui.
//
//  2,4 MB é múltiplo de 3: o base64 de cada parte sai sem o `=` do fim, e as
//  partes coladas em ordem são o base64 do arquivo inteiro.
// ─────────────────────────────────────────────────────────────────────────────

export const BYTES_POR_PARTE = 2_400_000;
/** O teto da tela. O servidor aceita até 12 partes; 25 MB cabem em 11. */
export const LIMITE_DO_ARQUIVO = 25 * 1024 * 1024;

/** O arquivo, como a proposta o descreve. */
export interface ArquivoDaProposta {
  nome: string;
  tipo: string;
  tamanho: number;
  partes: number;
}

const POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  html: 'text/html',
  htm: 'text/html',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppt: 'application/vnd.ms-powerpoint',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  key: 'application/x-iwork-keynote-sffkey',
  zip: 'application/zip',
};

/** O tipo do arquivo. O navegador às vezes não sabe dizer (o .key, o .pptx em
 *  alguns sistemas), e aí vale a extensão. */
export function tipoDoArquivo(f: File): string {
  if (f.type) return f.type;
  return POR_EXTENSAO[f.name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** O que a prévia da casa abre por dentro. O resto fica para baixar. */
export const abreNaPrevia = (tipo: string) =>
  tipo === 'application/pdf' || tipo.startsWith('text/html') || tipo.startsWith('image/');

/** O formato em uma palavra, para a linha do histórico. */
export function rotuloDoFormato(a: { nome: string; tipo: string }): string {
  if (a.tipo === 'application/pdf') return 'PDF';
  if (a.tipo.startsWith('text/html')) return 'HTML';
  if (a.tipo.startsWith('image/')) return 'Imagem';
  const ext = a.nome.includes('.') ? a.nome.split('.').pop() : '';
  return ext ? ext.toUpperCase() : 'Arquivo';
}

export const pesoDoArquivo = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

function base64DoPedaco(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',').pop() ?? '');
    fr.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    fr.readAsDataURL(b);
  });
}

/** Sobe o arquivo em partes, todas de uma vez. Devolve o id do envio, que é o
 *  que a proposta usa para pegar o arquivo quando for criada. */
export async function subirArquivo(
  enviar: (corpo: Record<string, unknown>) => Promise<any>,
  f: File,
): Promise<{ ok: true; envio: string; partes: number } | { ok: false; erro: string }> {
  const envio = crypto.randomUUID();
  const partes = Math.max(1, Math.ceil(f.size / BYTES_POR_PARTE));
  const respostas = await Promise.all(Array.from({ length: partes }, async (_, ordem) => {
    try {
      const base64 = await base64DoPedaco(f.slice(ordem * BYTES_POR_PARTE, (ordem + 1) * BYTES_POR_PARTE));
      return await enviar({ action: 'enviar_parte_proposta', envio, ordem, base64 });
    } catch {
      return null;
    }
  }));
  const falha = respostas.find(r => !r?.ok);
  if (falha !== undefined) return { ok: false, erro: falha?.error ?? 'A conexão caiu no meio do envio.' };
  return { ok: true, envio, partes };
}

/** Desce as partes, todas de uma vez, e devolve o arquivo inteiro em base64. */
export async function baixarPartes(ler: (ordem: number) => Promise<any>, partes: number): Promise<string> {
  const pedacos = await Promise.all(Array.from({ length: partes }, (_, i) => ler(i).catch(() => null)));
  const ruim = pedacos.find(p => !p?.base64);
  if (ruim !== undefined) throw new Error(ruim?.error ?? 'O arquivo não veio inteiro.');
  return pedacos.map(p => String(p.base64)).join('');
}

/** Entrega o arquivo para o navegador salvar, com o nome com que ele subiu. */
export function salvarArquivo(base64: string, tipo: string, nome: string) {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
