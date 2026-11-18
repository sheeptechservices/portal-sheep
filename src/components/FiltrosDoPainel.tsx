import type { ReactNode } from 'react';
import { FolhaCelular } from './FolhaCelular';
import { useCelular } from '../lib/useCelular';

/**
 * Os filtros finos de uma tela de painel (Tarefas, Funil, Projetos), atrás do
 * botão "Todos os filtros".
 *
 * No computador eles nascem sob a barra do painel e empurram o conteúdo, com o
 * `.revelar` (e por isso ficam montados desde a entrada). No celular a mesma
 * lista vira uma folha que sobe de baixo, como na referência do app de
 * mapeamento: cada filtro numa linha, com o que está marcado à direita, e no pé
 * "Limpar" e "Mostrar N", que fecha a folha com o resultado já filtrado.
 *
 * Os filtros (`FilterDropdown`, `FiltroPeriodo`) são os mesmos nos dois casos:
 * só a moldura muda.
 */
export function FiltrosDoPainel({ aberto, onFechar, temFiltro, onLimpar, total, singular, plural, children }: {
  aberto: boolean;
  onFechar: () => void;
  temFiltro: boolean;
  onLimpar: () => void;
  /** Quantos itens o filtro de agora deixa à vista, para o "Mostrar N". */
  total: number;
  singular: string;
  plural: string;
  children: ReactNode;
}) {
  const celular = useCelular();

  if (celular) {
    return aberto ? (
      <FolhaCelular titulo="Filtros" onFechar={onFechar}
        rodape={fechar => (
          <>
            <button type="button" className="folha-botao-secundario" disabled={!temFiltro} onClick={onLimpar}>
              Limpar
            </button>
            <button type="button" className="btn btn-primary folha-botao-primario" onClick={fechar}>
              Mostrar {total} {total === 1 ? singular : plural}
            </button>
          </>
        )}>
        <div className="folha-filtros">{children}</div>
      </FolhaCelular>
    ) : null;
  }

  return (
    <div className={`revelar${aberto ? ' aberto' : ''}`}>
      <div>
        <div className="painel-filtros">
          {children}
          {temFiltro && (
            <button type="button" className="painel-filtros-limpar surge" onClick={onLimpar}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
