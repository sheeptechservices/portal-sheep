// ─────────────────────────────────────────────────────────────────────────────
//  Campo de senha, com o olho de mostrar e o sorteio.
//
//  Três lugares pedem o mesmo campo: o convite, o diálogo que troca a senha de
//  um convidado e a entrada por e-mail e senha. Senha digitada às cegas é erro
//  de digitação garantido - ainda mais quando ela foi passada por escrito para
//  outra pessoa -, então o olho anda junto do campo em todos eles.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import type React from 'react';
import { IconEye, IconEyeOff } from './icons';

/** Uma senha sorteada, para quem convida não ter de inventar uma. Sem letra
 *  parecida com número (l, I, O, 0), que vira erro de digitação de quem recebe
 *  a senha por escrito. */
export function sortearSenha(): string {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(14);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, n => alfabeto[n % alfabeto.length]).join('');
}

export function CampoSenha({
  valor, onMudar, placeholder, autoComplete = 'new-password', erro, comSorteio,
  campoRef, autoFocus, onKeyDown,
}: {
  valor: string;
  onMudar: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  /** Marca a moldura, sem escrever nada: a mensagem é de quem chama. */
  erro?: boolean;
  /** Oferece o sorteio. Só faz sentido para quem está *criando* a senha de
   *  outra pessoa - quem entra digita a que recebeu. */
  comSorteio?: boolean;
  campoRef?: React.RefObject<HTMLInputElement>;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [vendo, setVendo] = useState(false);
  return (
    <span className={`campo-senha${comSorteio ? ' com-sorteio' : ''}`}>
      <input
        ref={campoRef}
        className={`form-input${erro ? ' error' : ''}`}
        type={vendo ? 'text' : 'password'}
        value={valor}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        onChange={e => onMudar(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button type="button" className="campo-senha-olho"
        title={vendo ? 'Esconder a senha' : 'Ver a senha'}
        aria-label={vendo ? 'Esconder a senha' : 'Ver a senha'}
        onClick={() => setVendo(v => !v)}>
        {vendo ? <IconEyeOff size={14} /> : <IconEye size={14} />}
      </button>
      {comSorteio && (
        <button type="button" className="campo-senha-sortear" title="Sortear uma senha"
          onClick={() => { onMudar(sortearSenha()); setVendo(true); }}>
          Sortear
        </button>
      )}
    </span>
  );
}
