// ─────────────────────────────────────────────────────────────────────────────
//  Seção que abre e recolhe pelo título.
//
//  As três peças andam juntas: o gancho guarda a escolha, o título é o botão e o
//  corpo é o `.revelar` da casa, com o conteúdo sempre montado. Fora de onde a
//  seção recolhe (`ativo` falso), o título e o corpo saem sem embrulho nenhum, e
//  a tela fica como se este arquivo não existisse.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState, type ReactNode } from 'react';

const chaveDa = (nome: string) => `portal-sheep:secao-recolhida:${nome}`;

function recolhidaGuardada(chave: string): boolean {
  try {
    return localStorage.getItem(chave) === '1';
  } catch {
    // Navegador com armazenamento bloqueado: a seção nasce aberta.
    return false;
  }
}

/** A escolha fica no navegador, por seção e não por projeto: quem recolheu os
 *  objetivos para olhar o quadro segue assim ao passar para o projeto seguinte. */
export function useSecaoRecolhivel(nome: string, ativo = true) {
  const chave = chaveDa(nome);
  const [recolhida, setRecolhida] = useState(() => recolhidaGuardada(chave));

  const alternar = useCallback(() => {
    setRecolhida(atual => {
      const nova = !atual;
      try {
        if (nova) localStorage.setItem(chave, '1');
        else localStorage.removeItem(chave);
      } catch {
        // Sem armazenamento a escolha vale até recarregar a página.
      }
      return nova;
    });
  }, [chave]);

  return { aberta: !ativo || !recolhida, alternar };
}

/** O título como botão, com a seta que gira. Vai dentro do parágrafo de título
 *  da seção, que segue dando o tamanho e o peso da letra. */
export function TituloRecolhivel({ ativo = true, aberta, onAlternar, children }: {
  ativo?: boolean;
  aberta: boolean;
  onAlternar: () => void;
  children: ReactNode;
}) {
  if (!ativo) return <>{children}</>;
  return (
    <button type="button" className={`secao-toggle${aberta ? ' aberto' : ''}`}
      aria-expanded={aberta} onClick={onAlternar}>
      <span className="grupo-seta" aria-hidden="true" />
      {children}
    </button>
  );
}

/** O corpo da seção. A margem negativa da `.secao-corpo` dá folga para sombra e
 *  halo, que o `overflow: hidden` do `.revelar` cortaria rente à borda. */
export function CorpoRecolhivel({ ativo = true, aberta, children }: {
  ativo?: boolean;
  aberta: boolean;
  children: ReactNode;
}) {
  if (!ativo) return <>{children}</>;
  return (
    <div className={`revelar secao-corpo${aberta ? ' aberto' : ''}`}>
      <div>{children}</div>
    </div>
  );
}
