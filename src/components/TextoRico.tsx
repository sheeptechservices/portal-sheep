// ─────────────────────────────────────────────────────────────────────────────
//  Texto com marcação leve.
//
//  A descrição da tarefa continua sendo texto puro no banco, e é de propósito:
//  ela sai em exportação, em relatório, em prompt de IA e na página do cliente,
//  e HTML gravado ali obrigaria cada um desses lugares a saber desmontá-lo (e a
//  se defender do que viesse dentro). O que existe aqui é uma convenção de
//  escrita:
//
//    **negrito**      __sublinhado__      *itálico*      - item de lista
//
//  Ninguém precisa digitar isso: quem escreve usa Ctrl+B, Ctrl+I, Ctrl+U e o
//  hífen, e vê o texto já formatado - o editor em `EditorRico` cuida disso e
//  guarda estas marcas. Este arquivo é o outro lado: o texto guardado virando
//  o que se lê.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react';

/** As marcas que o campo entende, na ordem em que precisam ser testadas: as de
 *  dois caracteres antes das de um, senão `*` comeria a metade de `**`. */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

/** Endereço solto no meio do texto. Aceita `http(s)://`, `www.` e o domínio
 *  cru com barra ou caminho - é assim que a maioria cola um link. A pontuação
 *  final fica de fora: "veja em site.com/a." termina a frase, não o endereço. */
export const LINK = /((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:!?]|(?:[a-z0-9-]+\.)+(?:com\.br|gov\.br|edu\.br|org\.br|com|net|org|dev|app|io|co|me)(?:\/[^\s<>()]*[^\s<>().,;:!?])?)/gi;

/** O endereço com protocolo, para o `href`. O que está escrito continua como a
 *  pessoa escreveu. */
export function enderecoDoLink(texto: string): string {
  return /^https?:\/\//i.test(texto) ? texto : `https://${texto}`;
}

/** Uma linha vira uma sequência de pedaços de texto, trechos marcados e links.
 *  Recursiva de propósito: negrito com um trecho em itálico dentro é o que sai
 *  do editor quando alguém aperta os dois, e precisa voltar igual. */
function pedacos(linha: string, chave: string): React.ReactNode[] {
  const saida: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of linha.matchAll(INLINE)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(...comLinks(linha.slice(ultimo, inicio), `${chave}-t${i}`));
    const t = m[0];
    const k = `${chave}-${i++}`;
    if (t.startsWith('**')) saida.push(<strong key={k}>{pedacos(t.slice(2, -2), k)}</strong>);
    else if (t.startsWith('__')) saida.push(<u key={k}>{pedacos(t.slice(2, -2), k)}</u>);
    else saida.push(<em key={k}>{pedacos(t.slice(1, -1), k)}</em>);
    ultimo = inicio + t.length;
  }
  if (ultimo < linha.length) saida.push(...comLinks(linha.slice(ultimo), `${chave}-f`));
  return saida;
}

/** O trecho sem marca, com os endereços virando link de verdade. */
function comLinks(trecho: string, chave: string): React.ReactNode[] {
  const saida: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of trecho.matchAll(LINK)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(trecho.slice(ultimo, inicio));
    saida.push(
      <a key={`${chave}-a${i++}`} className="texto-rico-link" href={enderecoDoLink(m[0])}
        target="_blank" rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}>
        {m[0]}
      </a>,
    );
    ultimo = inicio + m[0].length;
  }
  if (ultimo < trecho.length) saida.push(trecho.slice(ultimo));
  return saida;
}

/** Começo de item de lista: hífen e um espaço. Só o hífen, e não o asterisco
 *  também: o asterisco já é a marca de itálico, e duas maneiras de escrever a
 *  mesma coisa é uma a mais do que alguém precisa lembrar. */
export const ITEM = /^\s*-\s+/;

/** O texto desenhado. Nada de HTML vindo do banco: cada pedaço vira elemento
 *  aqui, então o que estiver escrito na descrição é sempre texto. */
export function TextoRico({ texto, className }: { texto: string; className?: string }) {
  const linhas = texto.split('\n');
  const blocos: React.ReactNode[] = [];
  let lista: React.ReactNode[] = [];

  const fecharLista = () => {
    if (lista.length === 0) return;
    blocos.push(<ul key={`ul-${blocos.length}`} className="texto-rico-lista">{lista}</ul>);
    lista = [];
  };

  linhas.forEach((linha, i) => {
    if (ITEM.test(linha)) {
      lista.push(<li key={`li-${i}`}>{pedacos(linha.replace(ITEM, ''), `l${i}`)}</li>);
      return;
    }
    fecharLista();
    // Linha em branco vira respiro, e não parágrafo vazio: dois enters seguidos
    // separam blocos, como em qualquer editor.
    if (!linha.trim()) { blocos.push(<span key={`br-${i}`} className="texto-rico-vao" />); return; }
    blocos.push(<p key={`p-${i}`}>{pedacos(linha, `p${i}`)}</p>);
  });
  fecharLista();

  return <div className={className ? `texto-rico ${className}` : 'texto-rico'}>{blocos}</div>;
}
