// Os arquivos de um Ctrl+V: o print recém-recortado, ou um arquivo copiado no
// explorador. É o mesmo arquivo que o botão de anexar traria, sem a janela de
// escolher.

/** O nome que o navegador dá a um print colado. Chega sempre igual, e três
 *  prints no mesmo comentário viravam três "image.png" iguais na lista. */
const NOME_GENERICO = /^image\.(png|jpe?g|gif|webp|bmp)$/i;

function nomeDoPrint(extensao: string, i: number) {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  const carimbo = `${dois(d.getDate())}-${dois(d.getMonth() + 1)}-${d.getFullYear()} ${dois(d.getHours())}h${dois(d.getMinutes())}`;
  return `Print ${carimbo}${i > 0 ? ` (${i + 1})` : ''}.${extensao}`;
}

/**
 * Os arquivos que vieram na colagem, com o print renomeado. Vazio quando o que
 * se colou é texto - e aí quem chama deixa o colar seguir o caminho normal.
 *
 * `files` cobre o print do Windows (Win+Shift+S) e do macOS; `items` é a rede
 * para o navegador que não preenche `files`.
 *
 * Copiar células do Excel ou um trecho do Word traz o texto e, junto, uma
 * imagem do mesmo trecho. Ali quem cola quer o texto: com texto na colagem e
 * só imagem de arquivo, a colagem é tratada como texto.
 */
export function arquivosColados(dados: DataTransfer | null): File[] {
  if (!dados) return [];
  const daArea = [...(dados.files ?? [])];
  const dosItens = [...(dados.items ?? [])]
    .filter(i => i.kind === 'file')
    .map(i => i.getAsFile())
    .filter((f): f is File => !!f);
  const colados = daArea.length ? daArea : dosItens;
  if (!colados.length) return [];

  const temTexto = !!dados.getData('text/plain').trim();
  if (temTexto && colados.every(f => f.type.startsWith('image/'))) return [];

  return colados.map((f, i) => {
    if (f.name && !NOME_GENERICO.test(f.name)) return f;
    const extensao = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    return new File([f], nomeDoPrint(extensao, i), { type: f.type, lastModified: f.lastModified });
  });
}
