// ─────────────────────────────────────────────────────────────────────────────
//  Cartões de indicador do topo das listagens.
//
//  O desenho é o do Funil, que foi a primeira tela a ter: faixa colorida à
//  esquerda, rótulo miúdo em caixa alta, número grande na cor da faixa e uma
//  linha de contexto embaixo. Ficou aqui, e não copiado em cada página, porque
//  três telas com o mesmo cartão desenhado três vezes divergem na primeira
//  mudança de estilo.
// ─────────────────────────────────────────────────────────────────────────────
import type { CSSProperties } from 'react';
import { Skeleton } from './Skeleton';

export function CartaoKpi({ rotulo, valor, nota, cor, atraso = 0, ativo, onClick }: {
  rotulo: string;
  valor: string | number;
  /** A linha de baixo: diz de que recorte o número saiu. */
  nota: string;
  cor: string;
  /** Escalona a entrada de cada cartão, para a fileira aparecer em cascata. */
  atraso?: number;
  /** Só para cartão que filtra: acende a borda enquanto o filtro está de pé. */
  ativo?: boolean;
  onClick?: () => void;
}) {
  const interativo = !!onClick;
  return (
    <div
      className={`admin-stat-card-v2${ativo ? ' active-filter' : ''}`}
      // Cartão que não filtra não promete clique: o cursor da folha de estilo é
      // de mão para todos, e aqui ele é desfeito.
      style={{
        '--accent-color': cor,
        animationDelay: `${atraso}s`,
        cursor: interativo ? 'pointer' : 'default',
      } as CSSProperties}
      onClick={onClick}
      role={interativo ? 'button' : undefined}
      tabIndex={interativo ? 0 : undefined}
      aria-pressed={interativo ? !!ativo : undefined}
      onKeyDown={interativo
        ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } }
        : undefined}
    >
      <p className="stat-v2-label">{rotulo}</p>
      <p className="stat-v2-value">{valor}</p>
      <p className="stat-v2-desc">{nota}</p>
    </div>
  );
}

/** A fileira enquanto os números não chegaram, no formato que eles vão ocupar. */
export function CartoesKpiEsqueleto({ cartoes = 4 }: { cartoes?: number }) {
  return (
    <div className="admin-stats">
      {Array.from({ length: cartoes }, (_, i) => (
        <div key={i} className="admin-stat-card-v2"
          style={{ '--accent-color': 'var(--gray3)', gap: 8, cursor: 'default',
            animationDelay: `${i * 0.05}s` } as CSSProperties}>
          <Skeleton w="55%" h={11} />
          <Skeleton w={44} h={30} radius="6px" />
          <Skeleton w="70%" h={10} />
        </div>
      ))}
    </div>
  );
}
