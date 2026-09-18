// ─────────────────────────────────────────────────────────────────────────────
//  A marcação leve dos textos da casa, e o HTML que sai dela.
//
//  O texto é guardado puro, com uma convenção de escrita:
//
//    **negrito**      __sublinhado__      *itálico*      - item de lista
//
//  e cada lugar que o mostra o traduz. Eram três traduções copiadas - a do
//  editor, a da leitura e, agora, a dos slides da proposta -, e a primeira
//  marca nova que uma delas aprendesse e as outras não seria um texto que
//  aparece formatado num lugar e cru no outro. A regra mora aqui; quem mostra
//  escolhe só a moldura (uma `<div>` por linha no editor, `<br>` no slide).
// ─────────────────────────────────────────────────────────────────────────────

/** Endereço solto no meio do texto. Aceita `http(s)://`, `www.` e o domínio
 *  cru com barra ou caminho - é assim que a maioria cola um link. A pontuação
 *  final fica de fora: "veja em site.com/a." termina a frase, não o endereço. */
export const LINK = /((?:https?:\/\/|www\.)[^\s<>()"]+[^\s<>().,;:!?"]|(?:[a-z0-9-]+\.)+(?:com\.br|gov\.br|edu\.br|org\.br|com|net|org|dev|app|io|co|me)(?:\/[^\s<>()"]*[^\s<>().,;:!?"])?)/gi;

/** O endereço com protocolo, para o `href`. O que está escrito continua como a
 *  pessoa escreveu. */
export function enderecoDoLink(texto: string): string {
  return /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
}

/** Começo de item de lista: hífen e um espaço. Só o hífen, e não o asterisco
 *  também: o asterisco já é a marca de itálico, e duas maneiras de escrever a
 *  mesma coisa é uma a mais do que alguém precisa lembrar. */
export const ITEM = /^\s*-\s+/;

/** As marcas de uma linha, na ordem em que precisam ser testadas: as de dois
 *  caracteres antes das de um, senão `*` comeria a metade de `**`. */
export const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

/** Todo texto vira HTML escapado primeiro: o que alguém escreveu nunca vira
 *  elemento. As aspas também, porque o endereço vai para dentro de `href`. */
export function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Endereço solto vira link, que abre em outra aba. */
function linksEmHtml(trecho: string): string {
  let saida = '';
  let ultimo = 0;
  for (const m of trecho.matchAll(LINK)) {
    const i = m.index ?? 0;
    if (i > ultimo) saida += escapar(trecho.slice(ultimo, i));
    const url = escapar(enderecoDoLink(m[0]));
    saida += `<a href="${url}" target="_blank" rel="noopener noreferrer">${escapar(m[0])}</a>`;
    ultimo = i + m[0].length;
  }
  if (ultimo < trecho.length) saida += escapar(trecho.slice(ultimo));
  return saida;
}

/** As marcas de um trecho, em HTML. Recursiva: negrito com itálico dentro é o
 *  que sai quando alguém aperta os dois. */
export function marcasEmHtml(trecho: string): string {
  let saida = '';
  let ultimo = 0;
  for (const m of trecho.matchAll(INLINE)) {
    const i = m.index ?? 0;
    if (i > ultimo) saida += linksEmHtml(trecho.slice(ultimo, i));
    const t = m[0];
    if (t.startsWith('**')) saida += `<strong>${marcasEmHtml(t.slice(2, -2))}</strong>`;
    else if (t.startsWith('__')) saida += `<u>${marcasEmHtml(t.slice(2, -2))}</u>`;
    else saida += `<em>${marcasEmHtml(t.slice(1, -1))}</em>`;
    ultimo = i + t.length;
  }
  if (ultimo < trecho.length) saida += linksEmHtml(trecho.slice(ultimo));
  return saida;
}

/**
 * O texto inteiro em HTML de leitura: linhas quebradas com `<br>`, linha em
 * branco como respiro entre blocos, itens seguidos virando uma lista.
 *
 * É a moldura de quem só mostra - o slide da proposta, um documento. O editor
 * tem a dele (uma `<div>` por linha, que é o que o navegador cria ao apertar
 * Enter), mas a regra das marcas é a mesma.
 *
 * `lista` e `respiro` são o estilo inline da lista e do espaço entre blocos:
 * quem monta um documento fora do portal não tem as classes da casa.
 */
export function textoEmHtml(texto: string, estilo: { lista?: string; respiro?: string } = {}): string {
  const linhas = String(texto ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocos: string[] = [];
  let paragrafo: string[] = [];
  let itens: string[] = [];

  const fecharParagrafo = () => {
    if (paragrafo.length) blocos.push(paragrafo.join('<br>'));
    paragrafo = [];
  };
  const fecharLista = () => {
    if (!itens.length) return;
    const s = estilo.lista ? ` style="${estilo.lista}"` : '';
    blocos.push(`<ul${s}>${itens.map(i => `<li>${i}</li>`).join('')}</ul>`);
    itens = [];
  };

  for (const linha of linhas) {
    if (ITEM.test(linha)) {
      fecharParagrafo();
      itens.push(marcasEmHtml(linha.replace(ITEM, '')));
      continue;
    }
    fecharLista();
    if (!linha.trim()) { fecharParagrafo(); continue; }
    paragrafo.push(marcasEmHtml(linha));
  }
  fecharParagrafo();
  fecharLista();

  // Entre dois blocos, um respiro; a lista já traz a margem dela.
  const respiro = `<span style="display:block;height:${estilo.respiro ?? '0.6em'}"></span>`;
  return blocos
    .map((b, i) => (i > 0 && !b.startsWith('<ul') && !blocos[i - 1].startsWith('<ul') ? respiro + b : b))
    .join('');
}
