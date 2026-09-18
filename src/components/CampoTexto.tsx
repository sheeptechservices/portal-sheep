// ─────────────────────────────────────────────────────────────────────────────
//  O campo de texto longo da casa.
//
//  É o mesmo campo da descrição da tarefa, em forma de peça: mostra a
//  formatação enquanto se escreve e guarda o texto com as marcas leves de
//  `lib/marcacao`. Os atalhos são os de qualquer editor:
//
//    Ctrl+B negrito   Ctrl+I itálico   Ctrl+U sublinhado   "- " abre uma lista
//
//  Enter quebra a linha, e a quebra vale: quem mostra o texto (a leitura da
//  tarefa, o slide da proposta) a respeita, em vez de juntar tudo num bloco.
//
//  A altura acompanha o que está escrito, entre um piso e um teto. Sem piso, o
//  campo vazio vira uma linha fina que não parece convidar a escrever; sem
//  teto, um texto longo empurra o formulário inteiro para fora da tela. Passado
//  o teto, o campo rola por dentro.
//
//  Textarea nova que guarde texto para ser lido depois nasce daqui. `<textarea>`
//  crua só onde o texto é dado bruto e não será mostrado formatado.
// ─────────────────────────────────────────────────────────────────────────────
import type React from 'react';
import { EditorRico } from './EditorRico';

/** Altura de uma linha do campo, em px: `13px` de fonte com `1.5` de entrelinha,
 *  que é a métrica do `.editor-rico`. */
const LINHA = 19.5;
/** O respiro de cima e de baixo do `.form-input`, somado. */
const MOLDURA = 20;

export function CampoTexto({
  valor, onMudar, placeholder, linhas = 3, alturaMaxima = 320, ariaLabel, className,
}: {
  valor: string;
  onMudar: (texto: string) => void;
  placeholder?: string;
  /** Quantas linhas o campo mostra vazio. É o piso: ele nunca fica menor. */
  linhas?: number;
  /** Até onde ele cresce, em px. Depois disso rola por dentro. */
  alturaMaxima?: number;
  ariaLabel?: string;
  className?: string;
}) {
  const estilo = {
    ['--campo-texto-min' as string]: `${Math.round(linhas * LINHA + MOLDURA)}px`,
    ['--campo-texto-max' as string]: `${alturaMaxima}px`,
  } as React.CSSProperties;

  return (
    <div className="campo-texto" style={estilo}>
      <EditorRico
        className={className ? `form-input ${className}` : 'form-input'}
        valor={valor}
        onMudar={onMudar}
        placeholder={placeholder}
        ariaLabel={ariaLabel} />
    </div>
  );
}
