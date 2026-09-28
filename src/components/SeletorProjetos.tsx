// ─────────────────────────────────────────────────────────────────────────────
//  Escolha de projetos.
//
//  Nasceu quando a tarefa passou a valer para mais de um projeto: a mesma
//  demanda que serve dois clientes, ou o trabalho da casa que também é de um
//  projeto.
//
//  A ordem da escolha é conteúdo, e não enfeite: o primeiro da lista é o
//  principal - é dele a entrega e a ordem no quadro -, e por isso ele leva a
//  marca na lista e na pílula. Tirá-lo promove o seguinte.
//
//  É o mesmo desenho do seletor de pessoas: um gatilho do tamanho do campo, a
//  lista num portal, busca a partir de meia dúzia de opções e um item que não
//  fecha a lista ao ser marcado, porque quem escolhe vários quase sempre marca
//  mais de um.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCheck } from './icons';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';
import { contemTermo } from '../lib/texto';

export interface ProjetoParaEscolher {
  id: string;
  nome: string;
  /** De quem é o projeto. Dois projetos chamados "SDR IA" só se distinguem por
   *  ele, e a busca do seletor também o alcança. */
  cliente?: string | null;
}

/** A partir de quantos projetos a busca aparece. */
const BUSCA_A_PARTIR_DE = 6;

export function SeletorProjetos({ projetos, valor, onChange, vazio = 'Escolher projeto' }: {
  projetos: ProjetoParaEscolher[];
  /** Os escolhidos, na ordem: o primeiro é o principal. */
  valor: string[];
  onChange: (v: string[]) => void;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const gatilho = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  useDropdownDismiss(aberto, [gatilho, lista], () => setAberto(false));

  const filtrados = projetos.filter(p => contemTermo(`${p.nome} ${p.cliente ?? ''}`, busca));
  const escolhidos = valor
    .map(id => projetos.find(p => p.id === id))
    .filter((p): p is ProjetoParaEscolher => !!p);

  function abrir() {
    setPos(ancorar(gatilho.current!, Math.min(filtrados.length + 1, 7), 240));
    setBusca('');
    // Alterna: clicar de novo no gatilho fecha, como em todo dropdown da casa.
    setAberto(a => !a);
  }

  return (
    <>
      <button ref={gatilho} type="button" onClick={abrir} className="liquidez-trigger"
        aria-expanded={aberto}
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0,
          minHeight: 'var(--campo-altura)',
          padding: '5px 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          background: 'var(--white)',
        }}>
        {escolhidos.length === 0 ? (
          <span style={{ color: 'var(--gray2)' }}>{vazio}</span>
        ) : (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
            {/* A marca do principal só existe quando há mais de um: com um
                projeto só, distinguir o principal seria nomear uma diferença
                que ainda não existe. */}
            {escolhidos.map((p, i) => (
              <span key={p.id}
                className={`chip-projeto${i === 0 && escolhidos.length > 1 ? ' principal' : ''}`}
                title={i === 0 && escolhidos.length > 1
                  ? 'Projeto principal: é dele a entrega e a ordem no quadro'
                  : undefined}>
                {p.nome}
              </span>
            ))}
          </span>
        )}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
          style={{ flexShrink: 0, color: 'var(--gray2)' }}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={lista} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10050 }}>
          {projetos.length > BUSCA_A_PARTIR_DE && (
            <input autoFocus className="form-input" value={busca}
              onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto"
              style={{ height: 32, fontSize: 12.5, marginBottom: 4 }} />
          )}
          {filtrados.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, padding: '6px 8px' }}>
              Nenhum projeto com esse nome.
            </p>
          ) : filtrados.map(p => {
            const ativo = valor.includes(p.id);
            const principal = valor[0] === p.id && valor.length > 1;
            return (
              <div key={p.id} className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => onChange(ativo ? valor.filter(x => x !== p.id) : [...valor, p.id])}>
                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ display: 'block', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                  {/* Com dois ou mais escolhidos, o primeiro se anuncia: é ele
                      que responde de onde vem a entrega. Com um só, dizê-lo
                      seria nomear uma distinção que não existe ainda. */}
                  {(principal || p.cliente) && (
                    <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {principal ? `Principal · ${p.cliente ?? ''}`.trim().replace(/ ·$/, '') : p.cliente}
                    </span>
                  )}
                </span>
                {ativo && (
                  <span style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--yellow)' }}>
                    <IconCheck size={12} />
                  </span>
                )}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
