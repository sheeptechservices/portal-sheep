// ─────────────────────────────────────────────────────────────────────────────
//  Escolha de pessoas.
//
//  Morava na tela de Projetos, e saiu de lá quando o painel do lead passou a
//  registrar reunião: a mesma escolha de participantes, no mesmo desenho.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Avatar, type Pessoa } from '../admin/FormularioTarefa';
import { useDropdownDismiss } from '../lib/useDropdownDismiss';
import { ancorar } from '../lib/ancorar';

/** Seleção múltipla de pessoas num campo só. Com a lista de usuários crescendo,
 *  espalhar um botão por pessoa na tela ocupava mais espaço a cada cadastro
 *  novo; aqui o campo tem altura fixa e a lista mora no dropdown. */
export function SeletorPessoas({ pessoas, valor, onChange, vazio = 'Escolher pessoas' }: {
  pessoas: Pessoa[];
  valor: string[];
  onChange: (v: string[]) => void;
  vazio?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  const filtradas = pessoas.filter(p => {
    const q = busca.trim().toLocaleLowerCase('pt-BR');
    if (!q) return true;
    return p.nome.toLocaleLowerCase('pt-BR').includes(q)
      || p.email.toLocaleLowerCase('pt-BR').includes(q);
  });

  function abrir() {
    setPos(ancorar(triggerRef.current!, Math.min(filtradas.length + 1, 7), 240));
    setBusca('');
    setAberto(a => !a);
  }
  useDropdownDismiss(aberto, [triggerRef, dropRef], () => setAberto(false));

  const escolhidas = valor
    .map(id => pessoas.find(p => p.id === id))
    .filter((p): p is Pessoa => !!p);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={abrir} className="liquidez-trigger"
        style={{
          width: '100%', justifyContent: 'space-between', margin: 0, minHeight: 42,
          padding: '5px 14px', borderRadius: 'var(--radius-md)',
          fontFamily: "'Manrope', sans-serif", fontSize: 14, fontWeight: 500,
          background: 'var(--white)',
          borderColor: aberto ? 'var(--yellow)' : undefined,
          boxShadow: aberto ? '0 0 0 3px var(--yd)' : undefined,
        }}>
        {escolhidas.length === 0 ? (
          <span style={{ color: 'var(--gray2)' }}>{vazio}</span>
        ) : (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5, minWidth: 0 }}>
            {escolhidas.map(p => (
              <span key={p.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px 2px 2px', borderRadius: 'var(--radius-pill)',
                background: 'var(--gray4)', fontSize: 11.5, fontWeight: 600,
              }}>
                <Avatar nome={p.nome} foto={p.foto_url} size={18} />
                {p.nome}
              </span>
            ))}
          </span>
        )}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--transition)' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto && createPortal(
        <div ref={dropRef} className="status-select-dropdown"
          style={{ top: pos.top, left: pos.left, width: pos.width, zIndex: 10000 }}>
          {pessoas.length > 6 && (
            <input autoFocus className="form-input" value={busca}
              onChange={e => setBusca(e.target.value)} placeholder="Buscar pessoa"
              style={{ height: 32, fontSize: 12.5, marginBottom: 4 }} />
          )}
          {filtradas.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--gray2)', margin: 0, padding: '6px 8px' }}>
              Ninguém com esse nome.
            </p>
          ) : filtradas.map(p => {
            const ativo = valor.includes(p.id);
            return (
              // O dropdown não fecha ao escolher: seleção múltipla quase sempre
              // marca mais de um, e reabrir a cada clique seria um castigo.
              <div key={p.id} className={`status-select-option${ativo ? ' active' : ''}`}
                onClick={() => onChange(ativo ? valor.filter(x => x !== p.id) : [...valor, p.id])}>
                <Avatar nome={p.nome} foto={p.foto_url} size={20} />
                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                  <span style={{ display: 'block', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: 'var(--gray2)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email}</span>
                </span>
                {ativo && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--yellow)' }}>
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
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
