import type React from 'react';

// Gera a imagem de arrasto 1:1 do próprio card. O Chrome, quando o elemento
// arrastado tem `transform` (o nosso `.kanban-card:active` escala e gira), e
// principalmente sob zoom do navegador, renderiza a prévia nativa ampliada e
// borrada. Fixar a imagem no tamanho real do elemento resolve; neutralizamos o
// transform só no instante do snapshot e o restauramos no próximo frame.
export function definirImagemArrasto(e: React.DragEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const anterior = el.style.transform;
  el.style.transform = 'none';
  try {
    e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top);
  } catch { /* setDragImage não suportado - segue com a prévia padrão */ }
  requestAnimationFrame(() => { el.style.transform = anterior; });
}
