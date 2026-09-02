// ─────────────────────────────────────────────────────────────────────────────
//  O vínculo entre a reunião e o que ela tratou.
//
//  Vive aqui, e não numa das telas, porque os três lados usam as mesmas duas
//  peças: o chip da reunião liga entregas, o detalhe da entrega liga reuniões e
//  o formulário de tarefa liga reuniões. A diferença entre eles é o que está na
//  lista, não como se escolhe.
// ─────────────────────────────────────────────────────────────────────────────
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconLink, IconX } from './icons';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';

/** Escolhe entre uma lista, marcando e desmarcando, e fecha ao clicar fora.
 *
 *  A lista é desenhada num portal, presa à tela: os três lugares onde este
 *  seletor vive ficam dentro de um bloco com `overflow: hidden` - é o que faz o
 *  `.revelar` abrir e recolher -, e ali um menu posicionado por dentro sai
 *  recortado, sem nada na tela para dizer que ele abriu. */
export function SeletorVinculo({ rotulo, acao, opcoes, escolhidos, vazio, onAlternar }: {
  rotulo: string;
  /** O que o botão diz. Sem texto, o gatilho vira um ícone que ninguém acha. */
  acao: string;
  opcoes: { id: number; nome: string; nota?: string | null }[];
  escolhidos: number[];
  /** O que dizer quando não há o que escolher. */
  vazio: string;
  onAlternar: (id: number, ligar: boolean) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  // Antes da pintura: medido depois, o menu aparece uma vez no canto da tela.
  useLayoutEffect(() => {
    if (!aberto) return;
    const r = gatilho.current?.getBoundingClientRect();
    if (!r) return;
    const largura = 280;
    setPos({
      top: r.bottom + 5,
      // Encostado à direita do gatilho, sem sair pela borda da janela.
      left: Math.max(8, Math.min(r.right - largura, window.innerWidth - largura - 8)),
    });
  }, [aberto]);

  return (
    <>
      <button type="button" ref={gatilho} className="vinculo-gatilho"
        aria-expanded={aberto} onClick={() => setAberto(a => !a)}>
        <IconLink size={12} />
        {acao}
      </button>
      {aberto && createPortal(
        <div ref={lista} className="vinculo-lista surge"
          style={{ top: pos.top, left: pos.left }}>
          <p className="vinculo-rotulo">{rotulo}</p>
          {opcoes.length === 0 ? (
            <p className="vinculo-vazio">{vazio}</p>
          ) : opcoes.map(o => {
            const marcado = escolhidos.includes(o.id);
            return (
              <label key={o.id} className="vinculo-opcao">
                <input type="checkbox" className="form-checkbox" checked={marcado}
                  onChange={() => onAlternar(o.id, !marcado)} />
                <span>
                  {o.nome}
                  {o.nota && <span className="vinculo-nota">{o.nota}</span>}
                </span>
              </label>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

/** O vínculo já feito, como chip. Clicar leva ao outro lado - da entrega para a
 *  aba de reuniões, e de lá para a entrega. */
export function ChipVinculo({ nome, titulo, onAbrir, onSoltar }: {
  nome: string;
  titulo: string;
  /** Ausente onde não há para onde levar - o chip vira só a informação. */
  onAbrir?: () => void;
  onSoltar?: () => void;
}) {
  return (
    <span className={`vinculo-chip${onAbrir ? '' : ' parado'}`}>
      <button type="button" onClick={onAbrir} disabled={!onAbrir} title={titulo}>{nome}</button>
      {onSoltar && (
        <button type="button" className="vinculo-soltar" onClick={onSoltar}
          aria-label={`Desvincular ${nome}`} title="Desvincular">
          <IconX size={10} />
        </button>
      )}
    </span>
  );
}
