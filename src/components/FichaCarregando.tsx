// ─────────────────────────────────────────────────────────────────────────────
//  A moldura da ficha enquanto os dados dela chegam.
//
//  A tarefa e o projeto abrem por cima de qualquer tela (ver a camada de fichas
//  no AdminApp), mas os dados vêm do servidor, e a ficha só monta com eles. Esta
//  é a mesma moldura do diálogo, com o giro da casa no corpo: ela entra no
//  gesto, e a ficha de verdade toma o lugar dela sem tocar a entrada de novo.
//  Fechar aqui (fundo, x, Escape) desiste da abertura.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { useFecharNoFundo } from '../lib/useFecharNoFundo';
import { IconX } from './icons';

export function FichaCarregando({ tipo, onFechar }: { tipo: 'tarefa' | 'projeto'; onFechar: () => void }) {
  const { saindo, fechar } = useSaidaSuave(onFechar);
  const fundo = useFecharNoFundo(fechar);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [fechar]);

  return createPortal(
    <div className={`admin-modal-overlay tarefa-central-fundo ficha-carregando${saindo ? ' saindo' : ''}`}
      style={{ zIndex: 10000 }} {...fundo}>
      <div className={`admin-modal painel-gaveta tarefa-central${tipo === 'projeto' ? ' projeto-central' : ''}`}
        role="dialog" aria-modal="true" aria-busy="true"
        aria-label={tipo === 'tarefa' ? 'Abrindo a tarefa' : 'Abrindo o projeto'}
        onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="painel-rotulo">{tipo === 'tarefa' ? 'TAREFA' : 'PROJETO'}</p>
          </div>
          <button type="button" className="admin-modal-close" onClick={fechar} aria-label="Fechar">
            <IconX size={16} />
          </button>
        </div>
        <div className="admin-modal-body">
          <div className="dux-spinner-row"><span className="dux-spinner sm" /></div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
