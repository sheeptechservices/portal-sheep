import type React from 'react';
import { PAINEL_MIN, PAINEL_MAX } from '../lib/painelLateral';

/**
 * A borda esquerda da gaveta, que se arrasta para alargar o painel.
 *
 * Mora fora do painel de propósito: dentro dele, que rola, o puxador sumiria
 * ao descer o conteúdo. Ancorado pela direita, acompanha a largura.
 *
 * Recebe o que `useLarguraPainel` devolve, e nada mais:
 *
 *   const painel = useLarguraPainel('lead');
 *   <PuxadorDoPainel {...painel} />
 *   <div className="admin-modal" style={{ width: `min(${painel.largura}px, 96vw)` }}>
 */
export function PuxadorDoPainel({ largura, arrastando, setArrastando, porTecla }: {
  largura: number;
  arrastando: boolean;
  setArrastando: (v: boolean) => void;
  porTecla: (e: React.KeyboardEvent) => void;
}) {
  return (
    <button
      type="button"
      className={`painel-puxador${arrastando ? ' arrastando' : ''}`}
      style={{ right: `min(${largura}px, 96vw)` }}
      onClick={e => e.stopPropagation()}
      // Sem `stopPropagation` no mousedown de propósito: é preciso que o fundo
      // veja o evento para registrar que o gesto NÃO começou nele. Barrando
      // aqui, ele ficava com a marca da interação anterior e o painel fechava
      // ao soltar o arrasto fora.
      onMouseDown={e => { e.preventDefault(); setArrastando(true); }}
      onKeyDown={porTecla}
      role="separator"
      aria-orientation="vertical"
      aria-label="Ajustar a largura do painel"
      aria-valuenow={largura}
      aria-valuemin={PAINEL_MIN}
      aria-valuemax={PAINEL_MAX}
      title="Arraste para ajustar a largura"
    />
  );
}
