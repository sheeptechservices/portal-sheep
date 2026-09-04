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
import { IconComentario, IconLink, IconX } from './icons';
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
/** O chip de vínculo: um só desenho para tudo que uma coisa aponta.
 *
 *  A reunião dentro da entrega, a entrega dentro da reunião e a reunião dentro
 *  da tarefa são o mesmo gesto - "isto aqui tem a ver com aquilo" -, e por isso
 *  são a mesma peça: marca do que é, nome em negrito e uma nota curta que
 *  situa (a data da conversa, a etapa da entrega). O X de desvincular aparece
 *  só onde desvincular é possível.
 *
 *  O ícone vem de fora porque quem chama é quem sabe o que a peça é: a etapa da
 *  entrega tem ícone e cor próprios, e trazê-los para cá amarraria este arquivo
 *  à tela de Projetos. */
export function Chip({ icone, nome, nota, cor, titulo, onAbrir, onSoltar }: {
  icone: React.ReactNode;
  nome: string;
  /** A linha curta ao lado do nome. Sem ela o chip é só o nome. */
  nota?: string | null;
  /** Cor da marca, quando ela quer dizer alguma coisa (a etapa da entrega). */
  cor?: string;
  titulo: string;
  /** Ausente onde não há para onde levar - o chip vira só a informação. */
  onAbrir?: () => void;
  onSoltar?: () => void;
}) {
  return (
    <span className={`vinculo-chip${onAbrir ? '' : ' parado'}`}
      style={cor ? ({ ['--chip-cor' as string]: cor }) : undefined}>
      <button type="button" className="vinculo-chip-alvo" title={titulo}
        onClick={onAbrir} disabled={!onAbrir}>
        <span className="vinculo-chip-ico">{icone}</span>
        <strong>{nome}</strong>
        {nota && <span>{nota}</span>}
      </button>
      {onSoltar && (
        <button type="button" className="vinculo-soltar" onClick={onSoltar}
          aria-label={`Desvincular ${nome}`} title="Desvincular">
          <IconX size={10} />
        </button>
      )}
    </span>
  );
}

/** A reunião como chip: a marca de onde ela veio, o assunto e a data - o mesmo
 *  trio da linha de reunião no painel de projeto, encolhido para caber numa
 *  faixa de chips. */
export function ChipReuniao({ assunto, data, fireflies, titulo, onAbrir, onSoltar }: {
  assunto: string;
  /** Já formatada por quem chama: a data crua não é para ser lida. */
  data?: string | null;
  /** Veio do Fireflies: a marca diz de onde, como na aba de reuniões. */
  fireflies?: boolean;
  titulo: string;
  onAbrir?: () => void;
  onSoltar?: () => void;
}) {
  return (
    <Chip
      icone={fireflies
        ? <img src="/marcas/fireflies.webp" alt="" width={12} height={12} />
        : <IconComentario size={12} />}
      nome={assunto}
      nota={data}
      titulo={titulo}
      onAbrir={onAbrir}
      onSoltar={onSoltar}
    />
  );
}
