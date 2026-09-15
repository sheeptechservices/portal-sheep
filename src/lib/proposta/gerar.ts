// ─────────────────────────────────────────────────────────────────────────────
//  A apresentação de uma proposta já registrada, montada de novo.
//
//  O servidor guarda os campos da proposta, e não o arquivo - como o contrato,
//  que sai do modelo. Quem precisa ver uma que já saiu (o chip no card do lead,
//  o histórico do gerador) pede os campos e monta aqui, com o mesmo template.
// ─────────────────────────────────────────────────────────────────────────────
import { montarPrevia, montarProposta } from './montar';
import type { DadosProposta } from './tipos';

let templateLido: Promise<string | null> | null = null;

/** O template mora em `public/` e é buscado na hora: são 83 kB que só quem
 *  monta ou abre uma proposta precisa baixar. Lido uma vez por aba. */
export function lerTemplate(): Promise<string | null> {
  if (!templateLido) {
    templateLido = fetch('/propostas/base.v3.template.html')
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null)
      .then(t => {
        // Falhou: a próxima chamada tenta de novo, em vez de herdar o erro.
        if (t == null) templateLido = null;
        return t;
      });
  }
  return templateLido;
}

/** A apresentação inteira, em HTML. Os campos guardados já passaram na
 *  conferência quando saíram; se o template mudou desde então e ela recusar, a
 *  prévia monta assim mesmo, para a proposta continuar podendo ser vista. */
export async function htmlDaProposta(dados: DadosProposta): Promise<string | null> {
  const template = await lerTemplate();
  if (!template) return null;
  const r = montarProposta(template, dados);
  return r.ok ? r.html : montarPrevia(template, dados);
}

/** O HTML em base64, que é o formato que a prévia de arquivo da casa recebe.
 *  Pelo `TextEncoder`: o `btoa` sozinho quebra no primeiro acento. */
export function emBase64(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
