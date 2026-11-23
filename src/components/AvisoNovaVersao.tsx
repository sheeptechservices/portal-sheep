// ─────────────────────────────────────────────────────────────────────────────
//  O aviso de versão nova, no pé da tela.
//
//  Aparece quando a aba descobre que saiu outra versão (ver `novaVersao`) e
//  fica até a pessoa atualizar: pelo botão daqui ou pelo F5. Nada recarrega
//  sozinho. "Depois" esconde o aviso por uma hora, e ele volta; volta antes
//  se uma tela deixar de abrir por causa da versão nova, que é notícia nova.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, useSyncExternalStore } from 'react';
import { assinarVersao, atualizarAgora, estadoDaVersao, vigiarVersao } from '../lib/novaVersao';
import { useSaidaSuave } from '../lib/useSaidaSuave';
import { IconRefresh, IconX } from './icons';

/** Quanto tempo o "Depois" segura o aviso. */
const ADIAR_MS = 60 * 60_000;

export function AvisoNovaVersao() {
  const { nova, telaQuebrou } = useSyncExternalStore(assinarVersao, estadoDaVersao);
  const [adiadoAte, setAdiadoAte] = useState(0);
  const [, setRelogio] = useState(0);

  useEffect(() => { vigiarVersao(); }, []);

  // Passada a hora do "Depois", o aviso volta: um relógio só para redesenhar.
  useEffect(() => {
    if (!adiadoAte) return;
    const t = window.setTimeout(() => setRelogio(n => n + 1), Math.max(0, adiadoAte - Date.now()) + 50);
    return () => window.clearTimeout(t);
  }, [adiadoAte]);

  // Uma tela quebrou depois do "Depois": o aviso volta na hora.
  useEffect(() => { if (telaQuebrou) setAdiadoAte(0); }, [telaQuebrou]);

  if (!nova || adiadoAte > Date.now()) return null;
  return <Balao telaQuebrou={telaQuebrou} onAdiar={() => setAdiadoAte(Date.now() + ADIAR_MS)} />;
}

function Balao({ telaQuebrou, onAdiar }: { telaQuebrou: boolean; onAdiar: () => void }) {
  const { saindo, fechar } = useSaidaSuave(onAdiar);
  return (
    <div className={`aviso-versao${saindo ? ' saindo' : ''}`} role="status" aria-live="polite">
      <span className="aviso-versao-ico" aria-hidden="true"><IconRefresh size={16} /></span>
      <div className="aviso-versao-texto">
        <strong>Saiu uma versão nova do portal</strong>
        <span>
          {telaQuebrou
            ? 'Uma tela já precisa dela para abrir. Termine o que está fazendo e atualize.'
            : 'Nada muda até você atualizar: termine o que está fazendo e atualize quando quiser.'}
        </span>
      </div>
      <button type="button" className="btn btn-primary btn-sm aviso-versao-atualizar" onClick={atualizarAgora}>
        Atualizar agora
      </button>
      <button type="button" className="aviso-versao-depois" title="Lembrar daqui a uma hora"
        aria-label="Lembrar daqui a uma hora" onClick={fechar}>
        <IconX size={14} />
      </button>
    </div>
  );
}
