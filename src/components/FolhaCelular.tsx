import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';

/** Quanto arrastar (px) ou quão rápido (px/ms) para a folha fechar ao soltar. */
const DISTANCIA_FECHA = 110;
const VELOCIDADE_FECHA = 0.55;

/** O toque começou numa área já rolada para baixo? Então o gesto é de rolar o
 *  conteúdo, e não de puxar a folha. */
function rolouParaBaixo(alvo: Element | null, raiz: HTMLElement) {
  for (let el = alvo as HTMLElement | null; el && el !== raiz; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el.scrollTop > 0;
  }
  return false;
}

/**
 * Folha que sobe de baixo, no celular: o cartão das escolhas de uma tela
 * (filtros, por exemplo), como as folhas do próprio sistema do aparelho.
 * Puxador em cima, título centralizado com o fechar, corpo que rola e rodapé
 * parado com as ações.
 *
 * Fecha pelo fundo, pelo X, pelo Escape e arrastando para baixo: se o corpo
 * está no topo, puxar para baixo arrasta a folha; soltou longe ou rápido,
 * fecha, senão volta. Todo caminho passa pelo `fechar` do `useSaidaSuave`, para
 * a saída descer em vez de sumir.
 *
 * Monte só enquanto aberta: `{aberto && <FolhaCelular ... />}`. A entrada vem
 * da classe e a saída do gancho, então a condição pode ser a crua.
 */
export function FolhaCelular({ titulo, onFechar, children, rodape }: {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  rodape?: (fechar: () => void) => ReactNode;
}) {
  const { saindo, fechar } = useSaidaSuave(onFechar, 220);
  const fundo = useFecharNoFundo(fechar);
  const folha = useRef<HTMLDivElement>(null);

  // Escape fecha a folha, mas não quando há uma lista aberta por cima dela:
  // aí o Escape é da lista.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.lista-folha')) fechar();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [fechar]);

  // Arrastar para baixo fecha.
  useEffect(() => {
    const el = folha.current;
    if (!el) return;
    let toque: { x: number; y: number; ultimoY: number; ultimoT: number; vel: number } | null = null;
    let arrastando = false;
    const mover = (dy: number) => { el.style.transform = dy ? `translateY(${dy}px)` : ''; };

    const comeco = (e: TouchEvent) => {
      if (e.touches.length !== 1 || rolouParaBaixo(e.target as Element, el)) { toque = null; return; }
      const t = e.touches[0];
      toque = { x: t.clientX, y: t.clientY, ultimoY: t.clientY, ultimoT: performance.now(), vel: 0 };
      arrastando = false;
    };
    const movimento = (e: TouchEvent) => {
      if (!toque) return;
      const t = e.touches[0];
      const dy = t.clientY - toque.y;
      const dx = t.clientX - toque.x;
      if (!arrastando) {
        // Decide pelo primeiro movimento claro: para baixo puxa a folha; para
        // cima ou para o lado é rolagem, e a folha não se mete.
        if (dy > 8 && dy > Math.abs(dx)) {
          arrastando = true;
          el.style.transition = 'none';
        } else if (dy < -4 || Math.abs(dx) > 8) { toque = null; return; } else return;
      }
      if (e.cancelable) e.preventDefault();
      const agora = performance.now();
      toque.vel = (t.clientY - toque.ultimoY) / Math.max(agora - toque.ultimoT, 1);
      toque.ultimoY = t.clientY;
      toque.ultimoT = agora;
      mover(Math.max(0, dy - 8));
    };
    const fim = () => {
      if (!toque || !arrastando) { toque = null; return; }
      const distancia = toque.ultimoY - toque.y - 8;
      const rapido = toque.vel > VELOCIDADE_FECHA && distancia > 30;
      toque = null;
      arrastando = false;
      el.style.transition = '';
      if (distancia > DISTANCIA_FECHA || rapido) {
        // A saída continua de onde o dedo parou, descendo o resto.
        el.style.setProperty('--folha-de', `${Math.max(0, distancia)}px`);
        mover(0);
        fechar();
      } else mover(0);
    };

    el.addEventListener('touchstart', comeco, { passive: true });
    el.addEventListener('touchmove', movimento, { passive: false });
    el.addEventListener('touchend', fim);
    el.addEventListener('touchcancel', fim);
    return () => {
      el.removeEventListener('touchstart', comeco);
      el.removeEventListener('touchmove', movimento);
      el.removeEventListener('touchend', fim);
      el.removeEventListener('touchcancel', fim);
    };
  }, [fechar]);

  return createPortal(
    <div className={`folha-fundo${saindo ? ' saindo' : ''}`} {...fundo}>
      <div ref={folha} className="folha-celular" role="dialog" aria-modal="true" aria-label={titulo}
        onClick={e => e.stopPropagation()}>
        <div className="folha-puxador" aria-hidden="true" />
        <header className="folha-cabeca">
          <span aria-hidden="true" />
          <h2 className="folha-titulo">{titulo}</h2>
          <button type="button" className="folha-fechar" aria-label="Fechar" onClick={fechar}>
            <IconX size={16} />
          </button>
        </header>
        <div className="folha-corpo">{children}</div>
        {rodape && <footer className="folha-rodape">{rodape(fechar)}</footer>}
      </div>
    </div>,
    document.body,
  );
}
