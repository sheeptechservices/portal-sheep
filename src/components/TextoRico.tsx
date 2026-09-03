// ─────────────────────────────────────────────────────────────────────────────
//  Texto com marcação leve.
//
//  A descrição da tarefa continua sendo texto puro no banco, e é de propósito:
//  ela sai em exportação, em relatório, em prompt de IA e na página do cliente,
//  e HTML gravado ali obrigaria cada um desses lugares a saber desmontá-lo (e a
//  se defender do que viesse dentro). O que existe aqui é uma convenção de
//  escrita - a mesma que todo mundo já digita sem pensar:
//
//    **negrito**      __sublinhado__      *itálico*      - item de lista
//
//  Quem escreve não precisa saber disso: os atalhos do teclado põem as marcas,
//  e o texto aparece formatado quando o campo não está sendo editado.
// ─────────────────────────────────────────────────────────────────────────────

import type React from 'react';

/** As marcas que o campo entende, na ordem em que precisam ser testadas: as de
 *  dois caracteres antes das de um, senão `*` comeria a metade de `**`. */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*)/g;

/** Uma linha vira uma sequência de pedaços de texto e de trechos marcados. */
function pedacos(linha: string, chave: string): React.ReactNode[] {
  const saida: React.ReactNode[] = [];
  let ultimo = 0;
  let i = 0;
  for (const m of linha.matchAll(INLINE)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) saida.push(linha.slice(ultimo, inicio));
    const t = m[0];
    const k = `${chave}-${i++}`;
    if (t.startsWith('**')) saida.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('__')) saida.push(<u key={k}>{t.slice(2, -2)}</u>);
    else saida.push(<em key={k}>{t.slice(1, -1)}</em>);
    ultimo = inicio + t.length;
  }
  if (ultimo < linha.length) saida.push(linha.slice(ultimo));
  return saida;
}

/** Começo de item de lista: hífen ou asterisco seguido de espaço. O asterisco
 *  entra porque é o que a mão digita primeiro, mesmo não sendo o que os atalhos
 *  escrevem. */
const ITEM = /^\s*[-*]\s+/;

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

// ── Os atalhos ───────────────────────────────────────────────────────────────

/** Envolve o trecho selecionado na marca, ou tira a marca se ela já estiver
 *  ali - é o que Ctrl+B faz em qualquer editor: liga e desliga.
 *
 *  Sem seleção, deixa as marcas com o cursor no meio, pronto para escrever. */
function marcar(texto: string, ini: number, fim: number, marca: string) {
  const dentro = texto.slice(ini, fim);
  const antes = texto.slice(0, ini);
  const depois = texto.slice(fim);

  // Já marcado por dentro ("**isto**" selecionado sem as marcas) ou por fora?
  if (dentro.startsWith(marca) && dentro.endsWith(marca) && dentro.length > marca.length * 2) {
    const limpo = dentro.slice(marca.length, -marca.length);
    return { texto: antes + limpo + depois, ini, fim: ini + limpo.length };
  }
  if (antes.endsWith(marca) && depois.startsWith(marca)) {
    const novo = antes.slice(0, -marca.length) + dentro + depois.slice(marca.length);
    return { texto: novo, ini: ini - marca.length, fim: fim - marca.length };
  }
  const novo = `${antes}${marca}${dentro}${marca}${depois}`;
  return {
    texto: novo,
    ini: ini + marca.length,
    fim: fim + marca.length,
  };
}

/** Liga ou desliga o item de lista nas linhas tocadas pela seleção. */
function alternarLista(texto: string, ini: number, fim: number) {
  const comecoLinha = texto.lastIndexOf('\n', ini - 1) + 1;
  const fimLinha = texto.indexOf('\n', fim) === -1 ? texto.length : texto.indexOf('\n', fim);
  const trecho = texto.slice(comecoLinha, fimLinha);
  const linhas = trecho.split('\n');
  const todasSao = linhas.every(l => ITEM.test(l) || !l.trim());
  const novas = linhas.map(l => (todasSao ? l.replace(ITEM, '') : (l.trim() ? `- ${l}` : l)));
  const novo = texto.slice(0, comecoLinha) + novas.join('\n') + texto.slice(fimLinha);
  const desloca = novas.join('\n').length - trecho.length;
  return { texto: novo, ini: comecoLinha, fim: fim + desloca };
}

/**
 * O que fazer com a tecla, se ela for um atalho de formatação.
 *
 * Devolve o texto novo e onde deixar o cursor, ou `null` quando a tecla não é
 * dele - aí quem chamou deixa o campo seguir seu caminho.
 *
 * Os atalhos são os que a mão já conhece de qualquer editor: Ctrl+B, Ctrl+I,
 * Ctrl+U e Ctrl+Shift+8 para lista. E o Enter dentro de uma lista continua a
 * lista - Enter numa linha de lista vazia sai dela, que é o que se espera.
 */
export function atalhoDeTexto(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
): { texto: string; ini: number; fim: number } | null {
  const el = e.currentTarget;
  const { value, selectionStart: ini, selectionEnd: fim } = el;
  const cmd = e.ctrlKey || e.metaKey;

  if (cmd && !e.altKey) {
    const tecla = e.key.toLowerCase();
    if (tecla === 'b') return marcar(value, ini, fim, '**');
    if (tecla === 'i') return marcar(value, ini, fim, '*');
    if (tecla === 'u') return marcar(value, ini, fim, '__');
    // Ctrl+Shift+8 é o atalho de lista do Word e do Docs; o `*` cobre o teclado
    // que manda o caractere em vez do dígito.
    if (e.shiftKey && (tecla === '8' || tecla === '*')) return alternarLista(value, ini, fim);
    return null;
  }

  if (e.key === 'Enter' && !e.shiftKey && ini === fim) {
    const comecoLinha = value.lastIndexOf('\n', ini - 1) + 1;
    const linha = value.slice(comecoLinha, ini);
    const marca = ITEM.exec(linha)?.[0];
    if (!marca) return null;
    // Linha de lista vazia: o Enter fecha a lista em vez de criar outro item.
    if (linha.trim() === marca.trim()) {
      const novo = value.slice(0, comecoLinha) + value.slice(ini);
      return { texto: novo, ini: comecoLinha, fim: comecoLinha };
    }
    const novo = `${value.slice(0, ini)}\n- ${value.slice(fim)}`;
    return { texto: novo, ini: ini + 3, fim: ini + 3 };
  }

  return null;
}
