// ─────────────────────────────────────────────────────────────────────────────
//  A apresentação de uma proposta já registrada, montada de novo.
//
//  O servidor guarda os campos da proposta, e não o arquivo - como o contrato,
//  que sai do modelo. Quem precisa ver uma que já saiu (o chip no card do lead,
//  o histórico do gerador) pede os campos e monta aqui, com o mesmo template.
// ─────────────────────────────────────────────────────────────────────────────
import { MARCAS, type Marca } from '../marcas';
import { montarPrevia, montarProposta } from './montar';
import { esc } from './slides';
import type { DadosProposta } from './tipos';

let templateLido: Promise<string | null> | null = null;

/** O template mora em `public/` e é buscado na hora: são kilobytes que só quem
 *  monta ou abre uma proposta precisa baixar. Lido uma vez por aba, já com as
 *  marcas dos clientes no slide "Nossos clientes". */
export function lerTemplate(): Promise<string | null> {
  if (!templateLido) {
    templateLido = fetch('/propostas/base.v3.template.html')
      .then(r => (r.ok ? r.text() : null))
      .catch(() => null)
      .then(async t => {
        // Falhou: a próxima chamada tenta de novo, em vez de herdar o erro.
        if (t == null) { templateLido = null; return null; }
        return comAsMarcas(t);
      });
  }
  return templateLido;
}

/** Um arquivo de `public/` como `data:`, para ir dentro da proposta. Nulo se
 *  não veio: a marca que falhou fica de fora, e o resto do mural sai. */
async function emDataUri(src: string): Promise<string | null> {
  try {
    const r = await fetch(src);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise(ok => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = () => ok(null);
      leitor.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** O card de uma marca no mural.
 *
 *  A altura parte da altura óptica do carrossel (`altura`), escalada para o
 *  card: as proporções das marcas são muito diferentes, e a mesma altura para
 *  todas deixaria umas gigantes e outras sumidas - é o mesmo acerto que o
 *  carrossel já fez, aproveitado aqui. Marca de uma cor só entra por máscara,
 *  com a cor dela pintada por trás. */
function cardDaMarca(m: Marca, uri: string): string {
  const a = m.altura;
  const altura = `clamp(${Math.round(a * 0.55)}px,${(a * 0.085).toFixed(3)}vw,${Math.round(a * 1.25)}px)`;
  if (m.cor && m.proporcao) {
    return `<div class="logo-card"><span class="marca-tingida" role="img" aria-label="${esc(m.nome)}" `
      + `style="--m:url('${uri}');background:${m.cor};height:${altura};aspect-ratio:${m.proporcao}"></span></div>`;
  }
  // Logo desenhada em branco some no card branco: escurece, como nos seletores.
  const filtro = m.fundoEscuro ? ';filter:brightness(0.15)' : '';
  return `<div class="logo-card"><img src="${uri}" alt="${esc(m.nome)}" `
    + `style="height:${altura};width:auto;max-width:100%;max-height:none;object-fit:contain${filtro}"></div>`;
}

/** O template com as marcas do portal no lugar do marcador: as mesmas do
 *  carrossel da entrada e dos seletores de cliente, na mesma ordem. Logo nova
 *  cadastrada em `lib/marcas` passa a sair nas propostas sem tocar no
 *  template. */
async function comAsMarcas(template: string): Promise<string> {
  const marcador = '<!-- LOGOS_DO_PORTAL';
  if (!template.includes(marcador)) return template;
  const uris = await Promise.all(MARCAS.map(m => emDataUri(m.src)));
  const cards = MARCAS
    .map((m, i) => (uris[i] ? cardDaMarca(m, uris[i]!) : ''))
    .filter(Boolean)
    .join('\n      ');
  return template.replace(marcador, `${cards}\n      ${marcador}`);
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
