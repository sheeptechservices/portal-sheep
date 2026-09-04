// ─────────────────────────────────────────────────────────────────────────────
//  O campo que mostra a formatação enquanto se escreve.
//
//  O que se digita aparece formatado na hora - Ctrl+B deixa negrito, e não
//  escreve `**` na tela. O que vai para o banco continua sendo o texto com as
//  marcas leves de `TextoRico`: é ele que sai em exportação, em relatório, em
//  prompt de IA e na página do cliente, e nenhum desses lugares saberia
//  desmontar HTML (nem se defender do que viesse dentro).
//
//  Então este arquivo é uma tradução de mão dupla:
//
//    texto guardado  →  HTML  (ao abrir o campo)
//    HTML editado    →  texto (a cada tecla)
//
//  A formatação em si é do navegador (`execCommand`): é o que faz o negrito
//  aparecer no mesmo quadro da tecla, com a seleção no lugar. A API está
//  marcada como obsoleta há anos e continua sendo o único caminho que todos os
//  navegadores implementam igual; o dia em que sair, o que muda é só o miolo
//  destas três funções.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import type React from 'react';
import { ITEM, LINK, enderecoDoLink } from './TextoRico';

/** Texto vira HTML só aqui, e o que vem do banco é sempre escapado antes: o
 *  campo é `contentEditable`, então uma tag escrita na descrição não pode virar
 *  elemento. */
function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** As marcas de um trecho, em HTML. Recursiva: negrito com itálico dentro é o
 *  que sai quando alguém aperta os dois. */
function marcasEmHtml(trecho: string): string {
  const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;
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

/** Endereço solto vira link azul, já no campo. */
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

/** O texto guardado, no HTML que o campo edita. Uma `<div>` por linha, que é o
 *  que o navegador cria sozinho ao apertar Enter - assim o que ele produz e o
 *  que nós produzimos têm a mesma forma. */
export function textoParaHtml(texto: string): string {
  const linhas = texto.split('\n');
  const blocos: string[] = [];
  let lista: string[] = [];

  const fecharLista = () => {
    if (!lista.length) return;
    blocos.push(`<ul>${lista.join('')}</ul>`);
    lista = [];
  };

  for (const linha of linhas) {
    if (ITEM.test(linha)) { lista.push(`<li>${marcasEmHtml(linha.replace(ITEM, ''))}</li>`); continue; }
    fecharLista();
    blocos.push(`<div>${linha.trim() ? marcasEmHtml(linha) : '<br>'}</div>`);
  }
  fecharLista();
  return blocos.join('');
}

/** O HTML do campo de volta em texto com marcas. Só as tags que este editor
 *  produz são reconhecidas; qualquer outra coisa colada vira o texto dela. */
export function htmlParaTexto(raiz: HTMLElement): string {
  const linhas: string[] = [];
  let atual = '';

  const fecharLinha = () => { linhas.push(atual); atual = ''; };

  const inline = (no: Node): string => {
    if (no.nodeType === Node.TEXT_NODE) return no.textContent ?? '';
    if (no.nodeType !== Node.ELEMENT_NODE) return '';
    const el = no as HTMLElement;
    const dentro = Array.from(el.childNodes).map(inline).join('');
    const tag = el.tagName.toLowerCase();
    if (!dentro.trim()) return dentro;
    if (tag === 'b' || tag === 'strong') return `**${dentro}**`;
    if (tag === 'i' || tag === 'em') return `*${dentro}*`;
    if (tag === 'u' || tag === 'ins') return `__${dentro}__`;
    return dentro;
  };

  const andar = (no: Node) => {
    if (no.nodeType === Node.TEXT_NODE) { atual += no.textContent ?? ''; return; }
    if (no.nodeType !== Node.ELEMENT_NODE) return;
    const el = no as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      // O `<br>` que o navegador põe dentro de uma linha vazia não é quebra:
      // ele é o corpo da linha, e quem quebra ali é a `<div>` em volta.
      if (el.parentElement !== raiz && el.parentElement?.childNodes.length === 1) return;
      fecharLinha();
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      if (atual) fecharLinha();
      for (const li of Array.from(el.children)) linhas.push(`- ${inline(li)}`);
      return;
    }
    if (tag === 'li') { linhas.push(`- ${inline(el)}`); return; }
    if (tag === 'div' || tag === 'p') {
      if (atual) fecharLinha();
      const antes = linhas.length;
      for (const filho of Array.from(el.childNodes)) andar(filho);
      // Bloco que não produziu nada é linha em branco, e linha em branco é
      // respiro: some no texto se for a última.
      if (linhas.length === antes && !atual) linhas.push('');
      else if (atual) fecharLinha();
      return;
    }
    atual += inline(el);
  };

  for (const filho of Array.from(raiz.childNodes)) andar(filho);
  if (atual) fecharLinha();
  return linhas.join('\n').replace(/\n+$/, '');
}

/** O campo. Guarda texto, mostra formatação. */
export function EditorRico({
  valor, onMudar, placeholder, autoFocus, onFoco, onBlur, className, ariaLabel,
}: {
  valor: string;
  onMudar: (texto: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** O campo ganhou o cursor. Quem o monta por condição precisa saber disso
   *  para não desmontá-lo debaixo de quem está escrevendo. */
  onFoco?: () => void;
  onBlur?: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  /** O último texto que saiu daqui. Serve para não reescrever o HTML - e jogar
   *  o cursor para o começo - a cada tecla digitada. */
  const meu = useRef<string | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    if (meu.current === valor) return;
    // Vazio é vazio de verdade, e não uma linha com um `<br>` dentro: é o que
    // deixa o texto de apoio aparecer.
    el.innerHTML = valor ? textoParaHtml(valor) : '';
    meu.current = valor;
  }, [valor]);

  // O foco vai para o fim do que já está escrito, e não para o começo: quem
  // abre a descrição quase sempre vai continuar de onde parou.
  //
  // Só quando o campo ainda não tem o cursor: já focado, isto arrastaria para o
  // fim o cursor de quem clicou no meio do texto.
  useEffect(() => {
    const el = caixa.current;
    if (!autoFocus || !el) return;
    if (document.activeElement === el) return;
    el.focus();
    const sel = window.getSelection();
    const faixa = document.createRange();
    faixa.selectNodeContents(el);
    faixa.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(faixa);
  }, [autoFocus]);

  const avisar = () => {
    const el = caixa.current;
    if (!el) return;
    const texto = htmlParaTexto(el);
    // Apagar tudo deixa um `<br>` para trás, e com ele o campo não está vazio
    // para o CSS - o texto de apoio nunca voltaria.
    if (!texto && el.innerHTML !== '') el.innerHTML = '';
    meu.current = texto;
    onMudar(texto);
  };

  /** O endereço que a pessoa acabou de escrever vira link ali mesmo - é o que
   *  todo editor faz quando se dá espaço depois de um endereço. Devolve `true`
   *  quando mexeu em alguma coisa. */
  function linkarPalavraAnterior(): boolean {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return false;
    const faixa = sel.getRangeAt(0);
    const no = faixa.startContainer;
    if (no.nodeType !== Node.TEXT_NODE) return false;
    // Já dentro de um link: escrever no fim de um endereço não pode criar
    // outro link dentro dele.
    if ((no.parentElement as HTMLElement | null)?.closest('a')) return false;

    const antes = (no.textContent ?? '').slice(0, faixa.startOffset);
    const palavra = /(\S+)$/.exec(antes)?.[1];
    if (!palavra) return false;
    if (!new RegExp(`^(?:${LINK.source})$`, 'i').test(palavra)) return false;

    const alvo = document.createRange();
    alvo.setStart(no, faixa.startOffset - palavra.length);
    alvo.setEnd(no, faixa.startOffset);
    const a = document.createElement('a');
    a.href = enderecoDoLink(palavra);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = palavra;
    alvo.deleteContents();
    alvo.insertNode(a);

    // O cursor sai do link antes de o próximo caractere ser escrito: dentro
    // dele, o que se digitasse a seguir entraria no endereço.
    const fora = document.createTextNode('');
    a.after(fora);
    const depois = document.createRange();
    depois.setStart(fora, 0);
    depois.collapse(true);
    sel.removeAllRanges();
    sel.addRange(depois);
    return true;
  }

  /** O que está escrito na linha, do começo dela até o cursor. Vale a linha
   *  inteira, e não o pedaço de texto onde o cursor está: com um trecho em
   *  negrito antes, o cursor cai noutro nó e o começo da linha ficaria de
   *  fora da conta. */
  function antesDoCursor(): { faixa: Range; texto: string } | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
    const faixa = sel.getRangeAt(0);
    const no = faixa.startContainer;
    if (no.nodeType !== Node.TEXT_NODE) return null;
    const bloco = (no.parentElement as HTMLElement | null)?.closest('div,li,p') ?? caixa.current;
    if (!bloco) return null;
    const ate = document.createRange();
    ate.selectNodeContents(bloco);
    ate.setEnd(no, faixa.startOffset);
    // A quebra por `<br>` não aparece no texto da faixa; o que vem depois da
    // última quebra é o que importa.
    const texto = ate.toString().split('\n').pop() ?? '';
    return { faixa, texto };
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    const cmd = e.ctrlKey || e.metaKey;
    if (cmd && !e.altKey) {
      const t = e.key.toLowerCase();
      const comando = t === 'b' ? 'bold' : t === 'i' ? 'italic' : t === 'u' ? 'underline' : null;
      if (!comando) return;
      e.preventDefault();
      document.execCommand(comando);
      avisar();
      return;
    }

    // Endereço terminado vira link. No Enter é só marcar; o espaço é escrito
    // aqui, senão ele nasceria dentro do link recém-criado.
    if (e.key === 'Enter' && linkarPalavraAnterior()) avisar();
    if (e.key === ' ' && linkarPalavraAnterior()) {
      e.preventDefault();
      document.execCommand('insertText', false, ' ');
      avisar();
      return;
    }

    // "- " no começo da linha abre a lista, como em qualquer editor: o hífen
    // desaparece e a linha vira item.
    if (e.key === ' ') {
      const antes = antesDoCursor();
      if (!antes || antes.texto !== '-') return;
      e.preventDefault();
      const no = antes.faixa.startContainer;
      const corte = antes.faixa.startOffset;
      const conteudo = no.textContent ?? '';
      no.textContent = conteudo.slice(0, corte - 1) + conteudo.slice(corte);
      const sel = window.getSelection();
      const nova = document.createRange();
      nova.setStart(no, corte - 1);
      nova.collapse(true);
      sel?.removeAllRanges();
      sel?.addRange(nova);
      document.execCommand('insertUnorderedList');
      avisar();
    }
  }

  /** Cola sempre como texto: o que vem de outro lugar traz HTML inteiro junto,
   *  e o campo guarda marcas, não estilos. */
  function aoColar(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const texto = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, texto);
    avisar();
  }

  /** Clicar num link dentro do campo põe o cursor ali, como em qualquer texto.
   *  Com Ctrl (ou Cmd) abre o endereço - e é o que a dica do link avisa. */
  function aoClicar(e: React.MouseEvent<HTMLDivElement>) {
    const a = (e.target as HTMLElement).closest('a');
    if (!a) return;
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    window.open(a.getAttribute('href') ?? '', '_blank', 'noopener');
  }

  return (
    <div
      ref={caixa}
      className={className ? `editor-rico ${className}` : 'editor-rico'}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      data-vazio={placeholder}
      title="Ctrl+B negrito · Ctrl+I itálico · Ctrl+U sublinhado · Ctrl+clique abre o link"
      onInput={avisar}
      onKeyDown={aoTeclar}
      onPaste={aoColar}
      onClick={aoClicar}
      onFocus={onFoco}
      onBlur={onBlur}
    />
  );
}
